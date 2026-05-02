import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ollamaChat } from '@/lib/ollama'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { imageBase64, mediaType } = await request.json()
  if (!imageBase64) return NextResponse.json({ error: 'No image provided' }, { status: 400 })

  try {
    const raw = await ollamaChat(
      [
        {
          role: 'user',
          content: `Look at this image of a kitchen sink or dishes area. Count approximately how many dirty dishes, pots, pans, cups, and utensils you can see that need washing.

Return ONLY a JSON object:
{
  "score": <number 1-5>,
  "count": <approximate number of items>,
  "description": "<short Hebrew description of what you see>"
}

Scoring:
- 1 point: 1-3 items (כמה כלים בודדים)
- 2 points: 4-8 items (מעט כלים)
- 3 points: 9-15 items (כמות בינונית)
- 4 points: 16-25 items (הרבה כלים)
- 5 points: 26+ items or very messy (המון כלים!)

If the image is not of dishes/sink, return: {"score": 1, "count": 0, "description": "לא זוהה כיור"}

Return ONLY valid JSON, no markdown.`,
          images: [imageBase64],
        },
      ],
      { maxTokens: 256 },
    )
    const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const result = JSON.parse(text)
    return NextResponse.json({
      score: Math.min(Math.max(Number(result.score) || 1, 1), 5),
      count: result.count ?? 0,
      description: result.description ?? '',
    })
  } catch (e) {
    console.error('[scan-dishes] error:', e)
    return NextResponse.json({ error: 'שגיאה בניתוח התמונה' }, { status: 500 })
  }
}
