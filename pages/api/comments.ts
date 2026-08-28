import type { NextApiRequest, NextApiResponse } from 'next'
import { supabase } from '../../lib/supabaseClient'

type CommentRow = {
  id: string
  idea_id: string
  author_id: string | null
  parent_comment_id: string | null
  content: string
  created_at: string
}

type UserRow = {
  id: string
  email: string | null
  profile_type: string | null
}

async function enrichComments(comments: CommentRow[]) {
  const authorIds = [...new Set(comments.map(comment => comment.author_id).filter(Boolean))] as string[]

  if (authorIds.length === 0) {
    return comments
  }

  const { data: authors } = await supabase
    .from('users')
    .select('id, email, profile_type')
    .in('id', authorIds)

  const authorMap = Object.fromEntries(((authors || []) as UserRow[]).map(author => [author.id, author]))

  return comments.map(comment => ({
    ...comment,
    author: comment.author_id ? authorMap[comment.author_id] || null : null,
  }))
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const { idea_id, limit, order } = req.query
    if (!idea_id) return res.status(400).json({ error: 'Missing idea_id' })
    let query = supabase
      .from('idea_comments')
      .select('*')
      .eq('idea_id', idea_id)
      .order('created_at', { ascending: order !== 'recent' })

    if (typeof limit === 'string') {
      const parsedLimit = Number(limit)
      if (Number.isFinite(parsedLimit) && parsedLimit > 0) {
        query = query.limit(parsedLimit)
      }
    }

    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ comments: await enrichComments((data || []) as CommentRow[]) })
  }

  if (req.method === 'POST') {
    const { idea_id, author_id, parent_comment_id, content } = req.body
    if (!idea_id || !content) return res.status(400).json({ error: 'Missing fields' })

    const { data, error } = await supabase.from('idea_comments').insert([{ idea_id, author_id, parent_comment_id: parent_comment_id || null, content }]).select()
    if (error) return res.status(500).json({ error: error.message })
    const [comment] = await enrichComments((data || []) as CommentRow[])
    return res.status(201).json({ comment })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
