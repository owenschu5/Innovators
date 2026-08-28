import type { NextApiRequest, NextApiResponse } from 'next'
import { supabase } from '../../lib/supabaseClient'
import { getAdminSessionFromRequest } from '../../lib/adminAuth'

type IdeaRow = {
  id: string
  title: string
  description: string | null
  status: string | null
  created_at: string
  last_activity: string | null
  creator_id: string
  domain_id: number | null
}

type CreatorRow = {
  id: string
  email: string
  profile_type: string | null
  domains: string | null
}

type CommentRow = {
  idea_id: string
}

type ForkRow = {
  original_idea_id: string
}

type RoleNeedRow = {
  idea_id: string | null
  role: string
  desired_count: number | null
}

function isMissingProjectNeedsError(error: { message?: string; code?: string } | null) {
  if (!error) return false
  return (
    error.code === '42P01' ||
    error.message?.includes("Could not find the table 'public.project_role_needs'") ||
    error.message?.includes("Could not find the 'project_role_needs'") ||
    error.message?.includes('schema cache')
  )
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const { id } = req.query
    if (id) {
      const { data, error } = await supabase.from('ideas').select('id, title, description, problem_statement, goals, evidence, status, created_at, last_activity, creator_id, domain_id').eq('id', id).single()
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ idea: data })
    }

    try {
      // Get ideas with creator info and comment count
      const { data: ideas, error } = await supabase
        .from('ideas')
        .select('id, title, description, status, created_at, last_activity, creator_id, domain_id')
        .order('created_at', { ascending: false })
      
      if (error) {
        console.error('Ideas fetch error:', error)
        return res.status(500).json({ error: error.message })
      }

      // Get creator emails for all ideas
      const creatorIds = [...new Set(((ideas || []) as IdeaRow[]).map((idea: IdeaRow) => idea.creator_id))]
      let creators: Record<string, CreatorRow> = {}
      
      if (creatorIds.length > 0) {
        const { data: creatorData, error: creatorError } = await supabase
          .from('users')
          .select('id, email, profile_type, domains')
          .in('id', creatorIds)
        
        if (creatorError) {
          console.error('Creators fetch error:', creatorError)
        }
        
        if (creatorData) {
          creators = Object.fromEntries(
            (creatorData as CreatorRow[]).map((creator: CreatorRow) => [creator.id, creator])
          )
        }
      }

      // Get comment counts for all ideas
      let commentCounts: Record<string, number> = {}
      if (ideas && ideas.length > 0) {
        const { data: comments, error: commentsError } = await supabase
          .from('idea_comments')
          .select('idea_id')
          .in('idea_id', (ideas as IdeaRow[]).map((idea: IdeaRow) => idea.id))
        
        if (commentsError) {
          console.error('Comments fetch error:', commentsError)
        }
        
        if (comments) {
          commentCounts = (comments as CommentRow[]).reduce((acc: Record<string, number>, comment: CommentRow) => {
            acc[comment.idea_id] = (acc[comment.idea_id] || 0) + 1
            return acc
          }, {})
        }
      }

      // Get fork counts for all ideas
      let forkCounts: Record<string, number> = {}
      if (ideas && ideas.length > 0) {
        const { data: forks, error: forksError } = await supabase
          .from('idea_forks')
          .select('original_idea_id')
          .in('original_idea_id', (ideas as IdeaRow[]).map((idea: IdeaRow) => idea.id))
        
        if (forksError) {
          console.error('Forks fetch error:', forksError)
        }
        
        if (forks) {
          forkCounts = (forks as ForkRow[]).reduce((acc: Record<string, number>, fork: ForkRow) => {
            acc[fork.original_idea_id] = (acc[fork.original_idea_id] || 0) + 1
            return acc
          }, {})
        }
      }

      // Get role needs for all ideas when the Auto Matcher migration exists.
      let roleNeedsByIdea: Record<string, Array<{ role: string; desired_count: number }>> = {}
      if (ideas && ideas.length > 0) {
        const { data: roleNeeds, error: roleNeedsError } = await supabase
          .from('project_role_needs')
          .select('idea_id, role, desired_count')
          .in('idea_id', (ideas as IdeaRow[]).map((idea: IdeaRow) => idea.id))

        if (roleNeedsError && !isMissingProjectNeedsError(roleNeedsError)) {
          console.error('Project role needs fetch error:', roleNeedsError)
        }

        if (roleNeeds) {
          roleNeedsByIdea = (roleNeeds as RoleNeedRow[]).reduce(
            (acc: Record<string, Array<{ role: string; desired_count: number }>>, need: RoleNeedRow) => {
              if (!need.idea_id || !need.role) return acc
              acc[need.idea_id] = [
                ...(acc[need.idea_id] || []),
                { role: need.role, desired_count: Math.max(Number(need.desired_count || 1), 1) },
              ]
              return acc
            },
            {}
          )
        }
      }

      const enrichedIdeas = ((ideas || []) as IdeaRow[]).map((idea: IdeaRow) => ({
        ...idea,
        creator: creators[idea.creator_id] || { email: 'Unknown', profile_type: '' },
        comment_count: commentCounts[idea.id] || 0,
        fork_count: forkCounts[idea.id] || 0,
        role_needs: roleNeedsByIdea[idea.id] || [],
      }))

      return res.status(200).json({ ideas: enrichedIdeas })
    } catch (e) {
      console.error('Unexpected error:', e)
      return res.status(500).json({ error: 'Unexpected error' })
    }
  }

  if (req.method === 'POST') {
    const { creator_id, domain_id, title, description, problem_statement } = req.body
    if (!creator_id || !title) return res.status(400).json({ error: 'Missing fields' })

    const { data, error } = await supabase.from('ideas').insert([{ creator_id, domain_id, title, description, problem_statement }]).select()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json({ idea: data?.[0] })
  }

  if (req.method === 'DELETE') {
    if (!getAdminSessionFromRequest(req)) {
      return res.status(403).json({ error: 'Only an administrator can delete ideas.' })
    }

    const { id } = req.query
    if (typeof id !== 'string') return res.status(400).json({ error: 'Missing idea id' })

    const deleteRelatedRecords = [
      () => supabase.from('idea_comments').delete().eq('idea_id', id),
      () => supabase.from('idea_forks').delete().eq('original_idea_id', id),
      () => supabase.from('idea_forks').delete().eq('forked_idea_id', id),
      () => supabase.from('project_requests').delete().eq('idea_id', id),
      () => supabase.from('idea_groups').delete().eq('idea_id', id),
    ]
    for (const deleteRecords of deleteRelatedRecords) {
      const { error } = await deleteRecords()
      if (error) return res.status(500).json({ error: error.message })
    }

    const { error: deleteError } = await supabase.from('ideas').delete().eq('id', id)
    if (deleteError) return res.status(500).json({ error: deleteError.message })

    return res.status(200).json({ deleted: id })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

