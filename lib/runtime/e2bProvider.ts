import type { DetectedProject, RuntimeManifest } from './types'

const RUNTIME_TIMEOUT_MS = 15 * 60 * 1000
const INSTALL_TIMEOUT_MS = 90 * 1000
const START_TIMEOUT_MS = 30 * 1000

function configuredKey() {
  const key = process.env.E2B_API_KEY
  if (!key) throw new Error('Runtime previews are not configured. Set E2B_API_KEY on the trusted application server.')
  return key
}

function commandOutput(result: any) {
  return [result?.stdout, result?.stderr].filter(Boolean).join('\n').slice(-12000)
}

export async function createE2bRuntime(manifest: RuntimeManifest, project: DetectedProject, onStatus?: (status: 'syncing_files' | 'installing' | 'starting') => Promise<void>) {
  const { Sandbox } = await import('e2b')
  const sandbox: any = await Sandbox.create({ apiKey: configuredKey(), timeoutMs: RUNTIME_TIMEOUT_MS })
  try {
    await onStatus?.('syncing_files')
    await sandbox.files.write(manifest.files.map((file) => ({ path: `/home/oai/share/${file.path}`, data: file.content })))
    let logs = ''
    if (project.kind === 'vite') {
      await onStatus?.('installing')
      const installed = await sandbox.commands.run('npm install --ignore-scripts --no-audit --no-fund', { cwd: '/home/oai/share', timeoutMs: INSTALL_TIMEOUT_MS })
      logs = commandOutput(installed)
      if (installed.exitCode !== 0) throw new Error('Dependency installation failed.')
      await onStatus?.('starting')
      const started = await sandbox.commands.run('npm run dev -- --host 0.0.0.0 --port 3000', { cwd: '/home/oai/share', background: true, timeoutMs: START_TIMEOUT_MS })
      logs = `${logs}\n${commandOutput(started)}`.trim()
    } else {
      await onStatus?.('starting')
      const started = await sandbox.commands.run('python3 -m http.server 3000 --bind 0.0.0.0', { cwd: '/home/oai/share', background: true, timeoutMs: START_TIMEOUT_MS })
      logs = commandOutput(started)
    }
    const previewUrl = sandbox.getHost(project.port)
    if (!/^https:\/\//.test(previewUrl)) throw new Error('Preview endpoint was unavailable.')
    return { providerRuntimeId: sandbox.sandboxId as string, previewUrl, logs: logs.slice(-12000) }
  } catch (error) {
    await sandbox.kill().catch(() => undefined)
    throw error
  }
}

export async function stopE2bRuntime(providerRuntimeId: string) {
  const { Sandbox } = await import('e2b')
  const sandbox: any = await Sandbox.connect(providerRuntimeId, { apiKey: configuredKey() })
  await sandbox.kill()
}
