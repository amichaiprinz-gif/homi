'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<'loading' | 'ready' | 'done'>('loading')
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')

    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) setError('הקישור לא תקין או פג תוקף — בקש איפוס מחדש.')
        else setStatus('ready')
      })
      return
    }

    // No code — check hash for implicit flow token
    const hash = window.location.hash
    if (hash.includes('access_token') && hash.includes('type=recovery')) {
      setStatus('ready')
      return
    }

    // Nothing in URL — invalid link
    setError('הקישור לא תקין — חזור לדף הכניסה ובקש איפוס מחדש.')
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password })
      if (error) setError(error.message)
      else { setStatus('done'); router.push('/dashboard'); router.refresh() }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'שגיאה בעדכון הסיסמה.')
    }
    setLoading(false)
  }

  const inputCls = 'w-full bg-white/[.05] border border-white/[.08] text-white rounded-md px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500/50 focus:bg-white/[.07] placeholder:text-white/20 transition-all duration-150'

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] px-5">
      <div className="w-full max-w-sm page-in">

        <div className="text-center mb-12">
          <div className="w-11 h-11 bg-indigo-500/10 border border-indigo-500/20 rounded-lg flex items-center justify-center mx-auto mb-5">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
              <path d="M9 21V12h6v9" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-white tracking-tight">HomeBase</h1>
          <p className="text-white/35 text-sm mt-1">קביעת סיסמה חדשה</p>
        </div>

        <div className="bg-white/[.03] border border-white/[.07] rounded-lg p-6">
          {error ? (
            <div className="space-y-3">
              <p className="text-xs text-red-400/80 bg-red-500/[.07] border border-red-500/[.15] rounded-md px-3 py-2">{error}</p>
              <a href="/login" className="block text-center text-sm text-indigo-400/70 hover:text-indigo-400 transition-colors duration-150">
                חזרה לדף הכניסה
              </a>
            </div>
          ) : status === 'loading' ? (
            <p className="text-sm text-white/40 text-center py-4">מאמת קישור...</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-[11px] text-white/30 font-medium mb-1.5 uppercase tracking-wide">סיסמה חדשה</label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} value={password}
                    onChange={e => setPassword(e.target.value)}
                    required minLength={6} placeholder="לפחות 6 תווים" dir="ltr"
                    className={inputCls + ' pr-10'} autoFocus />
                  <button type="button" onClick={() => setShowPassword(v => !v)} tabIndex={-1}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/55 transition-colors duration-150">
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

              <button type="submit" disabled={loading}
                className="w-full bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 text-white font-medium py-2.5 rounded-md transition-colors duration-150 text-sm">
                {loading ? '...' : 'עדכן סיסמה'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
