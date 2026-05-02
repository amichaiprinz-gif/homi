/**
 * User-authenticated memory API (for the app frontend)
 * GET    /api/memory          — list all household memory facts
 * POST   /api/memory          — upsert { key, value }
 * DELETE /api/memory?key=X    — remove by key
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function getHouseholdId(): Promise<{ householdId: string; error?: never } | { householdId?: never; error: NextResponse }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const { data: member } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!member) return { error: NextResponse.json({ error: 'No household' }, { status: 404 }) }
  return { householdId: member.household_id }
}

export async function GET() {
  const ctx = await getHouseholdId()
  if (ctx.error) return ctx.error

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('bot_memory')
    .select('key, value, updated_at')
    .eq('household_id', ctx.householdId)
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const ctx = await getHouseholdId()
  if (ctx.error) return ctx.error

  const body = await req.json().catch(() => ({})) as { key?: string; value?: string }
  const key = body.key?.trim()
  const value = body.value?.trim()
  if (!key || !value) return NextResponse.json({ error: 'חסר key או value' }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('bot_memory')
    .upsert(
      { household_id: ctx.householdId, key, value, updated_at: new Date().toISOString() },
      { onConflict: 'household_id,key' }
    )
    .select('key, value')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: Request) {
  const ctx = await getHouseholdId()
  if (ctx.error) return ctx.error

  const { searchParams } = new URL(req.url)
  const key = searchParams.get('key')?.trim()
  if (!key) return NextResponse.json({ error: 'חסר key' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin
    .from('bot_memory')
    .delete()
    .eq('household_id', ctx.householdId)
    .eq('key', key)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
