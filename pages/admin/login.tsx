import type { GetServerSideProps } from 'next'
import { useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { getAdminSessionFromCookieHeader } from '../../lib/adminAuth'

export default function AdminLogin() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Unable to log in as admin')
      }

      router.push('/admin/requests')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to log in as admin')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#09111d_0%,#111827_45%,#020617_100%)] px-6 py-16 text-white">
      <div className="mx-auto max-w-md rounded-[2rem] border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur">
        <p className="text-sm uppercase tracking-[0.24em] text-cyan-300">Admin access</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">Project intake console</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          This login is separate from the member experience and opens the request review
          dashboard only.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-200">Admin username</span>
            <input
              type="text"
              value={username}
              onChange={event => setUsername(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
              placeholder="Enter admin username"
              required
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-200">Password</span>
            <input
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
              placeholder="Enter admin password"
              required
            />
          </label>

          {error && (
            <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? 'Signing in...' : 'Open admin dashboard'}
          </button>
        </form>

        <div className="mt-6 text-sm text-slate-400">
          <Link href="/" className="text-cyan-300 hover:text-cyan-200">
            Return to the main platform
          </Link>
        </div>
      </div>
    </main>
  )
}

export const getServerSideProps: GetServerSideProps = async ({ req }) => {
  const session = getAdminSessionFromCookieHeader(req.headers.cookie)

  if (session) {
    return {
      redirect: {
        destination: '/admin/requests',
        permanent: false,
      },
    }
  }

  return { props: {} }
}
