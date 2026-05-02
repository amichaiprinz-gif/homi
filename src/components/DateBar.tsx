'use client'

import { useState, useEffect } from 'react'

export default function DateBar() {
  const [dateStr, setDateStr] = useState<string>('\u00A0') // non-breaking space reserves height from first paint

  useEffect(() => {
    const now = new Date()
    const greg = new Intl.DateTimeFormat('he-IL', {
      weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Jerusalem',
    }).format(now)
    const heb = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jerusalem',
    }).format(now)
    setDateStr(`${greg} · ${heb}`)
  }, [])

  return (
    <div className="w-full bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-100 dark:border-zinc-800 px-4 py-1 text-center">
      <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium truncate">{dateStr}</p>
    </div>
  )
}
