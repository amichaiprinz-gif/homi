/**
 * GET    /api/bot/memory          — list all household facts
 * POST   /api/bot/memory          — upsert a fact  { key, value }
 * DELETE /api/bot/memory?key=X    — remove a fact by key
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
  const { data, error } = await admin
    .from('bot_memory')
    .select('key, value, updated_at')
    .eq('household_id', auth.householdId)
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const auth = botAuth(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { key?: string; value?: string }
  const key = body.key?.trim()
  const value = body.value?.trim()
  if (!key || !value) return NextResponse.json({ error: 'חסר key או value' }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('bot_memory')
    .upsert(
      { household_id: auth.householdId, key, value, updated_at: new Date().toISOString() },
      { onConflict: 'household_id,key' }
    )
    .select('key, value')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  console.log(`[bot/memory] upsert key="${key}" household=${auth.householdId}`)
  return NextResponse.json(data)
}

export async function DELETE(req: Request) {
  const auth = botAuth(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const key = searchParams.get('key')?.trim()
  if (!key) return NextResponse.json({ error: 'חסר key' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin
    .from('bot_memory')
    .delete()
    .eq('household_id', auth.householdId)
    .eq('key', key)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  console.log(`[bot/memory] deleted key="${key}" household=${auth.householdId}`)
  return NextResponse.json({ ok: true, deleted: key })
}
