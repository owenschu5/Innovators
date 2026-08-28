import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'

export type AiMode = 'ask' | 'plan' | 'edit' | 'build' | 'debug'

export type AiRun = {
  id: string
  mode: AiMode
  prompt: string
  status: string
  answer?: string | null
  error?: string | null
  created_at: string
}

export type AiChangeSet = {
  id: string
  ai_run_id: string
  status: string
  summary?: string | null
}

export type AiFileChange = {
  id: string
  change_set_id: string
  file_id: string | null
  operation: 'create' | 'modify' | 'delete' | 'rename'
  original_path: string | null
  proposed_path: string | null
  base_version: number | null
  previous_content: string | null
  proposed_content: string | null
}

type Props = {
  open: boolean
  busy: boolean
  error: string
  runs: AiRun[]
  changeSets: AiChangeSet[]
  fileChanges: AiFileChange[]
  activeFileName?: string
  onToggle: () => void
  onSubmit: (mode: AiMode, prompt: string) => Promise<void>
  onAccept: (changeSetId: string) => Promise<void>
  onReject: (changeSetId: string) => Promise<void>
}

const modes: AiMode[] = ['ask', 'plan', 'edit', 'build', 'debug']
const examples = [
  'Create a reusable button component and use it on this page.',
  'Explain how authentication works in this project.',
  'Build a landing page for this project.',
  'Refactor this component.',
  'Fix the login error.',
]

const panelSurface = 'rounded-2xl border border-slate-800/80 bg-slate-900/80 shadow-xl shadow-slate-950/20 backdrop-blur'
const panelInset = 'rounded-xl border border-slate-800/80 bg-slate-950/70'
const aiField =
  'w-full rounded-xl border border-slate-700/80 bg-slate-950/80 p-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-teal-400 focus:ring-1 focus:ring-teal-400'
const aiPrimary =
  'rounded-xl bg-teal-500 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-60'
const aiSecondary =
  'rounded-xl border border-slate-700/80 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60'
const aiPill = 'rounded-full border border-slate-700/80 bg-slate-950/70 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400'

function diffStats(change: AiFileChange) {
  const before = (change.previous_content || '').split('\n')
  const after = (change.proposed_content || '').split('\n')
  if (change.operation === 'create') return `+${after.length}`
  if (change.operation === 'delete') return `-${before.length}`
  let added = 0
  let removed = 0
  const beforeSet = new Map<string, number>()
  before.forEach((line) => beforeSet.set(line, (beforeSet.get(line) || 0) + 1))
  after.forEach((line) => {
    const count = beforeSet.get(line) || 0
    if (count) beforeSet.set(line, count - 1)
    else added += 1
  })
  beforeSet.forEach((count) => {
    removed += count
  })
  return `+${added} -${removed}`
}

