---
name: homebase-cron
description: Lightweight HomeBase skill for automated cron jobs only — no knowledge base
version: 1.0.0
metadata:
  openclaw:
    requires:
      env: [HOMEBASE_TOKEN]
    primaryEnv: HOMEBASE_TOKEN
    emoji: "⚙️"
---

# HomeBase Cron Skill

Language: Hebrew. Respond concisely.
Base URL: https://fantastic-waddle-coral.vercel.app
Auth: `Authorization: Bearer homebase-bot-2025`
Platform: Windows PowerShell — always inline JSON, never `-d @file`.

## API

```
GET  /api/bot/briefing                                      — tasks+shopping+budget (one call)
GET  /api/bot/budget                                        — monthly summary
POST /api/bot/budget   {"amount":N,"description":"X"}       — add expense
GET  /api/bot/tasks                                         — overdue + next 7 days
POST /api/bot/tasks/complete  {"title":"X"}                 — mark done
GET  /api/bot/shopping                                      — pending items
POST /api/bot/shopping  {"items":[{"text":"X"}]}            — add items
POST /api/bot/shopping/done  {"text":"X"}                   — mark bought
GET  /api/bot/sync-sally                                    — check pending flag (pending: bool)
POST /api/bot/notify   {"message":"X"}                      — push to all household devices
GET  /api/bot/memory                                        — household facts
GET  /api/bot/bulletin                                      — recent posts
```

## Sally Sync
`GET /api/bot/sync-sally` → if `pending: false` → **stop immediately, do nothing**.
If `pending: true` → send "?" to +972559733562 → wait for reply → POST /api/bot/shopping.

## Rules
- If task says "stop if nothing to do" — stop. Don't send messages.
- After acting: POST /api/bot/notify with one-line Hebrew summary.
- WhatsApp send: `openclaw message send --channel whatsapp --target NUMBER --message "TEXT"`
