/**
 * GET /api/shopping/build-session/[id]
 *
 * CORS-enabled — called by the bookmarklet running on rami-levy.co.il.
 * Returns the raw item list so the bookmarklet knows what to search for.
 * Auth: session UUID is the only credential (128-bit entropy, unguessable).
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://www.rami-levy.co.il',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const admin = createAdminClient()
  const { data: session } = await admin
    .from('rl_build_sessions')
    .select('id, raw_items, status, expires_at')
    .eq('id', id)
    .maybeSingle()

  if (!session) {
    return NextResponse.json(
      { error: 'Session not found' },
      { status: 404, headers: CORS_HEADERS },
    )
  }

  if (new Date(session.expires_at) < new Date()) {
    return NextResponse.json(
      { error: 'Session expired' },
      { status: 410, headers: CORS_HEADERS },
    )
  }

  return NextResponse.json(
    { raw_items: session.raw_items, status: session.status },
    { headers: CORS_HEADERS },
  )
}
