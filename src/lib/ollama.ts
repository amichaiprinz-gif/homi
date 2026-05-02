const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'gemma3:4b'

export function ollamaAvailable(): boolean {
  return Boolean(OLLAMA_BASE_URL)
}

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
  images?: string[]  // base64-encoded, no data URI prefix
}

export async function ollamaChat(
  messages: OllamaMessage[],
  opts: { maxTokens?: number; timeoutMs?: number } = {},
): Promise<string> {
  const { maxTokens = 1000, timeoutMs = 30000 } = opts

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(`${OLLAMA_BASE_URL!}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages,
        stream: false,
        options: { num_predict: maxTokens },
      }),
      signal: controller.signal,
    })

    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`)
    const data = await res.json() as { message?: { content?: string } }
    return data.message?.content?.trim() ?? ''
  } finally {
    clearTimeout(timer)
  }
}
