/**
 * Shared auth helper for all /api/bot/* routes.
 *
 * Validates the Authorization: Bearer <BOT_TOKEN> header against the
 * BOT_TOKEN environment variable, and returns the configured household ID.
 *
 * Required Vercel env vars:
 *   BOT_TOKEN         — random secret shared with OpenClaw
 *   BOT_HOUSEHOLD_ID  — the household UUID to operate on
 */

export function botAuth(req: Request): { householdId: string } | null {
  const token = process.env.BOT_TOKEN
  const householdId = process.env.BOT_HOUSEHOLD_ID

  if (!token || !householdId) return null

  const auth = req.headers.get('authorization') ?? ''
  const provided = auth.startsWith('Bearer ') ? auth.slice(7) : ''

  if (provided !== token) return null
  return { householdId }
}
