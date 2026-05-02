/**
 * Open Food Facts search adapter — fallback provider for items not in the curated catalog.
 *
 * Strategy:
 *   1. Search with countries=Israel (best quality, but may 503 under load)
 *   2. On 503/429: wait 800ms and retry once without the country filter,
 *      then post-filter by Israeli barcode prefix (729…)
 *
 * Hebrew product names are preferred (product_name_he field) over English.
 * Per OFF API guidelines, a proper User-Agent with contact info is required.
 */

const OFF_BASE = 'https://world.openfoodfacts.org/cgi/search.pl'

export const PROVIDER_NAME = 'Open Food Facts'
export const PROVIDER_URL = 'https://world.openfoodfacts.org'

export interface OFFProduct {
  barcode: string
  /** Hebrew name preferred; falls back to English name, then brand */
  name: string
  brand: string | null
  quantity: string | null
  imageUrl: string | null
}

export interface OFFSearchResult {
  products: OFFProduct[]
  error: string | null
  providerStatus: 'ok' | 'unavailable' | 'empty' | 'error'
  retryCount: number
}

const OFF_HEADERS = {
  'Accept': 'application/json',
  'User-Agent': 'HomeBase-App/1.0 (grocery-list assistant; contact via github.com/homebase)',
}

async function fetchOFF(url: string, timeoutMs: number): Promise<Response> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`off_timeout_${timeoutMs}ms`)), timeoutMs)
  )
  return Promise.race([fetch(url, { headers: OFF_HEADERS }), timeout])
}

async function parseOFFResponse(res: Response): Promise<OFFProduct[] | null> {
  const text = await res.text()
  if (text.trimStart().startsWith('<')) return null  // HTML = unavailable

  let json: { products?: unknown[] }
  try { json = JSON.parse(text) } catch { return null }
  if (!Array.isArray(json.products)) return null

  return (json.products as Record<string, unknown>[])
    .map(p => {
      const nameHe = typeof p.product_name_he === 'string' ? p.product_name_he.trim() : ''
      const nameEn = typeof p.product_name === 'string' ? p.product_name.trim() : ''
      const brandsRaw = typeof p.brands === 'string' ? p.brands : ''
      const brand = brandsRaw ? brandsRaw.split(',')[0].trim() : null
      const name = nameHe || nameEn || brand || ''
      return {
        barcode: String(p._id ?? '').trim(),
        name,
        brand,
        quantity: typeof p.quantity === 'string' ? p.quantity.trim() : null,
        imageUrl: typeof p.image_url === 'string' ? p.image_url : null,
      }
    })
    .filter(p => p.barcode && p.name)
}

/**
 * Search Open Food Facts for products matching `query` (should be English for best results).
 * Never throws — all errors returned in result.
 */
export async function search(query: string, size = 8): Promise<OFFSearchResult> {
  let retryCount = 0

  // ── Strategy 1: with countries=Israel ──────────────────────────────────────
  const url1 = `${OFF_BASE}?search_terms=${encodeURIComponent(query)}&countries=Israel&json=1&action=process&page_size=${size}`
  console.log(`[off] OFF_SEARCH_QUERY query="${query}" strategy=israel url="${url1}"`)

  try {
    const res1 = await fetchOFF(url1, 4000)

    if (res1.ok) {
      const products = await parseOFFResponse(res1)
      if (products) {
        console.log(`[off] OFF_CANDIDATES_FOUND query="${query}" count=${products.length} strategy=israel`)
        return { products, error: null, providerStatus: products.length ? 'ok' : 'empty', retryCount }
      }
      // HTML response — OFF is in maintenance
      console.error(`[off] HTML response for "${query}" — OFF maintenance`)
      return { products: [], error: 'off_html_response', providerStatus: 'unavailable', retryCount }
    }

    if (res1.status !== 503 && res1.status !== 429) {
      console.error(`[off] HTTP ${res1.status} for "${query}"`)
      return { products: [], error: `http_${res1.status}`, providerStatus: 'error', retryCount }
    }

    // 503/429 — try fallback strategy
    console.warn(`[off] ${res1.status} on strategy=israel for "${query}", retrying without country filter`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!msg.includes('timeout')) {
      return { products: [], error: msg, providerStatus: 'error', retryCount }
    }
    console.warn(`[off] timeout on strategy=israel for "${query}", retrying without country filter`)
  }

  // ── Strategy 2: global search, filter by Israeli barcode prefix (729…) ────
  retryCount = 1
  await new Promise(r => setTimeout(r, 800))

  const size2 = Math.min(size * 3, 24)  // fetch more to find Israeli products
  const url2 = `${OFF_BASE}?search_terms=${encodeURIComponent(query)}&json=1&action=process&page_size=${size2}`
  console.log(`[off] OFF_SEARCH_QUERY query="${query}" strategy=global_filtered url="${url2}"`)

  try {
    const res2 = await fetchOFF(url2, 4000)

    if (!res2.ok) {
      console.error(`[off] HTTP ${res2.status} on strategy=global_filtered for "${query}"`)
      return { products: [], error: `http_${res2.status}_both_strategies`, providerStatus: 'unavailable', retryCount }
    }

    const allProducts = await parseOFFResponse(res2)
    if (!allProducts) {
      return { products: [], error: 'off_html_both_strategies', providerStatus: 'unavailable', retryCount }
    }

    // Prefer Israeli barcodes (729 prefix), fall back to all results
    const israeliProducts = allProducts.filter(p => p.barcode.startsWith('729'))
    const finalProducts = israeliProducts.length > 0 ? israeliProducts.slice(0, size) : allProducts.slice(0, size)

    console.log(`[off] OFF_CANDIDATES_FOUND query="${query}" count=${finalProducts.length} strategy=global_filtered (israeli=${israeliProducts.length})`)
    return {
      products: finalProducts,
      error: null,
      providerStatus: finalProducts.length ? 'ok' : 'empty',
      retryCount,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[off] fetch threw on strategy=global_filtered for "${query}": ${msg}`)
    return { products: [], error: msg, providerStatus: 'unavailable', retryCount }
  }
}

export function getProductUrl(barcode: string): string {
  return `${PROVIDER_URL}/product/${barcode}`
}
