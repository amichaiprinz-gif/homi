/**
 * GET  /api/bot/bulletin  — recent bulletin posts
 * POST /api/bot/bulletin  — add a post
 *
 * Auth: Authorization: Bearer <BOT_TOKEN>
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { botAuth } from '../_auth'

export const maxDuration = 10

export async function GET(req: Request) {
  const auth = botAuth(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { data, error } = await admin
    .from('bulletin_posts')
    .select('id, content, display_name, created_at, expires_at')
    .eq('household_id', auth.householdId)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const auth = botAuth(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    content?: string
    expires_hours?: number
  }

  const content = body.content?.trim()
  if (!content) return NextResponse.json({ error: 'חסר תוכן' }, { status: 400 })

  const expires_at = body.expires_hours
    ? new Date(Date.now() + body.expires_hours * 3_600_000).toISOString()
    : null

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('bulletin_posts')
    .insert({
      household_id: auth.householdId,
      display_name: 'WhatsApp Bot',
      content,
      expires_at,
    })
    .select('id, content')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  console.log(`[bot/bulletin] posted to household=${auth.householdId}`)
  return NextResponse.json(data)
}
