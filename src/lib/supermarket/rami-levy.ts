/**
 * Rami Levy (רמי לוי) HTTP adapter.
 * Uses the public JSON search API (no auth required for search).
 * Cart addition is NOT automated — we return product links for manual cart use.
 */

export const RETAILER_ID = 'rami-levy' as const
export const RETAILER_NAME = 'רמי לוי'
export const RETAILER_URL = 'https://www.rami-levy.co.il'

const STORE_ID = () => process.env.RAMI_LEVY_STORE_ID ?? '331'

interface RLImages {
  small?: string
  original?: string
}

interface RLGsContent {
  text?: string
}

interface RLGs {
  BrandName?: string
  Net_Content?: RLGsContent
}

export interface RLProduct {
  id: number
  name: string
  price?: { price?: number }
  images?: RLImages
  gs?: RLGs
}

interface SearchResult {
  products: RLProduct[]
  error: string | null
}

/**
 * Returns products + a nullable error string for diagnostics.
 * Never throws — all errors are caught and returned as error string.
 */
export async function search(query: string, size = 8): Promise<SearchResult> {
  const url = `${RETAILER_URL}/api/search?q=${encodeURIComponent(query)}&store=${STORE_ID()}&size=${size}`
  console.log(`[rami-levy] ITEM_SEARCHED query="${query}" url="${url}"`)

  // Use Promise.race instead of AbortSignal.timeout for broader compatibility
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('search_timeout_6s')), 6000)
  )

  try {
    const res: Response = await Promise.race([
      fetch(url, {
        cache: 'no-store',
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Referer': `${RETAILER_URL}/`,
          'Origin': RETAILER_URL,
        },
      }),
      timeoutPromise,
    ])

    if (!res.ok) {
      const err = `http_${res.status}`
      console.error(`[rami-levy] search HTTP ${res.status} for "${query}"`)
      return { products: [], error: err }
    }

    const text = await res.text()
    let json: { data?: unknown; status?: number; total?: number }
    try {
      json = JSON.parse(text)
    } catch {
      const snippet = text.slice(0, 120)
      console.error(`[rami-levy] JSON parse failed for "${query}", body starts with: ${snippet}`)
      return { products: [], error: `json_parse_failed: ${snippet}` }
    }

    if (!Array.isArray(json?.data)) {
      console.error(`[rami-levy] data field missing/non-array for "${query}", keys: ${Object.keys(json ?? {}).join(',')}`)
      return { products: [], error: `data_not_array: keys=${Object.keys(json ?? {}).join(',')}` }
    }

    const products = json.data as RLProduct[]
    console.log(`[rami-levy] search found ${products.length} candidates for "${query}" (total=${json.total ?? '?'})`)
    return { products, error: null }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[rami-levy] search fetch threw for "${query}": ${msg}`)
    return { products: [], error: msg }
  }
}

export function getProductUrl(id: number | string): string {
  return `${RETAILER_URL}/product/${id}`
}

export function getImageUrl(product: RLProduct): string | null {
  const path = product.images?.small ?? product.images?.original
  if (!path) return null
  // paths from the API are relative: /product/{barcode}/small.jpg
  return path.startsWith('http') ? path : `${RETAILER_URL}${path}`
}

export function getPrice(product: RLProduct): number | null {
  const p = product.price?.price
  return typeof p === 'number' ? p : null
}

export function getBrand(product: RLProduct): string | null {
  return product.gs?.BrandName ?? null
}

export function getContentText(product: RLProduct): string | null {
  return product.gs?.Net_Content?.text ?? null
}
