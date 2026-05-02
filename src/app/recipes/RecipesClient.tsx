'use client'

import { useState, useEffect, useRef } from 'react'
import BackButton from '@/components/BackButton'

interface Ingredient {
  id?: string
  name: string
  quantity: string | null
  unit: string | null
  sort_order: number
}

interface Recipe {
  id: string
  title: string
  category: string
  servings: number | null
  prep_time: number | null
  instructions: string | null
  recipe_ingredients: Ingredient[]
}

const CATEGORIES: { value: string; label: string; icon: string; color: string }[] = [
  { value: 'breakfast', label: 'ארוחת בוקר', icon: '🍳', color: 'bg-amber-50' },
  { value: 'lunch', label: 'ארוחת צהריים', icon: '🥗', color: 'bg-emerald-50' },
  { value: 'dinner', label: 'ארוחת ערב', icon: '🍽️', color: 'bg-violet-50' },
  { value: 'shabbat', label: 'שבת', icon: '🕯️', color: 'bg-yellow-50' },
  { value: 'cooked_salad', label: 'סלט מבושל', icon: '🥘', color: 'bg-orange-50' },
  { value: 'fresh_salad', label: 'סלט חי', icon: '🥬', color: 'bg-green-50' },
  { value: 'dessert', label: 'קינוח', icon: '🍰', color: 'bg-pink-50' },
  { value: 'snack', label: 'חטיף', icon: '🥨', color: 'bg-zinc-50' },
  { value: 'drink', label: 'שתייה', icon: '🥤', color: 'bg-sky-50' },
  { value: 'other', label: 'אחר', icon: '📖', color: 'bg-zinc-50' },
]

function categoryMeta(cat: string) {
  return CATEGORIES.find(c => c.value === cat) ?? { label: cat, icon: '📖', color: 'bg-zinc-50', value: cat }
}

function formatNum(n: number): string {
  if (n === Math.floor(n)) return String(Math.floor(n))
  const quarters = Math.round(n * 4) / 4
  if (quarters === Math.floor(quarters)) return String(Math.floor(quarters))
  const whole = Math.floor(quarters)
  const frac = quarters - whole
  const fracStr = frac === 0.25 ? '¼' : frac === 0.5 ? '½' : frac === 0.75 ? '¾' : n.toFixed(1)
  return whole > 0 ? `${whole}${fracStr}` : fracStr
}

function scaleQuantity(qty: string | null, factor: number): string {
  if (!qty || factor === 1) return qty ?? ''
  const fracMatch = qty.match(/^(\d+)\s*\/\s*(\d+)$/)
  if (fracMatch) return formatNum((parseInt(fracMatch[1]) / parseInt(fracMatch[2])) * factor)
  const mixedMatch = qty.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/)
  if (mixedMatch) return formatNum((parseInt(mixedMatch[1]) + parseInt(mixedMatch[2]) / parseInt(mixedMatch[3])) * factor)
  const num = parseFloat(qty.replace(',', '.'))
  if (isNaN(num)) return qty
  return formatNum(num * factor)
}

const SCALE_OPTIONS = [
  { label: '½×', value: 0.5 },
  { label: '1×', value: 1 },
  { label: '1½×', value: 1.5 },
  { label: '2×', value: 2 },
  { label: '3×', value: 3 },
]

