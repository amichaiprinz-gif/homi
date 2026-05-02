import Anthropic from '@anthropic-ai/sdk'
import { ollamaChat, ollamaAvailable } from './ollama'

export type PushContext = 'task_reminder' | 'task_done' | 'morning' | 'evening' | 'overtake' | 'shopping' | 'task_assigned'

// Hardcoded fallbacks — used when AI call fails, times out, or API key is absent.
// Written to be playful and contextual even without AI.
const FALLBACKS: Record<PushContext, (data: Record<string, unknown>) => string> = {
  task_assigned: (d) => `📋 ${d.assignerName} הקצה לך: "${d.taskTitle}" — כן, זה עליך`,
  task_reminder: (d) => {
    const titles = d.titles as string[]
    return titles.length === 1
      ? `⏰ ${titles[0]} לא הולך להיעשות לבד...`
      : `📋 ${titles.length} משימות מסתכלות עליך ממש עכשיו`
  },
  task_done: (d) => `✅ ${d.doerName} סיים את "${d.taskTitle}" — מישהו חייב תודה 🙏`,
  morning: (d) => {
    const count = d.count as number
    return count > 0
      ? `☀️ בוקר! ${count} משימות מחכות. הקפה יכול לחכות, הן לא`
      : '☀️ בוקר נקי! אין משימות. נשמור את זה לעוד שעה'
  },
  evening: (d) => {
    const count = d.count as number
    return count > 0
      ? `🌙 ערב. ${count} משימות לא זזו מאז הבוקר. ראינו ראינו 👀`
      : '🌙 ערב! סיימתם הכל. אגדה ממש 🏆'
  },
  overtake: (d) => `🔥 ${d.overtakerName} זינק על ${d.overtakenName} ב-${d.byPoints} נק׳. נוח לך כך?`,
  shopping: (d) => `🛒 ${d.shopperName} בסופר עכשיו — שלחו בקשות לפני שיחזור!`,
}

function buildPrompt(context: PushContext, data: Record<string, unknown>): string {
  switch (context) {
    case 'task_assigned':
      return `${data.assignerName} הקצה לך משימה: "${data.taskTitle}". כתוב הודעה קצרה ומצחיקה לאדם שקיבל את המשימה.`
    case 'task_reminder': {
      const titles = (data.titles as string[]).slice(0, 3).join(', ')
      const count = (data.titles as string[]).length
      return `יש ${count} משימות שמחכות: ${titles}. כתוב תזכורת מצחיקה ומעצבנת קצת לאדם שצריך לבצע אותן.`
    }
    case 'task_done':
      return `${data.doerName} סיים את המשימה: "${data.taskTitle}". כתוב הודעה קצרה ומצחיקה לשאר בני הבית.`
    case 'morning': {
      const titles = (data.titles as string[]).slice(0, 3).join(', ')
      return `בוקר טוב! יש ${data.count} משימות היום: ${titles}. כתוב הודעת בוקר מצחיקה ומעוררת.`
    }
    case 'evening': {
      const titles = (data.titles as string[]).slice(0, 3).join(', ')
      return `ערב. עדיין ${data.count} משימות לא בוצעו: ${titles}. כתוב הודעת ערב מצחיקה ומביכה.`
    }
    case 'overtake':
      return `${data.overtakerName} עקף את ${data.overtakenName} ב-${data.byPoints} נקודות. כתוב "שריפה" מצחיקה ל${data.overtakenName}.`
    case 'shopping':
      return `${data.shopperName} בסופרמרקט עכשיו. כתוב "מנצל אחרון" מצחיק לשאר בני הבית שישלחו בקשות.`
  }
}

export async function generateAiPushMessage(
  context: PushContext,
  data: Record<string, unknown>
): Promise<string> {
  const fallback = FALLBACKS[context](data)

  const system = 'אתה שותף לדירה ישראלי שנון וקצת ציני אבל חביב. כתוב הודעת push קצרה בעברית בלבד (עד 90 תווים). השתמש בסלנג ישראלי, כלול אימוג׳ים רלוונטיים. הוצא רק את טקסט ההודעה, ללא הסברים.'
  const prompt = buildPrompt(context, data)

  if (ollamaAvailable()) {
    try {
      const text = await ollamaChat(
        [{ role: 'system', content: system }, { role: 'user', content: prompt }],
        { maxTokens: 100, timeoutMs: 8000 },
      )
      if (text && text.length <= 130) {
        console.log(`[ai-push] context=${context} provider=ollama length=${text.length}`)
        return text
      }
    } catch { /* fall through to Claude */ }
  }

  if (!process.env.ANTHROPIC_API_KEY) return fallback
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const result = await Promise.race<Anthropic.Message | never>([
      client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        system,
        messages: [{ role: 'user', content: prompt }],
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
    ])
    const text = result.content[0]?.type === 'text' ? result.content[0].text.trim() : ''
    if (!text || text.length > 130) return fallback
    console.log(`[ai-push] context=${context} provider=claude length=${text.length}`)
    return text
  } catch {
    return fallback
  }
}
