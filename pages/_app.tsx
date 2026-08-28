import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { supabase } from '../lib/supabaseClient'

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [email, setEmail] = useState<string>('')

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
        const { id, email } = session.user
        setUser(id)
        setEmail(email || '')
        try {
          await fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, email }),
          })

          // Check if user has completed profile setup
          const resp = await fetch(`/api/users?id=${id}`)
          if (resp.ok) {
            const json = await resp.json()
            const profile = json.user?.profile_type
            // If no profile_type, redirect to setup
            if (!profile && router.pathname !== '/profile/setup') {
              router.push('/profile/setup')
            }
          }
        } catch (e) {
          console.error('Auth setup error:', e)
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null)
        setEmail('')
      }
    })

    return () => {
      data.subscription?.unsubscribe()
    }
  }, [router])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setEmail('')
    router.push('/')
  }

  return (
    <div className="min-h-screen flex flex-col">
      {user && (
        <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3 sm:px-8">
            <Link href="/feed" className="flex items-center gap-2 font-semibold tracking-tight text-slate-900">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-teal-700 text-sm text-white">i</span>
              innovators
            </Link>
            <div className="flex items-center gap-1 sm:gap-2">
              <Link href="/feed" className="hidden rounded-full px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 sm:block">Feed</Link>
              <Link href="/profile" className="rounded-full px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100">
                Profile
              </Link>
              <button
                onClick={handleLogout}
                className="rounded-full px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Logout
              </button>
            </div>
          </div>
        </header>
      )}
      <div className="flex-1">
        <Component {...pageProps} />
      </div>
    </div>
  )
}
