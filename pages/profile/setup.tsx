import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { supabase } from '../../lib/supabaseClient'

const DOMAINS = ['Health', 'Tech', 'Biology', 'Policy', 'Education', 'Environment', 'Finance']
const PROFILE_TYPES = ['Builder', 'Thinker', 'Coder', 'Researcher', 'Designer', 'Entrepreneur']

type Step = 'domain' | 'profile' | 'complete'

export default function ProfileSetup() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('domain')
  const [selectedDomains, setSelectedDomains] = useState<string[]>([])
  const [selectedProfileTypes, setSelectedProfileTypes] = useState<string[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const getUser = async () => {
      const { data } = await supabase.auth.getUser()
      if (data?.user?.id) {
        setUserId(data.user.id)
        setEmail(data.user.email || '')
      } else {
        router.push('/auth/signup')
      }
      setLoading(false)
    }
    getUser()
  }, [router])

  const toggleDomain = (domain: string) => {
    setSelectedDomains((prev) =>
      prev.includes(domain) ? prev.filter((d) => d !== domain) : [...prev, domain]
    )
  }

  const toggleProfileType = (profileType: string) => {
    setSelectedProfileTypes((prev) =>
      prev.includes(profileType)
        ? prev.filter((p) => p !== profileType)
        : [...prev, profileType]
    )
  }

  const handleNext = () => {
    if (step === 'domain' && selectedDomains.length > 0) {
      setStep('profile')
    } else if (step === 'profile' && selectedProfileTypes.length > 0) {
      handleSubmit()
    }
  }

  const handleSubmit = async () => {
    if (!userId || selectedProfileTypes.length === 0) {
      alert('Please select at least one profile type')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: userId,
          profile_type: selectedProfileTypes.join(','),
          domains: selectedDomains.join(','),
        }),
      })
      if (res.ok) {
        setStep('complete')
        setTimeout(() => router.push('/feed'), 1500)
      } else {
        const data = await res.json().catch(() => null)
        alert(data?.error || 'Failed to save profile')
      }
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <p className="text-white text-lg">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="absolute top-6 left-6 z-10">
        <Link
          href="/feed"
          className="rounded-lg border border-slate-500 bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
        >
          Back to feed
        </Link>
      </div>
      {/* Progress indicator */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-slate-700 z-50">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500"
          style={{
            width:
              step === 'domain' ? '33%' : step === 'profile' ? '66%' : '100%',
          }}
        />
      </div>

      {/* Main content */}
      <div className="flex items-center justify-center min-h-screen px-6">
        <div className="w-full max-w-2xl">
          {/* Domain Selection */}
          {step === 'domain' && (
            <div className="space-y-8 animate-fadeIn">
              <div className="text-center space-y-4">
                <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                  What are your focus areas?
                </h1>
                <p className="text-gray-300 text-lg">
                  Select one or more domains you&apos;re passionate about
                </p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {DOMAINS.map((domain) => (
                  <button
                    key={domain}
                    onClick={() => toggleDomain(domain)}
                    className={`p-6 rounded-lg font-semibold text-lg transition-all relative ${
                      selectedDomains.includes(domain)
                        ? 'bg-gradient-to-r from-blue-500 to-purple-500 shadow-lg shadow-blue-500/50'
                        : 'bg-slate-800 hover:bg-slate-700 border border-slate-600 hover:border-slate-500'
                    }`}
                  >
                    {selectedDomains.includes(domain) && (
                      <div className="absolute top-2 right-2 w-5 h-5 bg-white rounded-full flex items-center justify-center text-sm text-blue-600">
                        ✓
                      </div>
                    )}
                    {domain}
                  </button>
                ))}
              </div>

              <div className="text-center text-sm text-gray-400">
                Selected: {selectedDomains.length > 0 ? selectedDomains.join(', ') : 'None'}
              </div>

              <button
                onClick={handleNext}
                disabled={selectedDomains.length === 0}
                className="w-full py-4 rounded-lg font-semibold text-lg bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Continue
              </button>
            </div>
          )}

          {/* Profile Type Selection */}
          {step === 'profile' && (
            <div className="space-y-8 animate-fadeIn">
              <div className="text-center space-y-4">
                <h1 className="text-5xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent">
                  What are your roles?
                </h1>
                <p className="text-gray-300 text-lg">
                  Select one or more roles you play in innovation
                </p>
              </div>

              <div className="space-y-3">
                {PROFILE_TYPES.map((profileType) => (
                  <button
                    key={profileType}
                    onClick={() => toggleProfileType(profileType)}
                    className={`w-full p-6 rounded-lg text-left transition-all relative ${
                      selectedProfileTypes.includes(profileType)
                        ? 'bg-gradient-to-r from-purple-500 to-pink-500 shadow-lg shadow-purple-500/50'
                        : 'bg-slate-800 hover:bg-slate-700 border border-slate-600 hover:border-slate-500'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-semibold text-lg">{profileType}</div>
                        <div className="text-sm text-gray-300 mt-1">
                          {getProfileDescription(profileType)}
                        </div>
                      </div>
                      {selectedProfileTypes.includes(profileType) && (
                        <div className="w-5 h-5 bg-white rounded-full flex items-center justify-center text-sm text-purple-600 flex-shrink-0 mt-1">
                          ✓
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>

              <div className="text-center text-sm text-gray-400">
                Selected: {selectedProfileTypes.length > 0 ? selectedProfileTypes.join(', ') : 'None'}
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => setStep('domain')}
                  className="flex-1 py-4 rounded-lg font-semibold text-lg bg-slate-700 hover:bg-slate-600 transition-all"
                >
                  Back
                </button>
                <button
                  onClick={handleNext}
                  disabled={selectedProfileTypes.length === 0 || loading}
                  className="flex-1 py-4 rounded-lg font-semibold text-lg bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {loading ? 'Saving...' : 'Complete Setup'}
                </button>
              </div>
            </div>
          )}

          {/* Completion */}
          {step === 'complete' && (
            <div className="space-y-8 animate-fadeIn text-center">
              <div className="space-y-4">
                <div className="text-6xl mb-4">✨</div>
                <h1 className="text-5xl font-bold bg-gradient-to-r from-green-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
                  Welcome to Innovators!
                </h1>
                <p className="text-gray-300 text-lg">
                  Domains: <span className="text-blue-300 font-semibold">{selectedDomains.join(', ')}</span>
                </p>
                <p className="text-gray-300 text-lg">
                  Roles: <span className="text-purple-300 font-semibold">{selectedProfileTypes.join(', ')}</span>
                </p>
              </div>
              <div className="pt-4 space-y-2">
                <p className="text-gray-400">Redirecting to your feed...</p>
                <div className="flex justify-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" />
                  <div className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '0.1s' }} />
                  <div className="w-2 h-2 rounded-full bg-pink-400 animate-bounce" style={{ animationDelay: '0.2s' }} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.5s ease-out;
        }
      `}</style>
    </div>
  )
}

function getProfileDescription(type: string): string {
  const descriptions: Record<string, string> = {
    Builder: 'You turn ideas into products and make things happen',
    Thinker: 'You conceptualize solutions and drive innovation',
    Coder: 'You build technology and bring ideas to life',
    Researcher: 'You investigate deeply and provide evidence',
    Designer: 'You create beautiful and intuitive experiences',
    Entrepreneur: 'You lead ventures and drive growth',
  }
  return descriptions[type] || ''
}
