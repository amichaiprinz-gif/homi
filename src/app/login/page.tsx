'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Mode = 'login' | 'signup' | 'forgot'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [mode, setMode] = useState<Mode>('login')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const router = useRouter()

  function switchMode(m: Mode) { setMode(m); setError(''); setMessage('') }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(''); setMessage('')

    try {
      const supabase = createClient()

      if (mode === 'forgot') {
        const res = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        })
        if (!res.ok) setError('שגיאה בשליחת המייל — נסה שוב')
        else setMessage('נשלח מייל לאיפוס סיסמה. בדוק את תיבת הדואר שלך.')
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin + '/dashboard' },
        })
        if (error) setError(error.message)
        else if (data.session) { router.push('/dashboard'); router.refresh() }
        else setMessage('נשלח אימייל אישור. בדוק את תיבת הדואר שלך.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) setError('אימייל או סיסמה שגויים')
        else { router.push('/dashboard'); router.refresh() }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'שגיאת חיבור.')
    }

    setLoading(false)
  }

  const inputCls = 'w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:focus:ring-violet-900/40 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 transition-all duration-150'

  const titles: Record<Mode, string> = { login: 'כניסה לחשבון', signup: 'יצירת חשבון', forgot: 'איפוס סיסמה' }
  const submitLabels: Record<Mode, string> = { login: 'כניסה', signup: 'הרשמה', forgot: 'שלח מייל איפוס' }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-50 to-violet-50/40 dark:from-zinc-950 dark:to-violet-950/20 px-5">
      <div className="w-full max-w-sm page-in">

        <div className="text-center mb-10">
          <div className="w-14 h-14 bg-violet-600 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-violet-200 dark:shadow-violet-900/30">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
              <path d="M9 21V12h6v9" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">HomeBase</h1>
          <p className="text-zinc-400 dark:text-zinc-500 text-sm mt-1">ניהול חכם של הבית</p>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm shadow-zinc-100 dark:shadow-zinc-900">
          <p className="text-xs text-zinc-400 dark:text-zinc-500 font-semibold mb-5 text-center uppercase tracking-widest">{titles[mode]}</p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5">אימייל</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                required placeholder="you@example.com" dir="ltr" className={inputCls} />
            </div>

            {mode !== 'forgot' && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400">סיסמה</label>
                  {mode === 'login' && (
                    <button type="button" onClick={() => switchMode('forgot')}
                      className="text-xs text-violet-500 hover:text-violet-700 transition-colors duration-150 font-medium">
                      שכחתי סיסמה
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} value={password}
                    onChange={e => setPassword(e.target.value)}
                    required minLength={6} placeholder="לפחות 6 תווים" dir="ltr"
                    className={inputCls + ' pr-10'} />
                  <button type="button" onClick={() => setShowPassword(v => !v)} tabIndex={-1}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors duration-150">
                    {showPassword ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <p className="text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl px-3 py-2.5 font-medium">{error}</p>
            )}
            {message && (
              <p className="text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl px-3 py-2.5 font-medium">{message}</p>
            )}

            <button type="submit" disabled={loading}
              className="w-full bg-violet-600 hover:bg-violet-700 active:bg-violet-800 disabled:opacity-40 text-white font-semibold py-3 rounded-xl transition-colors duration-150 text-sm mt-1">
              {loading ? '...' : submitLabels[mode]}
            </button>
          </form>
        </div>

        <div className="mt-4 flex flex-col items-center gap-1">
          {mode !== 'login' && (
            <button onClick={() => switchMode('login')}
              className="text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 text-sm py-1.5 transition-colors duration-150 font-medium">
              חזרה לכניסה
            </button>
          )}
          {mode === 'login' && (
            <button onClick={() => switchMode('signup')}
              className="text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 text-sm py-1.5 transition-colors duration-150 font-medium">
              אין לי חשבון — הרשמה
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
