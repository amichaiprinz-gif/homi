/**
 * POST /api/shopping/build-cart
 *
 * Builds a Rami Levy cart from the user's current shopping list.
 * Uses RL-first matching: searches RL's own API for every item,
 * runs AI matching against real RL inventory, saves session to DB,
 * updates household product memory.
 *
 * Returns the full CartBuildResult — no polling needed.
 * Vercel max duration: 60s (set below).
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildCart, normalizeKey, type CartItem, type MemoryEntry } from '@/lib/supermarket/rl-cart'

// Allow up to 60s on Vercel (Hobby plan supports this for API routes)
export const maxDuration = 60

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ── 1. Get household context ───────────────────────────────────────────────
  const { data: memberRow } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .maybeSingle()

  const householdId = memberRow?.household_id ?? null

  // ── 2. Load shopping list (pending items only) ────────────────────────────
  const itemsQuery = supabase
    .from('shopping_items')
    .select('id, text, quantity')
    .eq('done', false)
    .order('created_at', { ascending: true })

  const { data: rawItems, error: itemsError } = householdId
    ? await itemsQuery.eq('household_id', householdId)
    : await itemsQuery.eq('user_id', user.id).is('household_id', null)

  if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 })
  if (!rawItems?.length) return NextResponse.json({ error: 'הרשימה ריקה — אין פריטים לבניית הסל' }, { status: 400 })

  const items = rawItems.map(r => ({
    id: String(r.id),
    text: String(r.text),
    quantity: r.quantity as string | null,
  }))

  console.log(`[build-cart] START user=${user.id} household=${householdId} items=${items.length}`)

  // ── 3. Load product memory (household-specific) ───────────────────────────
  const admin = createAdminClient()
  const memoryMap = new Map<string, MemoryEntry>()
  if (householdId) {
    const { data: memRows } = await admin
      .from('rl_product_memory')
      .select('item_key, rl_product_id, rl_product_name, rl_product_url, rl_product_image, rl_product_price, rl_product_brand, rl_product_content')
      .eq('household_id', householdId)

    for (const row of memRows ?? []) {
      memoryMap.set(row.item_key, {
        rlProductId: row.rl_product_id,
        rlProductName: row.rl_product_name,
        rlProductUrl: row.rl_product_url,
        rlProductImage: row.rl_product_image,
        rlProductPrice: row.rl_product_price,
        rlProductBrand: row.rl_product_brand,
        rlProductContent: row.rl_product_content,
      })
    }
    console.log(`[build-cart] memory_loaded count=${memoryMap.size}`)
  }

  // ── 4. Build cart ─────────────────────────────────────────────────────────
  const result = await buildCart(items, memoryMap)

  console.log(`[build-cart] DONE matched=${result.matchedCount} substituted=${result.substitutedCount} not_found=${result.notFoundCount} total=${result.estimatedTotal ?? 'N/A'} time=${result.buildTimeMs}ms`)

  // ── 5. Save cart session ──────────────────────────────────────────────────
  const status = result.notFoundCount === items.length ? 'failed'
    : result.notFoundCount > 0 ? 'partial'
    : 'ready'

  const { data: session, error: sessionErr } = await admin
    .from('cart_sessions')
    .insert({
      household_id: householdId,
      user_id: user.id,
      status,
      items: result.items,
      matched_count: result.matchedCount,
      substituted_count: result.substitutedCount,
      not_found_count: result.notFoundCount,
      estimated_total: result.estimatedTotal,
      build_time_ms: result.buildTimeMs,
    })
    .select('id')
    .single()

  if (sessionErr) {
    console.error('[build-cart] session save error:', sessionErr.message)
  }

  // ── 6. Save shopping history snapshot (fire-and-forget) ──────────────────
  const historyItems = items.map(i => ({ text: i.text, quantity: i.quantity ?? null }))
  void supabase
    .from('shopping_history')
    .insert({ user_id: user.id, household_id: householdId, items: historyItems })
    .then(({ error: histErr }) => {
      if (histErr) console.error('[build-cart] history_save_error:', histErr.message)
      else console.log(`[build-cart] history_saved count=${historyItems.length}`)
    })

  // ── 7. Update product memory (upsert new matches) ─────────────────────────
  if (householdId) {
    const toUpsert: CartItem[] = result.items.filter(
      i => !i.fromMemory && i.status !== 'not_found' && i.rlProductId != null,
    )

    if (toUpsert.length > 0) {
      const memoryRows = toUpsert.map(i => ({
        household_id: householdId,
        item_key: normalizeKey(i.itemText),
        rl_product_id: i.rlProductId!,
        rl_product_name: i.rlProductName!,
        rl_product_url: i.rlProductUrl!,
        rl_product_image: i.rlProductImage ?? null,
        rl_product_price: i.rlProductPrice ?? null,
        rl_product_brand: i.rlProductBrand ?? null,
        rl_product_content: i.rlProductContent ?? null,
        confidence: 'auto',
        use_count: 1,
        updated_at: new Date().toISOString(),
      }))

      const { error: memErr } = await admin
        .from('rl_product_memory')
        .upsert(memoryRows, { onConflict: 'household_id,item_key', ignoreDuplicates: false })

      if (memErr) console.error('[build-cart] memory upsert error:', memErr.message)
      else console.log(`[build-cart] memory_updated count=${toUpsert.length}`)
    }
  }

  return NextResponse.json({
    sessionId: session?.id ?? null,
    ...result,
  })
}
