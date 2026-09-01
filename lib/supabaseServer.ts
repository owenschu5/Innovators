import { createClient } from '@supabase/supabase-js'
import type { NextApiRequest } from 'next'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'anon'

function bearerToken(req: NextApiRequest) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim()
  if (!token) throw new Error('Authentication required')
  return token
}

export async function authenticatedSupabase(req: NextApiRequest) {
  const token = bearerToken(req)
  const db = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await db.auth.getUser(token)
  if (error || !data.user) throw new Error('Authentication required')
  return { db, user: data.user }
}
