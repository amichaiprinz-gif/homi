/**
 * Open Prices (prices.openfoodfacts.org) price lookup adapter.
 * Looks up ILS prices for a product by barcode.
 * Never throws — returns nulls on any failure.
 */

const OPEN_PRICES_BASE = 'https://prices.openfoodfacts.org/api/v1/prices'

export interface PriceResult {
  priceILS: number | null
  /** Hebrew product name from Open Prices (may differ from OFF product name) */
  productNameHe: string | null
}

export async function lookupPriceILS(barcode: string): Promise<PriceResult> {
  const url = `${OPEN_PRICES_BASE}?product_code=${encodeURIComponent(barcode)}&currency=ILS&page_size=5`

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('prices_timeout_4s')), 4000)
  )

  try {
    const res: Response = await Promise.race([
      fetch(url, { headers: { 'Accept': 'application/json' } }),
      timeout,
    ])

    if (!res.ok) return { priceILS: null, productNameHe: null }

    const text = await res.text()
    if (text.trimStart().startsWith('<')) return { priceILS: null, productNameHe: null }

    let json: { items?: unknown[] }
    try { json = JSON.parse(text) } catch { return { priceILS: null, productNameHe: null } }

    if (!Array.isArray(json.items) || json.items.length === 0) {
      return { priceILS: null, productNameHe: null }
    }

    const items = json.items as Record<string, unknown>[]
    // Prefer ILS entries; fall back to any entry
    const ilsItems = items.filter(item => item.currency === 'ILS')
    const latest = (ilsItems[0] ?? items[0]) as Record<string, unknown>

    const priceILS = typeof latest.price === 'number' ? latest.price : null
    const product = (latest.product ?? null) as Record<string, unknown> | null
    const productNameHe = product?.product_name ? String(product.product_name) : null

    return { priceILS, productNameHe }
  } catch {
    return { priceILS: null, productNameHe: null }
  }
}
