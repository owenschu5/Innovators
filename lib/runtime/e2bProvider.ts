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

const staticServer = `const http=require('http'),fs=require('fs'),path=require('path');const root=process.cwd();http.createServer((req,res)=>{const url=decodeURIComponent((req.url||'/').split('?')[0]);const target=path.resolve(root,'.'+(url==='/'?'/index.html':url));if(!target.startsWith(root+path.sep)){res.writeHead(403);return res.end('Forbidden')}fs.readFile(target,(err,data)=>{if(err){res.writeHead(404);return res.end('Not found')}const ext=path.extname(target);const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml'};res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream'});res.end(data)})}).listen(3000,'0.0.0.0')`

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
      await sandbox.files.write(manifest.files.map((file) => ({ path: `/home/oai/share/${file.path}`, data: file.content })))
      if (project.kind === 'static') await sandbox.files.write('/home/oai/share/.innovators-static-server.cjs', staticServer)
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
        const started = await sandbox.commands.run('npm run dev -- --host 0.0.0.0 --port 3000', { cwd: '/home/oai/share', background: true, timeoutMs: START_TIMEOUT_MS })
        await waitForPort(sandbox)
        logs = `${logs}\n${commandOutput(started)}`.trim()
      } catch (error) { throw new RuntimeProviderError('start server', error) }
    } else {
      try {
        await onStatus?.('starting')
        const started = await sandbox.commands.run('node .innovators-static-server.cjs', { cwd: '/home/oai/share', background: true, timeoutMs: START_TIMEOUT_MS })
        await waitForPort(sandbox)
        logs = commandOutput(started)
      } catch (error) { throw new RuntimeProviderError('start server', error) }
    }
    let previewUrl: string
    try { previewUrl = sandbox.getHost(project.port) } catch (error) { throw new RuntimeProviderError('obtain preview URL', error) }
    if (!/^https:\/\//.test(previewUrl)) throw new Error('Preview endpoint was unavailable.')
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