async function api(body: Record<string, unknown>) {
  const res = await fetch('/api/recipes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return res.json()
}

type IngForm = { name: string; quantity: string; unit: string }
type RecipeForm = { title: string; category: string; servings: string; prep_time: string; instructions: string; ingredients: IngForm[] }

const EMPTY_FORM: RecipeForm = {
  title: '', category: 'dinner', servings: '', prep_time: '', instructions: '', ingredients: [{ name: '', quantity: '', unit: '' }],
}

const inputCls = 'w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:focus:ring-violet-900/30 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 transition-all duration-150'

export default function RecipesClient() {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [scale, setScale] = useState(1)
  const [form, setForm] = useState<RecipeForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [addingToCart, setAddingToCart] = useState<string | null>(null)
  const [cartSuccess, setCartSuccess] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [showFavOnly, setShowFavOnly] = useState(false)
  const [pendingImages, setPendingImages] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      const stored = localStorage.getItem('recipe_favorites')
      if (stored) setFavorites(new Set(JSON.parse(stored)))
    } catch { /* ignore */ }
  }, [])

  function toggleFavorite(id: string) {
    setFavorites(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      try { localStorage.setItem('recipe_favorites', JSON.stringify([...next])) } catch { /* ignore */ }
      return next
    })
  }

  useEffect(() => {
    fetch('/api/recipes').then(r => r.json()).then(d => Array.isArray(d) && setRecipes(d)).finally(() => setLoading(false))
  }, [])

  function openRecipe(id: string) {
    setOpenId(prev => { const next = prev === id ? null : id; if (next !== prev) setScale(1); return next })
  }

  function startEditing(recipe: Recipe) {
    setEditingId(recipe.id)
    setForm({
      title: recipe.title, category: recipe.category,
      servings: recipe.servings?.toString() ?? '', prep_time: recipe.prep_time?.toString() ?? '',
      instructions: recipe.instructions ?? '',
      ingredients: recipe.recipe_ingredients.length > 0
        ? [...recipe.recipe_ingredients].sort((a, b) => a.sort_order - b.sort_order).map(i => ({ name: i.name, quantity: i.quantity ?? '', unit: i.unit ?? '' }))
        : [{ name: '', quantity: '', unit: '' }],
    })
    setSaveError(''); setShowAdd(true)
  }

  async function addRecipe(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setSaveError('')
    try {
      const ingredients = form.ingredients.filter(i => i.name.trim())
      const body = editingId ? { action: 'update', id: editingId, ...form, ingredients } : { action: 'add', ...form, ingredients }
      const data = await api(body)
      if (data?.error) { setSaveError(data.error) }
      else if (data) {
        if (editingId) setRecipes(prev => prev.map(r => r.id === editingId ? data : r))
        else setRecipes(prev => [data, ...prev])
        setShowAdd(false); setForm(EMPTY_FORM); setEditingId(null)
      }
    } catch { setSaveError('שגיאת חיבור — נסה שוב') }
    setSaving(false)
  }

  async function addIngredientsToShopping(recipe: Recipe) {
    setAddingToCart(recipe.id)
    try {
      const ingredients = recipe.recipe_ingredients.filter(i => i.name.trim())
      await Promise.all(ingredients.map(ing => {
        const scaledQty = scaleQuantity(ing.quantity, scale)
        const qtyStr = [scaledQty, ing.unit].filter(Boolean).join(' ') || null
        return fetch('/api/shopping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add', text: ing.name, quantity: qtyStr }) })
      }))
      setCartSuccess(recipe.id)
      setTimeout(() => setCartSuccess(c => c === recipe.id ? null : c), 2500)
    } catch { /* network error */ }
    setAddingToCart(null)
  }

  async function deleteRecipe(id: string) {
    setRecipes(prev => prev.filter(r => r.id !== id))
    setConfirmDeleteId(null)
    await api({ action: 'delete', id })
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setPendingImages(prev => [...prev, ...files])
    setPreviews(prev => [...prev, ...files.map(f => URL.createObjectURL(f))])
    setParseError(null); e.target.value = ''
  }

  function removePendingImage(i: number) {
    URL.revokeObjectURL(previews[i])
    setPendingImages(prev => prev.filter((_, j) => j !== i))
    setPreviews(prev => prev.filter((_, j) => j !== i))
  }

  function clearPending() { previews.forEach(p => URL.revokeObjectURL(p)); setPendingImages([]); setPreviews([]) }

  function compressImage(file: File): Promise<{ imageBase64: string; mediaType: string }> {
    return new Promise((resolve, reject) => {
      const img = new Image(); const url = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(url); const MAX = 1600; let { width, height } = img
        if (width > MAX || height > MAX) { if (width > height) { height = Math.round(height * MAX / width); width = MAX } else { width = Math.round(width * MAX / height); height = MAX } }
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
        const ctx = canvas.getContext('2d')!; ctx.drawImage(img, 0, 0, width, height)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82)
        resolve({ imageBase64: dataUrl.split(',')[1], mediaType: 'image/jpeg' })
      }
      img.onerror = reject; img.src = url
    })
  }

  async function scanImages() {
    if (!pendingImages.length) return; setParsing(true); setParseError(null)
    try {
      const images = await Promise.all(pendingImages.map(compressImage))
      const body = images.length === 1 ? images[0] : { images }
      const res = await fetch('/api/recipes/parse-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (data.error) { setParseError(data.error === 'not a recipe' ? 'התמונות לא מכילות מתכון. נסה תמונות אחרות.' : `שגיאה: ${data.error}`) }
      else {
        setForm({ title: data.title ?? '', category: data.category ?? 'other', servings: data.servings?.toString() ?? '', prep_time: data.prep_time?.toString() ?? '', instructions: data.instructions ?? '', ingredients: (data.ingredients ?? []).map((i: { name: string; quantity?: string; unit?: string }) => ({ name: i.name, quantity: i.quantity ?? '', unit: i.unit ?? '' })) })
        clearPending(); setShowAdd(true)
      }
    } catch { setParseError('שגיאה בניתוח התמונות') }
    setParsing(false)
  }

  const inCategoryView = selectedCategory !== null || showFavOnly
  const filtered = recipes.filter(r => !showFavOnly || favorites.has(r.id)).filter(r => !selectedCategory || r.category === selectedCategory).filter(r => !search.trim() || r.title.includes(search) || (r.recipe_ingredients ?? []).some(i => i.name.includes(search)))
  const populatedCategories = CATEGORIES.map(c => ({ ...c, count: recipes.filter(r => r.category === c.value).length })).filter(c => c.count > 0)
  const activeCat = selectedCategory ? categoryMeta(selectedCategory) : null

  return (
    <>
    <div className="max-w-lg mx-auto px-4 pt-7 pb-nav page-in">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 min-w-0">
          {inCategoryView && (
            <button onClick={() => { setSelectedCategory(null); setShowFavOnly(false); setSearch(''); setOpenId(null) }}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors duration-150">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
          )}
          <div className="min-w-0">
            {showFavOnly ? <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">⭐ מועדפים</h1>
              : activeCat ? <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{activeCat.icon} {activeCat.label}</h1>
              : <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">מתכונים</h1>}
            {inCategoryView && <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{filtered.length} מתכונים</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!inCategoryView && favorites.size > 0 && (
            <button onClick={() => setShowFavOnly(true)} className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-amber-500 hover:bg-amber-50 transition-colors duration-150">⭐</button>
          )}
          <button onClick={() => fileRef.current?.click()} disabled={parsing}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-violet-600 hover:bg-violet-50 transition-colors duration-150 disabled:opacity-40 relative">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
            {pendingImages.length > 0 && <span className="absolute -top-0.5 -left-0.5 w-4 h-4 bg-violet-600 text-white text-[9px] rounded-full flex items-center justify-center font-bold">{pendingImages.length}</span>}
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />
          <BackButton />
        </div>
      </div>

      {/* Pending images panel */}
      {pendingImages.length > 0 && !parsing && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{pendingImages.length === 1 ? 'תמונה 1 נבחרה' : `${pendingImages.length} תמונות נבחרו`}</p>
            <div className="flex items-center gap-2">
              <button onClick={clearPending} className="text-xs text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 transition-colors duration-150">נקה</button>
              <button onClick={scanImages} className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs rounded-xl font-semibold transition-colors duration-150">
                ✨ {pendingImages.length === 1 ? 'סרוק' : `סרוק ${pendingImages.length} תמונות`}
              </button>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {previews.map((src, i) => (
              <div key={i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="w-16 h-16 object-cover rounded-xl border border-zinc-200 dark:border-zinc-700" />
                <button onClick={() => removePendingImage(i)} className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 hover:bg-rose-600 rounded-full text-white text-[10px] flex items-center justify-center transition-colors duration-150">✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {parsing && (
        <div className="bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800/60 rounded-2xl px-4 py-3.5 mb-4 flex items-center gap-3">
          <span className="text-sm animate-spin inline-block">⏳</span>
          <p className="text-sm text-violet-600 dark:text-violet-400 font-medium">{pendingImages.length > 1 ? `מנתח ${pendingImages.length} תמונות...` : 'מנתח תמונה...'}</p>
        </div>
      )}

      {parseError && (
        <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 text-sm px-4 py-3 rounded-2xl mb-4 text-center">{parseError}</div>
      )}

      {/* Add/edit recipe form */}
      {showAdd && (
        <form onSubmit={addRecipe} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 mb-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{editingId ? 'עריכת מתכון' : 'מתכון חדש'}</p>
            <button type="button" onClick={() => { setShowAdd(false); setForm(EMPTY_FORM); setEditingId(null) }}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors duration-150">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>

          <input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="שם המתכון *" className={inputCls} />

          <div className="grid grid-cols-4 gap-1.5">
            {CATEGORIES.map(c => (
              <button key={c.value} type="button" onClick={() => setForm(f => ({ ...f, category: c.value }))}
                className={`flex flex-col items-center gap-0.5 py-2.5 rounded-xl text-xs border transition-colors duration-150 ${form.category === c.value ? 'bg-violet-50 border-violet-200 text-violet-700' : 'bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300'}`}>
                <span className="text-base">{c.icon}</span>
                <span className="text-[9px] font-medium">{c.label}</span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input value={form.servings} onChange={e => setForm(f => ({ ...f, servings: e.target.value }))} placeholder="מנות" type="number" min={1} className={inputCls} />
            <input value={form.prep_time} onChange={e => setForm(f => ({ ...f, prep_time: e.target.value }))} placeholder="זמן הכנה (דק')" type="number" min={1} className={inputCls} />
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2.5">מצרכים</p>
            <div className="space-y-2">
              {form.ingredients.map((ing, i) => (
                <div key={i} className="grid grid-cols-5 gap-1.5">
                  <input value={ing.name} onChange={e => setForm(f => { const ingredients = [...f.ingredients]; ingredients[i] = { ...ingredients[i], name: e.target.value }; return { ...f, ingredients } })} placeholder="מצרך" className={inputCls + ' col-span-3'} />
                  <input value={ing.quantity} onChange={e => setForm(f => { const ingredients = [...f.ingredients]; ingredients[i] = { ...ingredients[i], quantity: e.target.value }; return { ...f, ingredients } })} placeholder="כמות" className={inputCls} />
                  <input value={ing.unit} onChange={e => setForm(f => { const ingredients = [...f.ingredients]; ingredients[i] = { ...ingredients[i], unit: e.target.value }; return { ...f, ingredients } })} placeholder="יח'" className={inputCls} />
                </div>
              ))}
              <button type="button" onClick={() => setForm(f => ({ ...f, ingredients: [...f.ingredients, { name: '', quantity: '', unit: '' }] }))}
                className="text-xs text-violet-600 hover:text-violet-700 font-medium transition-colors duration-150">
                + הוסף מצרך
              </button>
            </div>
          </div>

          <textarea value={form.instructions} onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))} placeholder="הוראות הכנה" rows={4} className={inputCls + ' resize-none'} />

          {saveError && <p className="text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl px-3 py-2 text-center">{saveError}</p>}
          <button type="submit" disabled={saving} className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white py-3 rounded-xl text-sm font-semibold transition-colors duration-150">
            {saving ? 'שומר...' : editingId ? 'שמור שינויים' : 'שמור מתכון'}
          </button>
        </form>
      )}

      {loading && <div className="text-center py-16 text-zinc-400 dark:text-zinc-500 text-sm">טוען...</div>}

      {/* Empty state */}
      {!loading && recipes.length === 0 && !showAdd && (
        <div className="text-center py-16">
          <p className="text-5xl mb-4">🍳</p>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm font-medium mb-5">ספר המתכונים ריק עדיין</p>
          <button onClick={() => fileRef.current?.click()} disabled={parsing}
            className="inline-flex items-center gap-2 px-5 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-violet-300 hover:bg-violet-50 text-zinc-600 dark:text-zinc-300 hover:text-violet-700 text-sm rounded-2xl transition-all duration-150 disabled:opacity-50 font-medium">
            <span className="text-lg">📷</span>סרוק מתכון מתמונה
          </button>
          <p className="text-zinc-400 dark:text-zinc-500 text-xs mt-3">או לחץ + להוסיף ידנית</p>
        </div>
      )}

      {/* Category grid */}
      {!loading && !inCategoryView && !showAdd && populatedCategories.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {populatedCategories.map(cat => (
            <button key={cat.value} onClick={() => { setSelectedCategory(cat.value); setOpenId(null); setSearch('') }}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden text-right hover:border-violet-200 hover:shadow-sm active:scale-[0.98] transition-all duration-150">
              <div className={`${cat.color} flex items-center justify-center py-7 text-4xl`}>
                {cat.icon}
              </div>
              <div className="p-3.5">
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{cat.label}</p>
                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{cat.count === 1 ? 'מתכון 1' : `${cat.count} מתכונים`}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Recipe list inside category or favorites */}
      {!loading && inCategoryView && (
        <>
          {filtered.length > 3 && (
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..." className={inputCls + ' mb-4'} />
          )}

          {filtered.length === 0 && (
            <div className="text-center py-12 text-zinc-400 dark:text-zinc-500 text-sm">אין מתכונים כאן עדיין</div>
          )}

          {filtered.length > 0 && (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden">
              {filtered.map(recipe => {
                const cat = categoryMeta(recipe.category)
                const open = openId === recipe.id
                const hasScalableIngredients = recipe.recipe_ingredients.some(i => i.quantity && !isNaN(parseFloat(i.quantity)))
                return (
                  <div key={recipe.id}>
                    <button className="w-full flex items-center gap-3 px-4 py-4 text-right hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors duration-150" onClick={() => openRecipe(recipe.id)}>
                      <span className={`text-2xl w-10 h-10 flex items-center justify-center ${cat.color} rounded-xl flex-shrink-0`}>{cat.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex-1 truncate">{recipe.title}</p>
                          <button onClick={e => { e.stopPropagation(); toggleFavorite(recipe.id) }}
                            className={`flex-shrink-0 text-base transition-all duration-150 ${favorites.has(recipe.id) ? 'opacity-100' : 'opacity-25 hover:opacity-60'}`}>⭐</button>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {showFavOnly && <span className="text-xs text-zinc-400 dark:text-zinc-500">{cat.label}</span>}
                          {recipe.servings && <span className="text-xs text-zinc-400 dark:text-zinc-500">{recipe.servings} מנות</span>}
                          {recipe.prep_time && <span className="text-xs text-zinc-400 dark:text-zinc-500">{recipe.prep_time} דק'</span>}
                        </div>
                      </div>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-zinc-300 dark:text-zinc-600 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6" /></svg>
                    </button>

                    {open && (
                      <div className="border-t border-zinc-100 dark:border-zinc-800 px-4 pb-4 pt-3 bg-zinc-50/50 dark:bg-zinc-800/30">
                        {recipe.recipe_ingredients.length > 0 && (
                          <div className="mb-4">
                            <div className="flex items-center justify-between mb-2.5">
                              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">מצרכים</p>
                              {hasScalableIngredients && (
                                <div className="flex items-center gap-1">
                                  {SCALE_OPTIONS.map(opt => (
                                    <button key={opt.value} onClick={() => setScale(opt.value)}
                                      className={`px-2 py-1 rounded-lg text-[11px] font-semibold border transition-colors duration-100 ${scale === opt.value ? 'bg-violet-50 border-violet-200 text-violet-700' : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300'}`}>
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="space-y-2">
                              {[...recipe.recipe_ingredients].sort((a, b) => a.sort_order - b.sort_order).map((ing, i) => (
                                <div key={ing.id ?? i} className="flex items-center gap-2 text-sm">
                                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0" />
                                  <span className="text-zinc-700 dark:text-zinc-200 flex-1">{ing.name}</span>
                                  {(ing.quantity || ing.unit) && (
                                    <span className="text-zinc-500 dark:text-zinc-400 text-xs tabular-nums font-medium">{scaleQuantity(ing.quantity, scale)}{ing.unit ? ` ${ing.unit}` : ''}</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {recipe.instructions && (
                          <div className="mb-4">
                            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2">הכנה</p>
                            <p className="text-sm text-zinc-700 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap">{recipe.instructions}</p>
                          </div>
                        )}

                        <div className="flex items-center gap-4 pt-1 border-t border-zinc-100 dark:border-zinc-800">
                          {recipe.recipe_ingredients.length > 0 && (
                            <button onClick={() => addIngredientsToShopping(recipe)}
                              disabled={addingToCart === recipe.id || cartSuccess === recipe.id}
                              className={`text-xs font-semibold disabled:opacity-60 transition-all duration-150 flex items-center gap-1 ${cartSuccess === recipe.id ? 'text-emerald-600 dark:text-emerald-400' : 'text-violet-600 hover:text-violet-700'}`}>
                              {cartSuccess === recipe.id ? '✓ נוסף לקניות!' : addingToCart === recipe.id ? '🛒 מוסיף...' : scale !== 1 ? `🛒 הוסף לקניות (${scale}×)` : '🛒 הוסף לקניות'}
                            </button>
                          )}
                          <button onClick={() => startEditing(recipe)} className="text-xs text-zinc-400 dark:text-zinc-500 hover:text-violet-600 font-medium transition-colors duration-150">ערוך</button>
                          {confirmDeleteId === recipe.id ? (
                            <div className="flex items-center gap-1 mr-auto">
                              <button onClick={() => setConfirmDeleteId(null)}
                                className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 font-medium transition-colors duration-150">ביטול</button>
                              <button onClick={() => deleteRecipe(recipe.id)}
                                className="text-xs text-white font-semibold bg-rose-500 hover:bg-rose-600 px-2 py-0.5 rounded-lg transition-colors duration-150">מחק</button>
                            </div>
                          ) : (
                            <button onClick={() => setConfirmDeleteId(recipe.id)}
                              className="text-xs text-zinc-400 dark:text-zinc-500 hover:text-rose-500 font-medium transition-colors duration-150 mr-auto">מחק</button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

    </div>
    {/* FAB — outside page-in to avoid transform stacking context */}
    <button
      onClick={() => { setShowAdd(v => !v); setEditingId(null); setForm(EMPTY_FORM) }}
      className="fixed bottom-24 left-6 z-50 w-14 h-14 bg-violet-600 text-white rounded-full shadow-lg flex items-center justify-center text-2xl active:scale-95 transition-transform"
      aria-label={showAdd ? 'סגור' : 'הוסף מתכון'}
    >
      {showAdd ? '×' : '+'}
    </button>
    </>
  )
}
