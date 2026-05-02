import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'
import { ollamaChat, ollamaAvailable } from '@/lib/ollama'

interface ParsedItem { name: string; quantity: string; category: string }

function simpleFallback(text: string): ParsedItem[] {
  return text
    .split(/[\n,،؛]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map(name => ({ name, quantity: '', category: 'כללי' }))
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const text: string = String(body.text ?? '').trim()
  if (!text) return NextResponse.json({ items: [] })

  try {
    const system = 'You are a Hebrew shopping list parser. Extract items from the input text and return ONLY a valid JSON array — no markdown, no explanation. Each element must have exactly: {"name":"item name in Hebrew","quantity":"amount with unit, or empty string","category":"one of: ירקות ופירות|מוצרי חלב|בשר ודגים|מאפייה|קפואים|מזווה|ניקיון|היגיינה|כללי"}'

    let raw = '[]'

    if (ollamaAvailable()) {
      const result = await ollamaChat(
        [{ role: 'system', content: system }, { role: 'user', content: text }],
        { maxTokens: 600, timeoutMs: 8000 },
      ).catch(() => null)
      if (result) raw = result
    }

    if (raw === '[]' && process.env.ANTHROPIC_API_KEY) {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      const result = await Promise.race<Anthropic.Message | never>([
        client.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 600, system, messages: [{ role: 'user', content: text }] }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
      ])
      raw = result.content[0]?.type === 'text' ? result.content[0].text.trim() : '[]'
    }

    // Strip markdown code fences if model added them
    const cleaned = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim()

    const parsed: unknown = JSON.parse(cleaned)
    if (!Array.isArray(parsed)) return NextResponse.json({ items: simpleFallback(text) })

    const items: ParsedItem[] = parsed
      .map((item: any) => ({
        name: String(item?.name ?? '').trim(),
        quantity: String(item?.quantity ?? '').trim(),
        category: String(item?.category ?? 'כללי').trim(),
      }))
      .filter((item: ParsedItem) => item.name.length > 0)

    return NextResponse.json({ items })
  } catch {
    return NextResponse.json({ items: simpleFallback(text) })
  }
}
