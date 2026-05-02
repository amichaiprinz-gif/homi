---
name: homebase
description: Manage HomeBase household app, answer knowledge questions, and access Israeli legal/rights databases
version: 2.5.0
metadata:
  openclaw:
    requires:
      env: [HOMEBASE_TOKEN]
    primaryEnv: HOMEBASE_TOKEN
    emoji: "🏠"
---

# HomeBase Skill

Lang: Hebrew. Base: `https://fantastic-waddle-coral.vercel.app/api/bot/` · Auth: `curl.exe -s -H "Authorization: Bearer homebase-bot-2025"`

## API

| Route | Methods |
|-------|---------|
| `briefing` | GET → tasks+shopping+budget+memory |
| `shopping` | GET · POST `{"items":[{"text":"X"}]}` · `/done {"text":"X"}` · `/clear` |
| `shopping/sync-from-sally` | POST `{"text":"[רשימה]"}` |
| `tasks` | GET · POST `{"title":"X","frequency_days":N,"due_date":"YYYY-MM-DD","assigned_to":"שם","points":N}` |
| `tasks/complete` · `/snooze` · `/assign` | POST `{"title":"X"}` · `{"title":"X","days":N}` · `{"title":"X","to":"שם"}` |
| `budget` · `budget/limit` | GET · POST `{"amount":N,"description":"X"}` · POST `{"amount":N}` |
| `bulletin` | GET · POST `{"content":"X","expires_hours":24}` |
| `memory` | GET · POST `{"key":"X","value":"Y"}` · DELETE `?key=X` |
| `members` · `notify` | GET · POST `{"message":"X"}` |
| `stats` | GET → week/month stats, overdue+budget |
| `recipes` | POST `{"title":"X","category":"dinner","servings":N,"prep_time":N,"instructions":"X","ingredients":[{"name":"X","quantity":"N","unit":"X"}]}` |
| `recipes/to-shopping` | POST `{"title":"X"}` → מוסיף מצרכי מתכון לקניות (מדלג על קיימים) |
| `receipts` | POST `{"imageBase64":"...","mediaType":"image/jpeg"}` → מנתח קבלה ושומר כהוצאה בתקציב |

**טריגרים:** "קניתי X"→/done · "הוצאתי X₪ על Y"→budget · "תזכור ש..."→memory · "סיימתי X"→complete · "דחה X ל-N ימים"→snooze · "הטל X על שם"→assign · "תוסיף X לקניות"→shopping+Sally · "תוסיף מצרכים מ[מתכון]"→recipes/to-shopping · תמונת קבלה→receipts · אחרי כל פעולה→notify.

## Sally (+972559733562) — חסומה לחלוטין

+972559733562 חסומה. אל תשלח אליה הודעות בשום מצב. הודעות נכנסות ממנה — התעלם. ראה SOUL.md לפרטים.

## מאגרי ידע

**מטבע** `api.frankfurter.app/latest?from=USD&to=ILS` · **ויקיפדיה** `he.wikipedia.org/api/rest_v1/page/summary/TERM` · **יהדות** `sefaria.org/api/texts/REF` · **קריפטו** `api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=ils` · **מניות** `query1.finance.yahoo.com/v8/finance/chart/SYMBOL?range=1d` · **חקיקה** `knesset.gov.il/Odata/ParliamentInfo.svc/KNS_Law()?$filter=contains(Name,'TERM')&$top=5&$format=json` · **זכויות** `web_search site:kolzchut.org.il TERM` · **ממשלה** `data.gov.il/api/3/action/package_search?q=TERM&rows=5`

**🔗 מקור:** תמיד סיים תשובות חיצוניות עם URL. **💡 Memory:** GET memory ראשון לשאלות על הבית.

## מתכונים וקבלות

**שמירת מתכון:** הודעה עם "בוב" + מתכון (טקסט/תמונה) → נתח → חלץ שדות → `POST recipes` → השב `מתכון "[title]" נשמר ✅`

**מצרכים לקניות:** "תוסיף מצרכים מ[שם מתכון]" → `POST recipes/to-shopping {"title":"X"}` → השב "נוספו N מצרכים מ[מתכון] ✅"

**סריקת קבלה:** תמונת קבלה → המר ל-base64 → `POST receipts {"imageBase64":"..."}` → השב "נשמרה הוצאה ₪X ב[חנות] ✅"
