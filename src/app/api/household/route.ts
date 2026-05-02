import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { action, name, inviteCode, displayName } = await request.json()

  if (action === 'create') {
    const code = randomBytes(3).toString('hex').toUpperCase()
    const { data: hh, error: hhErr } = await supabase
      .from('households')
      .insert({ name: name || 'הבית שלנו', invite_code: code })
      .select()
      .single()

    if (hhErr) return NextResponse.json({ error: hhErr.message }, { status: 400 })

    const { error: memErr } = await supabase.from('household_members').upsert({
      user_id: user.id,
      household_id: hh.id,
      display_name: displayName || user.email?.split('@')[0] || 'משתמש',
      role: 'admin',
    })

    if (memErr) return NextResponse.json({ error: memErr.message }, { status: 400 })
    return NextResponse.json({ success: true })
  }

  if (action === 'join') {
    const { data: hh } = await supabase
      .from('households')
      .select()
      .eq('invite_code', inviteCode.toUpperCase())
      .maybeSingle()

    if (!hh) return NextResponse.json({ error: 'קוד לא נמצא' }, { status: 404 })

    // Leave any existing household before joining a new one so the user is
    // always in exactly one household (prevents leaderboard / task-visibility bugs)
    await supabase.from('household_members').delete().eq('user_id', user.id)

    const { error: memErr } = await supabase.from('household_members').insert({
      user_id: user.id,
      household_id: hh.id,
      display_name: displayName || user.email?.split('@')[0] || 'משתמש',
      role: 'member',
    })

    if (memErr) return NextResponse.json({ error: memErr.message }, { status: 400 })
    return NextResponse.json({ success: true })
  }

  if (action === 'leave') {
    await supabase.from('household_members').delete().eq('user_id', user.id)
    return NextResponse.json({ success: true })
  }

  if (action === 'update_name') {
    const { error } = await supabase
      .from('household_members')
      .update({ display_name: displayName })
      .eq('user_id', user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
