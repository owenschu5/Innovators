import type { NextApiRequest, NextApiResponse } from 'next'
import { supabase } from '../../lib/supabaseClient'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const { id } = req.query
      if (!id) return res.status(400).json({ error: 'Missing id' })
      const { data, error } = await supabase.from('users').select('*').eq('id', id).single()
      if (error) {
        console.error('GET user error:', error)
        return res.status(500).json({ error: error.message })
      }
      return res.status(200).json({ user: data })
    }

    if (req.method === 'POST') {
      const { id, email, profile_type, domains, skills, availability_status, weekly_availability } = req.body
      if (!id || !email) return res.status(400).json({ error: 'Missing id or email' })

      // Sign-in only needs to ensure the user record exists. Do not send null
      // profile values here, because upsert would overwrite saved preferences.
      const user = {
        id,
        email,
        ...(profile_type !== undefined ? { profile_type } : {}),
        ...(domains !== undefined ? { domains } : {}),
        ...(skills !== undefined ? { skills } : {}),
        ...(availability_status !== undefined ? { availability_status } : {}),
        ...(weekly_availability !== undefined ? { weekly_availability } : {}),
      }

      const { data, error } = await supabase
        .from('users')
        .upsert(user)
        .select()
      if (error) {
        console.error('POST user error:', error)
        return res.status(500).json({ error: error.message })
      }
      return res.status(200).json({ user: data })
    }

    if (req.method === 'PATCH') {
      const { id, profile_type, domains, skills, availability_status, weekly_availability } = req.body
      if (!id) return res.status(400).json({ error: 'Missing id' })

      const updates = {
        ...(profile_type !== undefined ? { profile_type: profile_type || null } : {}),
        ...(domains !== undefined ? { domains: domains || null } : {}),
        ...(skills !== undefined ? { skills: skills || null } : {}),
        ...(availability_status !== undefined ? { availability_status: availability_status || 'open' } : {}),
        ...(weekly_availability !== undefined ? { weekly_availability: weekly_availability || null } : {}),
      }
      const { data, error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', id)
        .select()
      if (error) {
        console.error('PATCH user error:', error)
        return res.status(500).json({ error: error.message })
      }
      return res.status(200).json({ user: data?.[0] })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('Unexpected error in /api/users:', err)
    return res.status(500).json({ error: String(err) })
  }
}