export default function BuildWithAiPanel({
  open,
  busy,
  error,
  runs,
  changeSets,
  fileChanges,
  activeFileName,
  onToggle,
  onSubmit,
  onAccept,
  onReject,
}: Props) {
  const [mode, setMode] = useState<AiMode>('build')
  const [prompt, setPrompt] = useState('')
  const [selectedChangeId, setSelectedChangeId] = useState<string | null>(null)

  const latestRun = runs[0] || null
  const latestChangeSet = useMemo(() => {
    if (!latestRun) return null
    return changeSets.find((changeSet) => changeSet.ai_run_id === latestRun.id) || null
  }, [changeSets, latestRun])
  const latestFileChanges = useMemo(() => {
    if (!latestChangeSet) return []
    return fileChanges.filter((change) => change.change_set_id === latestChangeSet.id)
  }, [fileChanges, latestChangeSet])
  const selectedChange = latestFileChanges.find((change) => change.id === selectedChangeId) || latestFileChanges[0] || null

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!prompt.trim()) return
    await onSubmit(mode, prompt.trim())
    setPrompt('')
    setSelectedChangeId(null)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="fixed bottom-5 right-5 rounded-full bg-teal-400 px-4 py-3 text-sm font-semibold text-slate-950 shadow-xl shadow-teal-950/30 transition hover:bg-teal-300"
      >
        Build with AI
      </button>
    )
  }

  return (
    <aside className={`${panelSurface} flex min-h-[520px] min-w-0 flex-col overflow-hidden`}>
      <div className="border-b border-slate-800/80 bg-slate-950/40 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-300">Build with AI</p>
            <p className="mt-1 text-xs text-slate-500">{activeFileName ? `Active: ${activeFileName}` : 'Project-aware coding agent'}</p>
          </div>
          <button type="button" onClick={onToggle} className="rounded-full border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm text-slate-400 transition hover:border-slate-700 hover:bg-slate-800 hover:text-slate-200">
            Close
          </button>
        </div>

        <div className="mt-4 grid grid-cols-5 gap-1 rounded-full border border-slate-800/80 bg-slate-950/70 p-1">
          {modes.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setMode(item)}
              className={`rounded-full px-2 py-1.5 text-xs font-semibold uppercase transition ${
                mode === item ? 'bg-teal-400 text-slate-950' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {error ? <div className="mb-3 rounded-xl border border-rose-900/80 bg-rose-950/60 p-3 text-sm text-rose-200">{error}</div> : null}

        {latestRun ? (
          <div className={`${panelInset} mb-4 p-3`}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-100">{latestRun.mode.toUpperCase()} run</p>
              <span className={aiPill}>{latestRun.status}</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-400">{latestRun.prompt}</p>
            {latestRun.answer ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-200">{latestRun.answer}</p> : null}
            {latestRun.error ? <p className="mt-3 text-sm text-rose-300">{latestRun.error}</p> : null}
          </div>
        ) : null}

        {latestChangeSet ? (
          <div className={`${panelInset} mb-4 p-3`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-100">Review changes</p>
                <p className="mt-1 text-xs text-slate-400">{latestChangeSet.summary || 'AI proposed workspace changes.'}</p>
              </div>
              <span className={aiPill}>{latestChangeSet.status}</span>
            </div>

            <div className="mt-3 space-y-2">
              {latestFileChanges.map((change) => (
                <button
                  key={change.id}
                  type="button"
                  onClick={() => setSelectedChangeId(change.id)}
                  className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                    selectedChange?.id === change.id ? 'border-teal-400/60 bg-teal-400/10' : 'border-slate-800 bg-slate-950/70 hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-slate-100">{change.proposed_path || change.original_path || 'Untitled'}</span>
                    <span className="text-xs text-teal-300">{diffStats(change)}</span>
                  </div>
                  <p className="mt-1 text-xs uppercase text-slate-500">{change.operation}</p>
                </button>
              ))}
            </div>

            {selectedChange ? (
              <div className="mt-3 overflow-hidden rounded-xl border border-slate-800/80">
                <div className="grid grid-cols-2 border-b border-slate-800 bg-slate-950/80 text-xs font-semibold uppercase text-slate-500">
                  <div className="border-r border-slate-800 px-3 py-2">Current</div>
                  <div className="px-3 py-2">Proposed</div>
                </div>
                <div className="grid max-h-72 grid-cols-2 overflow-auto bg-slate-950/80 text-xs leading-5 text-slate-300">
                  <pre className="overflow-auto whitespace-pre-wrap border-r border-slate-800 p-3">{selectedChange.previous_content || ''}</pre>
                  <pre className="overflow-auto whitespace-pre-wrap p-3">{selectedChange.proposed_content || ''}</pre>
                </div>
              </div>
            ) : null}

            {latestChangeSet.status === 'review_required' ? (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onAccept(latestChangeSet.id)}
                  className={`${aiPrimary} flex-1`}
                >
                  Accept All
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onReject(latestChangeSet.id)}
                  className={aiSecondary}
                >
                  Reject
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className={`${panelInset} p-3`}>
          <p className="text-sm font-semibold text-slate-100">Progress</p>
          <div className="mt-3 space-y-2 text-xs text-slate-400">
            <p>{busy ? 'Active: inspecting project and generating response' : 'Ready'}</p>
            <p>{latestFileChanges.length ? `Changes ready: ${latestFileChanges.length} file(s)` : 'No pending changes'}</p>
          </div>
        </div>
      </div>

      <form onSubmit={submit} className="border-t border-slate-800/80 bg-slate-950/40 p-4">
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={4}
          className={`${aiField} resize-none`}
          placeholder="What do you want to build?"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          {examples.slice(0, 3).map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setPrompt(example)}
              className="rounded-full border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs text-slate-400 transition hover:border-slate-700 hover:bg-slate-800 hover:text-slate-200"
            >
              {example}
            </button>
          ))}
        </div>
        <button
          type="submit"
          disabled={busy || !prompt.trim()}
          className={`${aiPrimary} mt-3 w-full`}
        >
          {busy ? 'Working...' : mode === 'ask' ? 'Ask AI' : 'Start'}
        </button>
      </form>
    </aside>
  )
}
