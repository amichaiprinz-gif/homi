/**
 * Hebrew-to-English translation dictionary for common Israeli grocery items.
 * Used to translate user shopping list entries into English before searching
 * Open Food Facts (which returns better results with English queries).
 */

const DICT: Record<string, string> = {
  // Dairy
  'חלב': 'milk',
  'חלב גדול': 'milk',
  'חלב קטן': 'milk',
  'גבינה': 'cheese',
  'גבינה לבנה': 'white cheese',
  'גבינה צהובה': 'yellow cheese',
  'גבינה קשה': 'hard cheese',
  "קוטג'": 'cottage cheese',
  'קוטג': 'cottage cheese',
  'יוגורט': 'yogurt',
  'לבן': 'labaneh',
  'שמנת': 'cream',
  'קצפת': 'whipping cream',
  'חמאה': 'butter',
  'מרגרינה': 'margarine',
  'גבינת שמנת': 'cream cheese',

  // Bread & Bakery
  'לחם': 'bread',
  'לחם לבן': 'white bread',
  'לחם חום': 'whole wheat bread',
  'פיתה': 'pita',
  'חלה': 'challah',
  'לחמנייה': 'bread roll',
  'לחמניות': 'bread rolls',
  'קרואסון': 'croissant',
  'בייגלה': 'bagel',

  // Eggs
  'ביצים': 'eggs',
  'ביצה': 'eggs',

  // Produce - Vegetables
  'עגבניות': 'tomatoes',
  'עגבנייה': 'tomato',
  'מלפפון': 'cucumber',
  'מלפפונים': 'cucumbers',
  'חסה': 'lettuce',
  'גזר': 'carrot',
  'גזרים': 'carrots',
  'בצל': 'onion',
  'בצלים': 'onions',
  'שום': 'garlic',
  'תפוח אדמה': 'potato',
  'תפוחי אדמה': 'potatoes',
  'פלפל': 'pepper',
  'פלפלים': 'peppers',
  'ברוקולי': 'broccoli',
  'כרובית': 'cauliflower',
  'תרד': 'spinach',
  'עלי תרד': 'spinach',
  'כרוב': 'cabbage',
  'סלרי': 'celery',
  'אספרגוס': 'asparagus',
  'בטטה': 'sweet potato',
  'בטטות': 'sweet potatoes',
  'פטרייה': 'mushroom',
  'פטריות': 'mushrooms',
  'תירס': 'corn',
  'שעועית': 'beans',
  'אפונה': 'peas',
  'חצילים': 'eggplant',
  'חציל': 'eggplant',
  'קישוא': 'zucchini',
  'לפת': 'turnip',

  // Produce - Fruit
  'תפוח': 'apple',
  'תפוחים': 'apples',
  'בננה': 'banana',
  'בננות': 'bananas',
  'לימון': 'lemon',
  'לימונים': 'lemons',
  'תפוז': 'orange',
  'תפוזים': 'oranges',
  'ענבים': 'grapes',
  'אבוקדו': 'avocado',
  'מנגו': 'mango',
  'אבטיח': 'watermelon',
  'מלון': 'melon',
  'אגס': 'pear',
  'אגסים': 'pears',
  'קלמנטינה': 'clementine',
  'קלמנטינות': 'clementines',
  'אננס': 'pineapple',
  'תות': 'strawberry',
  'תותים': 'strawberries',
  'אוכמניות': 'blueberries',
  'פטל': 'raspberry',
  'דובדבן': 'cherry',
  'שזיף': 'plum',
  'אפרסק': 'peach',
  'משמש': 'apricot',
  'רימון': 'pomegranate',

  // Meat & Protein
  'עוף': 'chicken',
  'חזה עוף': 'chicken breast',
  'שוקיים': 'chicken thighs',
  'כנפיים': 'chicken wings',
  'בשר': 'beef',
  'בקר': 'beef',
  'כבש': 'lamb',
  'דגים': 'fish',
  'סלמון': 'salmon',
  'טונה': 'tuna',
  'נקניק': 'sausage',
  'נקניקייה': 'hot dog',
  'נקניקיות': 'hot dogs',
  'קציצות': 'meatballs',
  'שניצל': 'schnitzel',

  // Pantry staples
  'קמח': 'flour',
  'סוכר': 'sugar',
  'אורז': 'rice',
  'פסטה': 'pasta',
  'ספגטי': 'spaghetti',
  'שמן זית': 'olive oil',
  'שמן': 'cooking oil',
  'חומץ': 'vinegar',
  'מלח': 'salt',
  'פלפל שחור': 'black pepper',
  'כמון': 'cumin',
  'פפריקה': 'paprika',
  'כורכום': 'turmeric',
  'קינמון': 'cinnamon',
  'ורד': 'rose water',
  'סודה לשתייה': 'baking soda',
  'אבקת אפייה': 'baking powder',
  'שמרים': 'yeast',
  'גלידה': 'ice cream',
  'שוקולד': 'chocolate',
  'שוקולד מריר': 'dark chocolate',

  // Condiments & Spreads
  'מיונז': 'mayonnaise',
  'קטשופ': 'ketchup',
  'חרדל': 'mustard',
  'טחינה': 'tahini',
  'חומוס': 'hummus',
  'ריבה': 'jam',
  'ממרח שוקולד': 'chocolate spread',
  'נוטלה': 'nutella',
  'דבש': 'honey',
  'סילאן': 'date syrup',
  'חומוס גינה': 'chickpeas',

  // Beverages
  'מים': 'water',
  'מיץ': 'juice',
  'מיץ תפוזים': 'orange juice',
  'מיץ תפוחים': 'apple juice',
  'קפה': 'coffee',
  'תה': 'tea',
  'קולה': 'cola',
  'סודה': 'soda',
  'בירה': 'beer',
  'יין': 'wine',

  // Breakfast & Cereals
  'קורנפלקס': 'cornflakes',
  'גרנולה': 'granola',
  'שיבולת שועל': 'oatmeal',

  // Nuts & Snacks
  'שקדים': 'almonds',
  'אגוזים': 'walnuts',
  'פיסטוק': 'pistachio',
  'צימוקים': 'raisins',
  'תמרים': 'dates',
  'חטיף': 'snack',
  'ביסקוויט': 'biscuit',
  'קרקר': 'cracker',
  'פצפוצים': 'popcorn',

  // Canned & Packaged
  'שימורי טונה': 'canned tuna',
  'שימורי עגבניות': 'canned tomatoes',
  'רסק עגבניות': 'tomato paste',
  'שימורי שעועית': 'canned beans',
  'קרם קוקוס': 'coconut cream',
  'חלב קוקוס': 'coconut milk',

  // Cleaning & Household
  'סבון': 'soap',
  'שמפו': 'shampoo',
  'מרכך': 'conditioner',
  'נייר טואלט': 'toilet paper',
  'מגבונים': 'wipes',
  'חומר ניקוי': 'cleaning product',
  'אקונומיקה': 'bleach',
  'סבון כלים': 'dish soap',
}

/**
 * Translates a Hebrew grocery item text to an English search term.
 * Returns null if the item is not in the dictionary (caller should fall back
 * to using the Hebrew text directly for the OFF search).
 */
export function hebrewToEnglish(text: string): string | null {
  const normalized = text.trim().replace(/[״"׳'"]/g, '').replace(/\s+/g, ' ')
  // Exact match (case-insensitive for Hebrew)
  const directMatch = DICT[normalized]
  if (directMatch) return directMatch
  // Lowercase match
  const lower = normalized.toLowerCase()
  for (const [he, en] of Object.entries(DICT)) {
    if (he.toLowerCase() === lower) return en
  }
  return null
}
