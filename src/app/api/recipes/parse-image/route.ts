import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ollamaChat } from '@/lib/ollama'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()

  // Support both single image (legacy) and multiple images array
  type ImageInput = { imageBase64: string; mediaType?: string }
  const imageList: ImageInput[] = body.images
    ? body.images
    : [{ imageBase64: body.imageBase64, mediaType: body.mediaType }]

  if (!imageList.length || !imageList[0]?.imageBase64) {
    return NextResponse.json({ error: 'No image provided' }, { status: 400 })
  }

  const isMultiple = imageList.length > 1

  try {
    const intro = isMultiple
      ? `אלו ${imageList.length} תמונות של אותו מתכון יחיד. התמונות עשויות להגיע בסדר לא כרונולוגי.

שלב 1 — זהה מה בכל תמונה: שם המתכון / מצרכים / שלבי הכנה / המשך הוראות.
שלב 2 — סדר את התמונות בסדר הנכון של המתכון (מצרכים → הכנה).
שלב 3 — חלץ את המתכון המלא מכל התמונות ביחד: שלב מצרכים מכל התמונות, שלב הוראות מכל התמונות בסדר הנכון, והחזר JSON יחיד ומלא.\n\n`
      : ''

    const raw = await ollamaChat(
      [
        {
          role: 'user',
          content: `${intro}אתה מומחה בחילוץ מתכונים מתמונות. המשימה שלך: לקרוא את המתכון בתמונה ולהחזיר אותו כ-JSON מדויק ומלא.

חלץ את המתכון ממש כפי שהוא מופיע בתמונה — שמות מצרכים, כמויות, הוראות הכנה — הכל בדיוק כמו שכתוב.

החזר JSON בלבד (ללא markdown fences, ללא הסברים):
{
  "title": "שם המתכון בעברית",
  "category": "אחד מ: breakfast | lunch | dinner | dessert | snack | drink | shabbat | cooked_salad | fresh_salad | other",
  "servings": <מספר מנות או null>,
  "prep_time": <זמן הכנה בדקות או null>,
  "ingredients": [
    { "name": "שם המצרך", "quantity": "כמות מספרית בלבד (למשל: 2, 0.5, 1.5) או null", "unit": "יחידת מידה (כוס, כף, גרם, ק\"ג, מ\"ל, ליטר, יח', קורט) או null" }
  ],
  "instructions": "הוראות הכנה מלאות ומפורטות בעברית, שלב אחר שלב, בדיוק כפי שכתוב בתמונה"
}

כללים חשובים:
- חלץ את המצרכים וההוראות כפי שהם כתובים בתמונה
- הפרד quantity (מספר בלבד) מ-unit (יחידה בלבד): quantity="2" unit="כוסות" ולא quantity="2 כוסות"
- אם כמות היא שבר כמו "½" — המר ל-"0.5", "¼" → "0.25", "¾" → "0.75"
- הוראות הכנה: שמור על כל השלבים, המספרים, ופסקאות — כתוב כטקסט רציף עם שלבים ממוספרים
- אם התמונה אינה מתכון: { "error": "not a recipe" }

תיקון שגיאות קריאה (OCR):
לאחר החילוץ הראשוני, עבור על כל מילה בשמות המצרכים ובהוראות. אם מילה נראית כשגיאת קריאה — כלומר אין לה משמעות אך יש מילה קרובה בעברית שמתאימה להקשר בישולי — תקן אותה.
דוגמאות לאותיות הנראות דומות בכתב יד: ח↔ה, פ↔כ↔ב, ו↔ן↔י, ד↔ר, צ↔ע, ט↔מ
דוגמאות לתיקון: "חוחי פיקרוליה" → "חופן פטרוזיליה", "לחס" → "לחץ", "שנן שום" → "שן שום"
תקן רק כשברור שמדובר בשגיאה ויש מילה הגיונית יותר — אל תשנה מילים תקינות.`,
          images: imageList.map(img => img.imageBase64),
        },
      ],
      { maxTokens: 4096 },
    )
    const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()

    const recipe = JSON.parse(text)
    if (recipe.error) return NextResponse.json({ error: recipe.error }, { status: 422 })

    // Normalize ingredients
    recipe.ingredients = (recipe.ingredients ?? []).map((ing: { name?: string; quantity?: unknown; unit?: unknown }) => ({
      name: String(ing.name ?? '').trim(),
      quantity: ing.quantity != null ? String(ing.quantity).trim() : null,
      unit: ing.unit != null && String(ing.unit).trim() !== '' ? String(ing.unit).trim() : null,
    })).filter((ing: { name: string }) => ing.name)

    return NextResponse.json(recipe)
  } catch (e) {
    console.error('[parse-image] error:', e)
    return NextResponse.json({ error: 'Could not parse recipe from image' }, { status: 422 })
  }
}
