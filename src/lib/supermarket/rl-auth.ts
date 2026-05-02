/**
 * Rami Levy authentication and cart execution.
 *
 * Sign-in: POST /api/sign-in with { z: email/phone, password, store }
 * Cart add: POST /api/cart/item with { id, quantity, store }
 *
 * Session cookies from sign-in are stored in the `rl_sessions` table and
 * forwarded as the Cookie header on subsequent cart requests.
 */

const RL_BASE = 'https://www.rami-levy.co.il'
const DEFAULT_STORE = '331'

// Mimic a mobile Safari browser — same strategy as the search adapter in rami-levy.ts
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8',
  'Origin': RL_BASE,
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RLLoginResult {
  success: boolean
  sessionCookie: string | null
  rlEmail: string | null
  error: string | null
}

export interface CartExecuteResult {
  added: number
  failed: number
  errors: string[]
  cartUrl: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract forwarding-safe `name=value` pairs from Set-Cookie headers.
 * Works with both the standard Fetch API (combined string) and the
 * Node.js 20+ `headers.getSetCookie()` array.
 */
function extractCookieValues(res: Response): string {
  // Try Node.js 20+ API first
  type HeadersExt = Headers & { getSetCookie?: () => string[] }
  const ext = res.headers as HeadersExt
  const parts: string[] = typeof ext.getSetCookie === 'function'
    ? ext.getSetCookie()
    : [res.headers.get('set-cookie') ?? ''].filter(Boolean)

  return parts
    .map(c => c.split(';')[0].trim())
    .filter(Boolean)
    .join('; ')
}

// ── Login ─────────────────────────────────────────────────────────────────────

export async function loginToRL(email: string, password: string): Promise<RLLoginResult> {
  const store = process.env.RAMI_LEVY_STORE_ID ?? DEFAULT_STORE
  try {
    console.log(`[rl-auth] login attempt email=${email}`)

    const res = await Promise.race<Response | never>([
      fetch(`${RL_BASE}/api/sign-in`, {
        method: 'POST',
        headers: {
          ...BROWSER_HEADERS,
          'Content-Type': 'application/json',
          'Referer': `${RL_BASE}/he/sign-in`,
        },
        body: JSON.stringify({ z: email, password, store }),
        cache: 'no-store',
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('login_timeout_10s')), 10000)
      ),
    ])

    console.log(`[rl-auth] sign-in HTTP ${res.status}`)

    const sessionCookie = extractCookieValues(res)
    console.log(`[rl-auth] cookies found=${sessionCookie ? 'yes' : 'no'} len=${sessionCookie.length}`)

    // Parse body for error messages or fallback token
    const text = await res.text().catch(() => '')
    let body: Record<string, unknown> = {}
    try { body = JSON.parse(text) } catch { /* non-JSON response */ }

    if (!res.ok) {
      const errMsg = (body.message as string) ?? (body.error as string) ?? `HTTP ${res.status}`
      console.error(`[rl-auth] login failed: ${errMsg}`)
      return { success: false, sessionCookie: null, rlEmail: null, error: errMsg }
    }

    if (body.success === false || body.error) {
      const errMsg = (body.message as string) ?? (body.error as string) ?? 'כניסה נכשלה'
      return { success: false, sessionCookie: null, rlEmail: null, error: errMsg }
    }

    // Prefer cookies; fall back to a body token if present
    if (!sessionCookie) {
      const token = body.token as string | undefined
      if (token) {
        console.log(`[rl-auth] using token from response body`)
        return { success: true, sessionCookie: `token=${token}`, rlEmail: email, error: null }
      }
      console.error('[rl-auth] no cookies or token in response')
      return { success: false, sessionCookie: null, rlEmail: null, error: 'לא התקבל טוקן סשן' }
    }

    console.log(`[rl-auth] login successful email=${email}`)
    return { success: true, sessionCookie, rlEmail: email, error: null }
  } catch (err) {
    const msg = String(err)
    console.error(`[rl-auth] login threw: ${msg}`)
    return { success: false, sessionCookie: null, rlEmail: null, error: msg }
  }
}

// ── Cart execution ────────────────────────────────────────────────────────────

export async function addItemsToRLCart(
  sessionCookie: string,
  items: { rlProductId: number; quantity: number }[],
): Promise<CartExecuteResult> {
  const store = process.env.RAMI_LEVY_STORE_ID ?? DEFAULT_STORE
  const errors: string[] = []
  let added = 0
  let failed = 0

  for (const item of items) {
    try {
      const res = await fetch(`${RL_BASE}/api/cart/item`, {
        method: 'POST',
        headers: {
          ...BROWSER_HEADERS,
          'Content-Type': 'application/json',
          'Cookie': sessionCookie,
          'Referer': `${RL_BASE}/he/online`,
        },
        body: JSON.stringify({ id: item.rlProductId, quantity: item.quantity, store }),
        cache: 'no-store',
      })

      if (res.ok) {
        added++
        console.log(`[rl-auth] cart_add ok product=${item.rlProductId} qty=${item.quantity}`)
      } else {
        // 401 = session expired — bail out immediately
        if (res.status === 401) {
          console.warn(`[rl-auth] cart_add 401 session expired`)
          errors.push('session_expired')
          failed += items.length - added - failed
          break
        }

        const text = await res.text().catch(() => '')
        let msg = `HTTP ${res.status}`
        try { msg = (JSON.parse(text).message as string) ?? msg } catch { /* ignore */ }
        console.warn(`[rl-auth] cart_add failed product=${item.rlProductId} ${msg}`)
        errors.push(`מוצר ${item.rlProductId}: ${msg}`)
        failed++
      }

      // Pace requests to avoid hammering RL's API
      await new Promise(r => setTimeout(r, 150))
    } catch (err) {
      const msg = String(err).slice(0, 80)
      console.error(`[rl-auth] cart_add threw product=${item.rlProductId}: ${msg}`)
      errors.push(`מוצר ${item.rlProductId}: ${msg}`)
      failed++
    }
  }

  console.log(`[rl-auth] cart_execute done added=${added} failed=${failed}`)

  return {
    added,
    failed,
    errors,
    cartUrl: `${RL_BASE}/he/online/cart`,
  }
}
