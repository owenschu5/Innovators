import type { DetectedProject, RuntimeFile } from './types'

export function detectProject(files: RuntimeFile[]): DetectedProject {
  const byPath = new Map(files.map((file) => [file.path, file.content]))
  const packageJson = byPath.get('package.json')
  if (!packageJson) {
    if (byPath.has('index.html')) return { kind: 'static', port: 3000 }
    throw new Error('No supported runnable project detected. Phase 1 supports static index.html projects and Vite frontend projects.')
  }

  let parsed: { scripts?: Record<string, unknown>; dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown> }
  try {
    parsed = JSON.parse(packageJson)
  } catch {
    throw new Error('package.json is not valid JSON.')
  }
  const dependencies = { ...(parsed.dependencies || {}), ...(parsed.devDependencies || {}) }
  const devScript = parsed.scripts?.dev
  if (typeof devScript !== 'string' || devScript.trim() !== 'vite' || typeof dependencies.vite !== 'string') {
    throw new Error('No supported runnable project detected. Phase 1 supports static index.html projects and Vite frontend projects.')
  }
  return { kind: 'vite', port: 3000 }
}
