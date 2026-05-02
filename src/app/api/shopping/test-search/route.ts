/**
 * Temporary diagnostic endpoint.
 * GET /api/shopping/test-search?q=חלב
 * Returns raw Rami Levy API result + what the app would parse from it.
 * Remove this file once the prepare-order pipeline is confirmed working.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const RETAILER_URL = 'https://www.rami-levy.co.il'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = request.nextUrl.searchParams.get('q') ?? 'חלב'
  const url = `${RETAILER_URL}/api/search?q=${encodeURIComponent(q)}&store=331&size=5`

  const strategies: Array<{ label: string; opts: RequestInit }> = [
    {
      label: 'browser-headers',
      opts: {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Referer': RETAILER_URL,
          'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
        },
        cache: 'no-store' as RequestCache,
      },
    },
    {
      label: 'no-headers',
      opts: { cache: 'no-store' as RequestCache },
    },
    {
      label: 'no-store-param',
      opts: { cache: 'no-store' as RequestCache },
    },
  ]

  const results: Record<string, unknown>[] = []

  for (const s of strategies) {
    const fetchUrl = s.label === 'no-store-param'
      ? `${RETAILER_URL}/api/search?q=${encodeURIComponent(q)}&size=5`
      : url

    try {
      const res = await fetch(fetchUrl, s.opts)
      const text = await res.text()
      let parsed: unknown = null
      let parseError: string | null = null
      try { parsed = JSON.parse(text) } catch (e) { parseError = String(e) }

      const data = (parsed as Record<string, unknown>)?.data
      results.push({
        strategy: s.label,
        url: fetchUrl,
        http_status: res.status,
        content_type: res.headers.get('content-type'),
        body_length: text.length,
        body_preview: text.slice(0, 300),
        parse_error: parseError,
        data_is_array: Array.isArray(data),
        data_length: Array.isArray(data) ? data.length : null,
        first_item: Array.isArray(data) && data.length > 0 ? (data as unknown[])[0] : null,
      })
    } catch (err) {
      results.push({
        strategy: s.label,
        url: fetchUrl,
        fetch_threw: String(err),
      })
    }
  }

  return NextResponse.json({ q, tested_url: url, results })
}
