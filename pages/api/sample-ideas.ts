import type { NextApiRequest, NextApiResponse } from 'next'
import { supabase } from '../../lib/supabaseClient'
import { sampleCategories, sampleIdeas } from '../../lib/sampleIdeas'
import { getAdminSessionFromRequest } from '../../lib/adminAuth'

const SAMPLE_EMAIL_SUFFIX = '@sample.innovators.local'
const SAMPLE_USER_IDS = sampleCategories.map((_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`)

function sampleEmail(category: string) {
  return `${category.toLowerCase().replace(/[^a-z0-9]+/g, '.')}${SAMPLE_EMAIL_SUFFIX}`
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    const sampleUsers = sampleCategories.map((category, index) => ({
      id: SAMPLE_USER_IDS[index],
      email: sampleEmail(category),
      profile_type: `Sample contributor, ${category}`,
    }))
    const { error: usersError } = await supabase.from('users').upsert(sampleUsers, { onConflict: 'id' })
    if (usersError) return res.status(500).json({ error: usersError.message })

    const { data: existing, error: existingError } = await supabase
      .from('ideas')
      .select('title')
      .in('creator_id', SAMPLE_USER_IDS)
    if (existingError) return res.status(500).json({ error: existingError.message })

    const existingTitles = new Set(((existing || []) as Array<{ title: string }>).map(idea => idea.title))
    const ideasToInsert = sampleIdeas
      .filter(idea => !existingTitles.has(idea.title))
      .map(idea => ({
        creator_id: SAMPLE_USER_IDS[sampleCategories.indexOf(idea.category)],
        title: idea.title,
        description: idea.description,
        problem_statement: idea.problem,
        status: idea.status,
      }))

    if (ideasToInsert.length) {
      const { error: insertError } = await supabase.from('ideas').insert(ideasToInsert)
      if (insertError) return res.status(500).json({ error: insertError.message })
    }
    return res.status(200).json({ created: ideasToInsert.length, total: sampleIdeas.length })
  }

  if (req.method === 'DELETE') {
    if (!getAdminSessionFromRequest(req)) {
      return res.status(403).json({ error: 'Only an administrator can delete ideas.' })
    }

    const { id } = req.query
    if (typeof id !== 'string') return res.status(400).json({ error: 'Missing sample idea id' })
    const { data: idea, error: findError } = await supabase
      .from('ideas')
      .select('id, creator_id, title')
      .eq('id', id)
      .single()
    if (findError || !idea || !SAMPLE_USER_IDS.includes(idea.creator_id) || !idea.title.startsWith('[Sample]')) {
      return res.status(404).json({ error: 'Sample idea not found' })
    }
    const { error: deleteError } = await supabase.from('ideas').delete().eq('id', id)
    if (deleteError) return res.status(500).json({ error: deleteError.message })
    return res.status(200).json({ deleted: id })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
