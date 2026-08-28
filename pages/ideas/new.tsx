import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabaseClient'
import Link from 'next/link'

export default function NewIdea() {
  const router = useRouter()
  const [userId, setUserId] = useState<string>('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [problemStatement, setProblemStatement] = useState('')
  const [goals, setGoals] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }
      setUserId(user.id)
    }

    checkAuth()
  }, [router])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      setError('Title is required')
      return
    }

    setLoading(true)
    setError('')

    try {
      const payload = {
        creator_id: userId,
        title: title.trim(),
        description: description.trim(),
        problem_statement: problemStatement.trim(),
        goals: goals.trim(),
      }

      const resp = await fetch('/api/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (resp.ok) {
        const json = await resp.json()
        router.push(`/ideas/${json.idea.id}`)
      } else {
        setError('Failed to create idea')
      }
    } catch (e) {
      console.error(e)
      setError('Error creating idea')
    } finally {
      setLoading(false)
    }
  }

  if (!userId) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <p>Loading...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white rounded-lg shadow-md p-8">
          <h1 className="text-3xl font-bold mb-2">Share Your Idea</h1>
          <p className="text-gray-600 mb-8">Help us innovate by sharing your thoughts, problems, or solutions</p>

          {error && (
            <div className="mb-6 p-4 bg-red-100 text-red-700 rounded-lg">
              {error}
            </div>
          )}

          <form onSubmit={submit} className="space-y-6">
            {/* Title */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Idea Title <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Give your idea a compelling title"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                required
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Description
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Describe your idea in more detail. What's the core concept?"
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition resize-none"
              />
            </div>

            {/* Problem Statement */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Problem Statement
              </label>
              <textarea
                value={problemStatement}
                onChange={e => setProblemStatement(e.target.value)}
                placeholder="What problem does this idea address? Who is affected?"
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition resize-none"
              />
            </div>

            {/* Goals */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Goals & Outcomes
              </label>
              <textarea
                value={goals}
                onChange={e => setGoals(e.target.value)}
                placeholder="What are you trying to achieve? What would success look like?"
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition resize-none"
              />
            </div>

            {/* Submit */}
            <div className="flex gap-4 pt-4">
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:shadow-lg disabled:opacity-50 transition font-medium"
              >
                {loading ? 'Creating...' : '🚀 Publish Idea'}
              </button>
              <Link
                href="/feed"
                className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition font-medium"
              >
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
    </main>
  )
}
