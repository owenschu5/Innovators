import { supabase } from '../../lib/supabaseClient'

export default function Signup() {
  const handleGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/feed`,
      },
    })

    if (error) {
      console.error('Google sign-up could not be started:', error)
      alert('Google sign-up could not be started. Please try again.')
    }
  }

  return (
    <main className="max-w-2xl mx-auto p-6">
      <h2 className="text-2xl font-semibold mb-4">Sign up</h2>
      <p className="mb-4">Create an account with Google</p>
      <button
        onClick={handleGoogle}
        className="px-4 py-2 bg-blue-600 text-white rounded"
      >
        Continue with Google
      </button>
    </main>
  )
}
