import type { DetectedProject, RuntimeManifest } from './types'

const RUNTIME_TIMEOUT_MS = 15 * 60 * 1000
const INSTALL_TIMEOUT_MS = 90 * 1000
const START_TIMEOUT_MS = 30 * 1000

export type RuntimeStartStage = 'create sandbox' | 'upload files' | 'install dependencies' | 'start server' | 'obtain preview URL'

export class RuntimeProviderError extends Error {
  readonly code: unknown
  readonly status: unknown
  constructor(readonly stage: RuntimeStartStage, cause: unknown) {
    super(cause instanceof Error ? cause.message : 'Provider request failed')
    this.name = 'RuntimeProviderError'
    this.code = (cause as any)?.code
    this.status = (cause as any)?.status || (cause as any)?.response?.status
  }
}

const workspaceDirectory = '/home/oai/share'
const staticServerPath = '/tmp/innovators-static-server.cjs'
const staticServer = `const http=require('http');const fs=require('fs');const path=require('path');const root=path.resolve(process.argv[2]);const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'};const server=http.createServer((req,res)=>{let pathname;try{pathname=decodeURIComponent((req.url||'/').split('?')[0])}catch{res.writeHead(400);return res.end('Bad request')}const target=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!target.startsWith(root+path.sep)){res.writeHead(403);return res.end('Forbidden')}fs.readFile(target,(err,data)=>{if(err){res.writeHead(404);return res.end('Not found')}res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream'});res.end(data)})});server.on('error',error=>{console.error(error.message);process.exit(1)});server.listen(3000,'0.0.0.0')`

export function assertE2bConfigured() {
  const key = process.env.E2B_API_KEY
  if (!key) throw new Error('Runtime previews are not configured. Set E2B_API_KEY on the trusted application server.')
  return key
}

function commandOutput(result: any) {
  return [result?.stdout, result?.stderr].filter(Boolean).join('\n').slice(-12000)
}

export async function createE2bRuntime(manifest: RuntimeManifest, project: DetectedProject, onStatus?: (status: 'syncing_files' | 'installing' | 'starting') => Promise<void>) {
  const apiKey = assertE2bConfigured()
  let sandbox: any
  try {
    const { Sandbox } = await import('e2b')
    sandbox = await Sandbox.create({ apiKey, timeoutMs: RUNTIME_TIMEOUT_MS })
  } catch (error) {
    throw new RuntimeProviderError('create sandbox', error)
  }
  try {
    try {
      await onStatus?.('syncing_files')
      await sandbox.files.write(manifest.files.map((file) => ({ path: `${workspaceDirectory}/${file.path}`, data: file.content })))
      if (project.kind === 'static') await sandbox.files.write(staticServerPath, staticServer)
    } catch (error) { throw new RuntimeProviderError('upload files', error) }
    let logs = ''
    if (project.kind === 'vite') {
      let installed: any
      try {
        await onStatus?.('installing')
        installed = await sandbox.commands.run('npm install --ignore-scripts --no-audit --no-fund', { cwd: '/home/oai/share', timeoutMs: INSTALL_TIMEOUT_MS })
      } catch (error) { throw new RuntimeProviderError('install dependencies', error) }
      logs = commandOutput(installed)
      if (installed.exitCode !== 0) throw new Error('Dependency installation failed.')
      try {
        await onStatus?.('starting')
        const started = await sandbox.commands.run('npm run dev -- --host 0.0.0.0 --port 3000', { cwd: workspaceDirectory, background: true, timeoutMs: START_TIMEOUT_MS })
        await waitForPort(sandbox)
        logs = `${logs}\n${commandOutput(started)}`.trim()
      } catch (error) { throw new RuntimeProviderError('start server', error) }
    } else {
      try {
        await onStatus?.('starting')
        const indexExists = await sandbox.files.exists(`${workspaceDirectory}/index.html`)
        const started = await sandbox.commands.run(`node ${staticServerPath} ${workspaceDirectory}`, { cwd: workspaceDirectory, background: true, timeoutMs: START_TIMEOUT_MS })
        const probe = await waitForHttp(sandbox)
        const processRunning = started.exitCode === undefined
        if (!indexExists || !processRunning || !probe.ready) {
          console.error('[runtime:static] server unavailable', {
            workspaceDirectory,
            indexExists,
            command: `node ${staticServerPath} ${workspaceDirectory}`,
            processRunning,
            probeStatus: probe.status,
            stdout: boundedOutput(started.stdout),
            stderr: boundedOutput(started.stderr),
          })
          throw new Error('Static preview server did not become available.')
        }
        logs = commandOutput(started)
      } catch (error) { throw new RuntimeProviderError('start server', error) }
    }
    let previewUrl: string
    try { previewUrl = `https://${sandbox.getHost(project.port)}` } catch (error) { throw new RuntimeProviderError('obtain preview URL', error) }
    return { providerRuntimeId: sandbox.sandboxId as string, previewUrl, logs: logs.slice(-12000) }
  } catch (error) {
    await sandbox.kill().catch(() => undefined)
    throw error
  }
}

export async function stopE2bRuntime(providerRuntimeId: string) {
  const { Sandbox } = await import('e2b')
  const sandbox: any = await Sandbox.connect(providerRuntimeId, { apiKey: assertE2bConfigured() })
  await sandbox.kill()
}

async function waitForPort(sandbox: any) {
  const probe = "node -e \"const n=require('net');let i=0;const check=()=>{const s=n.connect(3000,'127.0.0.1');s.on('connect',()=>{s.end();process.exit(0)});s.on('error',()=>{if(++i>=30)process.exit(1);setTimeout(check,1000)})};check()\""
  const result = await sandbox.commands.run(probe, { cwd: '/home/oai/share', timeoutMs: START_TIMEOUT_MS })
  if (result.exitCode !== 0) throw new Error('Server did not begin listening on port 3000.')
}

async function waitForHttp(sandbox: any) {
  const probe = "node -e \"require('http').get('http://127.0.0.1:3000/',res=>{res.resume();process.exit(res.statusCode===200?0:1)}).on('error',()=>process.exit(1))\""
  let status = 'not ready'
  for (const delay of [250, 500, 1000, 1000, 1000, 1000, 1000, 1000, 1000]) {
    await new Promise((resolve) => setTimeout(resolve, delay))
    const result = await sandbox.commands.run(probe, { cwd: workspaceDirectory, timeoutMs: 3000 })
    status = result.exitCode === 0 ? 'HTTP 200' : `probe exit ${result.exitCode ?? 'unknown'}`
    if (result.exitCode === 0) return { ready: true, status }
  }
  return { ready: false, status }
}

function boundedOutput(value: unknown) {
  return String(value || '').replace(/(?:E2B_API_KEY|SUPABASE_SERVICE_ROLE_KEY|OPENAI_API_KEY|Authorization)\s*[=:]\s*\S+/gi, '[redacted]').slice(-2000)
}
