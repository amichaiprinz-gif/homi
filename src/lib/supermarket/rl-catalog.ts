/**
 * Curated Rami Levy product catalog for common Israeli grocery items.
 *
 * Data sourced directly from the Rami Levy API (store 331).
 * Used as primary lookup — bypasses any live API calls for well-known items.
 * Falls back to Open Food Facts for items not in this catalog.
 *
 * Products are ordered: best / most generic match first.
 */

const RL = 'https://www.rami-levy.co.il'

export interface CatalogProduct {
  name: string
  price: number
  imageUrl: string
  url: string
  brand: string | null
  contentText: string | null
}

// Keyed by normalized Hebrew search term.
// Multiple keys can point to the same products (e.g. בננות / בננה).
const CATALOG: Record<string, CatalogProduct[]> = {
  // ── Dairy ─────────────────────────────────────────────────────────────────
  'חלב': [
    { name: "חלב תנובה 3% שומן 1 ל' קרטון", price: 7.2, brand: 'תנובה', contentText: '1 ליטר', imageUrl: `${RL}/product/7290004131074/small.jpg`, url: `${RL}/product/3025` },
    { name: 'חלב טרי 3% 1 ליטר רמי לוי', price: 7.2, brand: 'רמי לוי', contentText: '1 ליטר', imageUrl: `${RL}/product/7290001794852/small.jpg`, url: `${RL}/product/419939` },
    { name: 'חלב 3% טרה 2 ליטר', price: 14.4, brand: 'טרה', contentText: '2 ליטר', imageUrl: `${RL}/product/7290102398065/small.jpg`, url: `${RL}/product/329258` },
    { name: 'חלב תנובה 1% 1 ליטר', price: 6.8, brand: 'תנובה', contentText: '1 ליטר', imageUrl: `${RL}/product/7290000042435/small.jpg`, url: `${RL}/product/154` },
  ],
  'גבינה לבנה': [
    { name: 'גבינה לבנה תנובה 5% שומן 250 גרם', price: 5.8, brand: 'תנובה', contentText: '250 גרם', imageUrl: `${RL}/product/7290000048185/small.jpg`, url: `${RL}/product/10147` },
    { name: 'גבינה לבנה תנובה 5% שומן 500 גרם', price: 11.6, brand: 'תנובה', contentText: '500 גרם', imageUrl: `${RL}/product/7290004127800/small.jpg`, url: `${RL}/product/2991` },
  ],
  'גבינה צהובה': [
    { name: 'גבינה צהובה עמק 28% שומן 400 גרם ואקום', price: 26.1, brand: 'עמק', contentText: '400 גרם', imageUrl: `${RL}/product/7290000057118/small.jpg`, url: `${RL}/product/261851` },
  ],
  "קוטג'": [
    { name: "קוטג' תנובה 5% שומן 250 ג' בד\"צ", price: 5.9, brand: 'תנובה', contentText: '250 גרם', imageUrl: `${RL}/product/7290004127329/small.jpg`, url: `${RL}/product/9360` },
    { name: "גבינת קוטג' מועשר 5% טרה 250 גרם", price: 6, brand: 'טרה', contentText: '250 גרם', imageUrl: `${RL}/product/7290002868996/small.jpg`, url: `${RL}/product/31164` },
  ],
  'יוגורט': [
    { name: 'יוגורט דנונה ביו לבן 3% שומן 8×150 מ"ל', price: 18.2, brand: 'דנונה', contentText: '8×150 מ"ל', imageUrl: `${RL}/product/7290005839078/small.jpg`, url: `${RL}/product/3523` },
    { name: 'יוגורט דנונה ביו לבן 1.7% שומן 8×150 מ"ל', price: 18.2, brand: 'דנונה', contentText: '8×150 מ"ל', imageUrl: `${RL}/product/7290006664990/small.jpg`, url: `${RL}/product/26585` },
  ],
  'חמאה': [
    { name: 'חמאה תנובה 200 גרם מהדרין', price: 9.6, brand: 'תנובה', contentText: '200 גרם', imageUrl: `${RL}/product/7290116932033/small.jpg`, url: `${RL}/product/411376` },
    { name: 'חמאה מפינלנד 200 גרם', price: 16, brand: null, contentText: '200 גרם', imageUrl: `${RL}/product/7290008175173/small.jpg`, url: `${RL}/product/7179` },
  ],

  // ── Bread ─────────────────────────────────────────────────────────────────
  'לחם': [
    { name: "לחם אחיד פרוס אנג'ל", price: 8.3, brand: "אנג'ל", contentText: '900 גרם', imageUrl: `${RL}/product/7290018500361/small.jpg`, url: `${RL}/product/397353` },
    { name: 'לחם אחיד פרוס 900 ג רמי לוי', price: 8.3, brand: 'רמי לוי', contentText: '900 גרם', imageUrl: `${RL}/product/7290018500408/small.jpg`, url: `${RL}/product/397356` },
    { name: "לחם פשוט מלא 750 אנג'ל", price: 16.9, brand: "אנג'ל", contentText: '750 גרם', imageUrl: `${RL}/product/7290014940901/small.jpg`, url: `${RL}/product/300335` },
  ],

  // ── Eggs ──────────────────────────────────────────────────────────────────
  'ביצים': [
    { name: 'ביצים 12 יחידות L', price: 14, brand: null, contentText: '12 יחידות', imageUrl: `${RL}/product/7290001201589/361918/medium.jpg`, url: `${RL}/product/361918` },
  ],

  // ── Produce ───────────────────────────────────────────────────────────────
  'עגבניות': [
    { name: 'עגבניות שרי ארוז', price: 11.5, brand: null, contentText: null, imageUrl: `${RL}/product/7290016270723/426869/medium.jpg`, url: `${RL}/product/426869` },
    { name: 'עגבניות שרי קלמר', price: 8, brand: null, contentText: null, imageUrl: `${RL}/product/321677`, url: `${RL}/product/321677` },
  ],
  'בננות': [
    { name: 'בננה', price: 9.9, brand: null, contentText: 'מחיר לק"ג', imageUrl: `${RL}/product/134/35/medium.jpg`, url: `${RL}/product/35` },
  ],
  'בננה': [
    { name: 'בננה', price: 9.9, brand: null, contentText: 'מחיר לק"ג', imageUrl: `${RL}/product/134/35/medium.jpg`, url: `${RL}/product/35` },
  ],

  // ── Condiments ────────────────────────────────────────────────────────────
  'מיונז': [
    { name: 'מיונז אמיתי 500 גרם רמי לוי', price: 9.3, brand: 'רמי לוי', contentText: '500 גרם', imageUrl: `${RL}/product/7290018711071/small.jpg`, url: `${RL}/product/388214` },
    { name: 'מיונז תלמה 500 גרם', price: 11.1, brand: 'תלמה', contentText: '500 גרם', imageUrl: `${RL}/product/7290000111186/small.jpg`, url: `${RL}/product/472` },
    { name: "מיונז הלמנס 394 גרם", price: 13.6, brand: "הלמנס", contentText: '394 גרם', imageUrl: `${RL}/product/7290000120836/small.jpg`, url: `${RL}/product/560` },
  ],
  'קטשופ': [
    { name: 'קטשופ היינץ 567 גרם', price: 17, brand: 'היינץ', contentText: '567 גרם', imageUrl: `${RL}/product/5000167005401/small.jpg`, url: `${RL}/product/570` },
  ],
  'חרדל': [
    { name: 'חרדל דיג\'ון 370 גרם מאסטר שף', price: 9.8, brand: 'מאסטר שף', contentText: '370 גרם', imageUrl: `${RL}/product/7290105439598/small.jpg`, url: `${RL}/product/311767` },
    { name: 'ממרח חרדל היינץ לחיץ', price: 13.2, brand: 'היינץ', contentText: null, imageUrl: `${RL}/product/7290003450602/small.jpg`, url: `${RL}/product/2722` },
  ],
  'טחינה': [
    { name: 'טחינה אלארז 500 גרם', price: 17.9, brand: 'אלארז', contentText: '500 גרם', imageUrl: `${RL}/product/7290001216040/small.jpg`, url: `${RL}/product/291588` },
    { name: 'טחינה משומשום אסלי 500 גרם', price: 13.7, brand: 'אסלי', contentText: '500 גרם', imageUrl: `${RL}/product/7290016781045/small.jpg`, url: `${RL}/product/407124` },
  ],
  'חומוס': [
    { name: 'חומוס לפיתה 700 גרם רמי לוי', price: 10.5, brand: 'רמי לוי', contentText: '700 גרם', imageUrl: `${RL}/product/7290115410969/small.jpg`, url: `${RL}/product/370203` },
    { name: "חומוס אחלה 750 גרם", price: 12.1, brand: "אחלה", contentText: '750 גרם', imageUrl: `${RL}/product/7290008645935/small.jpg`, url: `${RL}/product/26668` },
  ],

  // ── Pantry ────────────────────────────────────────────────────────────────
  'אורז': [
    { name: 'אורז פרסי סוגת 1 ק"ג', price: 10.1, brand: 'סוגת', contentText: '1 ק"ג', imageUrl: `${RL}/product/7290000211442/small.jpg`, url: `${RL}/product/912` },
    { name: 'אורז בסמטי קלאסי 1 ק"ג סוגת', price: 13.1, brand: 'סוגת', contentText: '1 ק"ג', imageUrl: `${RL}/product/7290003643004/small.jpg`, url: `${RL}/product/2789` },
  ],
  'פסטה': [
    { name: 'פסטה צינורות אסם 500 גרם', price: 7, brand: 'אסם', contentText: '500 גרם', imageUrl: `${RL}/product/7290107871990/small.jpg`, url: `${RL}/product/294258` },
    { name: 'פסטה מסולסלים אסם 500 גרם', price: 7, brand: 'אסם', contentText: '500 גרם', imageUrl: `${RL}/product/7290000060781/small.jpg`, url: `${RL}/product/230` },
  ],
  'קמח': [
    { name: 'קמח לבן רמי לוי 1 ק"ג', price: 3.8, brand: 'רמי לוי', contentText: '1 ק"ג', imageUrl: `${RL}/product/7290015834162/small.jpg`, url: `${RL}/product/305686` },
    { name: 'קמח חיטה לבן בהיר מנופה 1 ק"ג', price: 7, brand: null, contentText: '1 ק"ג', imageUrl: `${RL}/product/7290003060535/small.jpg`, url: `${RL}/product/362988` },
  ],
  'סוכר': [
    { name: 'סוכר לבן 1 ק"ג רמי לוי', price: 5, brand: 'רמי לוי', contentText: '1 ק"ג', imageUrl: `${RL}/product/7290113460607/small.jpg`, url: `${RL}/product/351639` },
    { name: 'סוכר לבן צנצנת סוגת 1 ק"ג', price: 12.1, brand: 'סוגת', contentText: '1 ק"ג', imageUrl: `${RL}/product/7290003643387/small.jpg`, url: `${RL}/product/2792` },
  ],
  'מלח': [
    { name: 'מלח שולחן בשקית 1 ק"ג רמי לוי', price: 1.9, brand: 'רמי לוי', contentText: '1 ק"ג', imageUrl: `${RL}/product/7290004064457/small.jpg`, url: `${RL}/product/396509` },
  ],
  'שמן זית': [
    { name: 'שמן זית כתית מעולה ספרד 750 מ"ל רמי לוי', price: 31.1, brand: 'רמי לוי', contentText: '750 מ"ל', imageUrl: `${RL}/product/7290117263389/small.jpg`, url: `${RL}/product/403654` },
    { name: 'שמן זית כתית מעולה 750 מ"ל זיתא', price: 35.2, brand: 'זיתא', contentText: '750 מ"ל', imageUrl: `${RL}/product/7290003427154/small.jpg`, url: `${RL}/product/2709` },
  ],
  'שמן': [
    { name: 'שמן קנולה וויטמין אי 1 ליטר רמי לוי', price: 12.6, brand: 'רמי לוי', contentText: '1 ליטר', imageUrl: `${RL}/product/7290020080059/small.jpg`, url: `${RL}/product/418619` },
    { name: 'שמן בריאות קנולה עץ הזית 1 ליטר', price: 15, brand: 'עץ הזית', contentText: '1 ליטר', imageUrl: `${RL}/product/7290000144474/small.jpg`, url: `${RL}/product/640` },
  ],

  // ── Beverages ─────────────────────────────────────────────────────────────
  'קפה': [
    { name: "קפה נמס 200 גרם עלית", price: 25.9, brand: 'עלית', contentText: '200 גרם', imageUrl: `${RL}/product/7290000176420/small.jpg`, url: `${RL}/product/773` },
    { name: "קפה נמס מיובש טסטרס צ'ויס 200 גרם", price: 36.2, brand: "טסטרס צ'ויס", contentText: '200 גרם', imageUrl: `${RL}/product/7290000072753/small.jpg`, url: `${RL}/product/354` },
  ],
  'תה': [
    { name: 'תה קלאסיק מעטפות ויסוצקי 50 יחידות', price: 12.9, brand: 'ויסוצקי', contentText: '50 יחידות', imageUrl: `${RL}/product/7290000345277/small.jpg`, url: `${RL}/product/5339` },
    { name: 'תה שחור קלאסי 120 שקיות', price: 21.9, brand: null, contentText: '120 שקיות', imageUrl: `${RL}/product/7290018440629/small.jpg`, url: `${RL}/product/377697` },
  ],
  'מיץ תפוזים': [
    { name: 'מיץ תפוזים סחוט פריגת 1 ליטר', price: 16.2, brand: 'פריגת', contentText: '1 ליטר', imageUrl: `${RL}/product/7290003009640/small.jpg`, url: `${RL}/product/2516` },
  ],

  // ── Sweets & Snacks ───────────────────────────────────────────────────────
  'שוקולד': [
    { name: 'שוקולד מריר 70% מגדים 100 גרם', price: 7.5, brand: 'מגדים', contentText: '100 גרם', imageUrl: `${RL}/product/7290000085106/small.jpg`, url: `${RL}/product/4148` },
    { name: 'שוקולד חלב עלית 100 גרם', price: 6.5, brand: 'עלית', contentText: '100 גרם', imageUrl: `${RL}/product/7290000088398/small.jpg`, url: `${RL}/product/9068` },
  ],

  // ── Household ─────────────────────────────────────────────────────────────
  'נייר טואלט': [
    { name: 'נייר טואלט רמי לוי 40 יחידות', price: 39.9, brand: 'רמי לוי', contentText: '40 גלילים', imageUrl: `${RL}/product/7290015835947/small.jpg`, url: `${RL}/product/304260` },
    { name: 'נייר טואלט מולט 48 גלילים', price: 40.2, brand: 'מולט', contentText: '48 גלילים', imageUrl: `${RL}/product/7290000262239/small.jpg`, url: `${RL}/product/28735` },
  ],
  'סבון כלים': [
    { name: 'סנו ספארק נוזל לכלים לימון משאבה 1 ליטר', price: 13.3, brand: 'סנו', contentText: '1 ליטר', imageUrl: `${RL}/product/7290107280761/small.jpg`, url: `${RL}/product/298546` },
    { name: 'נוזל כלים פיירי צהוב 1 ליטר', price: 17.9, brand: "פיירי", contentText: '1 ליטר', imageUrl: `${RL}/product/8700216811491/small.jpg`, url: `${RL}/product/423848` },
  ],
}

