import type { NextApiRequest, NextApiResponse } from 'next'
import { supabase } from '../../lib/supabaseClient'

async function getAuthenticatedUser(req: NextApiRequest) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data } = await supabase.auth.getUser(token)
  return data.user || null
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthenticatedUser(req)
  if (!user) return res.status(401).json({ error: 'Authentication required' })

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('idea_group_members')
      .select('*, group:idea_groups(id, name, summary, status, idea_id)')
      .eq('member_email', (user.email || '').toLowerCase())
      .eq('invitation_status', 'invited')
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ invitations: data || [] })
  }

  if (req.method === 'PATCH') {
    const { id, response } = req.body as { id?: string; response?: 'accepted' | 'declined' }
    if (!id || !['accepted', 'declined'].includes(response || '')) {
      return res.status(400).json({ error: 'Choose accepted or declined.' })
    }
    const { data: invitation, error: findError } = await supabase
      .from('idea_group_members')
      .select('*')
      .eq('id', id)
      .eq('member_email', (user.email || '').toLowerCase())
      .eq('invitation_status', 'invited')
      .single()
    if (findError || !invitation) return res.status(404).json({ error: 'Invitation not found or no longer active' })
    const { data, error } = await supabase
      .from('idea_group_members')
      .update({ invitation_status: response, user_id: response === 'accepted' ? user.id : null, responded_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single()
    if (error) return res.status(500).json({ error: error.message })
    await supabase.from('project_activities').insert({ group_id: invitation.group_id, actor_id: user.id, event_type: `invitation_${response}` })
    return res.status(200).json({ invitation: data })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
