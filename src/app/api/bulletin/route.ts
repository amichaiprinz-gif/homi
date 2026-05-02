import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: member } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!member?.household_id) return NextResponse.json([])

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('bulletin_posts')
    .select('*')
    .eq('household_id', member.household_id)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { action } = body

  const { data: memberRow } = await supabase
    .from('household_members')
    .select('household_id, display_name')
    .eq('user_id', user.id)
    .maybeSingle()

  if (action === 'add') {
    const { content, expires_hours } = body
    if (!content?.trim()) return NextResponse.json({ error: 'תוכן חסר' }, { status: 400 })
    if (!memberRow?.household_id) return NextResponse.json({ error: 'אין משק בית' }, { status: 400 })

    const expires_at = expires_hours
      ? new Date(Date.now() + Number(expires_hours) * 3_600_000).toISOString()
      : null

    const { data, error } = await supabase
      .from('bulletin_posts')
      .insert({
        household_id: memberRow.household_id,
        user_id: user.id,
        display_name: memberRow.display_name ?? '',
        content: content.trim(),
        expires_at,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json(data)
  }

  if (action === 'delete') {
    const { id } = body
    await supabase.from('bulletin_posts').delete().eq('id', id).eq('user_id', user.id)
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