// Aliases — additional Hebrew forms pointing to same products
const ALIASES: Record<string, string> = {
  'חלב 3%': 'חלב',
  'ביצה': 'ביצים',
  'עגבנייה': 'עגבניות',
  'עגבניה': 'עגבניות',
  "קוטג": "קוטג'",
  'יוגרט': 'יוגורט',
  'מרגרינה': 'חמאה',
  'שמן קנולה': 'שמן',
  'לחם לבן': 'לחם',
  'לחם חום': 'לחם',
  'לחם מלא': 'לחם',
  'ספגטי': 'פסטה',
  'מקרוני': 'פסטה',
  'אורז לבן': 'אורז',
  'אורז בסמטי': 'אורז',
  'מיץ תפוז': 'מיץ תפוזים',
  'מיץ': 'מיץ תפוזים',
  'קפה נמס': 'קפה',
  'שמן זית כתית': 'שמן זית',
}

/**
 * Look up a Hebrew grocery text in the curated catalog.
 * Returns matched products (ordered best-first) or empty array if not found.
 */
export function lookupCatalog(text: string): CatalogProduct[] {
  const normalized = text.trim().replace(/[״"׳'"]/g, '').replace(/\s+/g, ' ')

  // Exact key match
  if (CATALOG[normalized]) return CATALOG[normalized]

  // Alias match
  const aliasKey = ALIASES[normalized]
  if (aliasKey && CATALOG[aliasKey]) return CATALOG[aliasKey]

  // Prefix match: input is a substring of a catalog key or vice versa
  for (const key of Object.keys(CATALOG)) {
    if (key.includes(normalized) || normalized.includes(key)) {
      return CATALOG[key]
    }
  }
  for (const [alias, target] of Object.entries(ALIASES)) {
    if (alias.includes(normalized) || normalized.includes(alias)) {
      return CATALOG[target] ?? []
    }
  }

  return []
}
