import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Return the most-recently-updated subscription's metadata (if any)
  const { data } = await supabase
    .from('push_subscriptions')
    .select('last_sent_at, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({
    subscribed: !!data,
    last_sent_at: data?.last_sent_at ?? null,
    updated_at: data?.updated_at ?? null,
  })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const subscription = await request.json()

  // Extract endpoint — the unique identifier for this device's push subscription.
  // Each device generates a distinct endpoint, so upsert by (user_id, endpoint)
  // allows one row per device instead of clobbering all other devices on re-register.
  const endpoint = (subscription as { endpoint?: string })?.endpoint
  if (!endpoint) {
    console.error(`PUSH_DEBUG: subscription missing endpoint field for user ${user.id}`)
    return NextResponse.json({ error: 'Invalid subscription: missing endpoint' }, { status: 400 })
  }

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint,
      subscription,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,endpoint' },
  )

  if (error) {
    // Gracefully fall back to legacy single-row upsert if the endpoint column
    // hasn't been migrated yet (pre-migration compatibility).
    const legacyErr = await supabase.from('push_subscriptions').upsert({
      user_id: user.id,
      subscription,
      updated_at: new Date().toISOString(),
    })
    if (legacyErr.error) {
      console.error(`PUSH_DEBUG: Failed to upsert subscription for user ${user.id}:`, legacyErr.error.message)
      return NextResponse.json({ error: legacyErr.error.message }, { status: 500 })
    }
    console.log(`PUSH_DEBUG: Legacy upsert fallback (pre-migration) for user ${user.id}`)
    return NextResponse.json({ success: true, user_id: user.id })
  }

  console.log(`PUSH_DEBUG: SUCCESS - Token saved for user ${user.id} endpoint=${endpoint.substring(0, 50)}...`)
  return NextResponse.json({ success: true, user_id: user.id })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Accept optional endpoint to delete only the calling device's subscription.
  // Falls back to deleting all subscriptions for the user if no endpoint provided.
  let endpoint: string | null = null
  try {
    const body = await request.json()
    endpoint = (body as { endpoint?: string })?.endpoint ?? null
  } catch { /* DELETE body is optional */ }

  if (endpoint) {
    await supabase.from('push_subscriptions').delete()
      .eq('user_id', user.id).eq('endpoint', endpoint)
    console.log(`PUSH_DEBUG: Subscription deleted for user ${user.id} endpoint=${endpoint.substring(0, 50)}...`)
  } else {
    // No endpoint specified — delete all subscriptions for this user (sign-out behavior)
    await supabase.from('push_subscriptions').delete().eq('user_id', user.id)
    console.log(`PUSH_DEBUG: All subscriptions deleted for user ${user.id}`)
  }

  return NextResponse.json({ success: true })
}
