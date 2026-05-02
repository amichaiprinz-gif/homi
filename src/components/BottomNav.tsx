'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { href: '/dashboard', icon: HomeIcon, label: 'בית' },
  { href: '/tasks', icon: TaskIcon, label: 'משימות' },
  { href: '/shopping', icon: CartIcon, label: 'קניות' },
  { href: '/more', icon: MoreIcon, label: 'עוד' },
  { href: '/settings', icon: GearIcon, label: 'הגדרות' },
]

const MORE_ROUTES = ['/more', '/leaderboard', '/budget', '/providers', '/recipes']

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="mx-3 mb-3">
        <div className="bg-white/85 dark:bg-zinc-900/90 backdrop-blur-2xl border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.07)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.4)]">
          <div className="flex items-stretch justify-around h-16 max-w-lg mx-auto px-1">
            {navItems.map(({ href, icon: Icon, label }) => {
              const isActive = href === '/more'
                ? MORE_ROUTES.some(r => pathname.startsWith(r))
                : pathname === href
              return (
                <Link
                  key={href}
                  href={href}
                  className="flex flex-col items-center justify-center flex-1 gap-1 transition-colors duration-150"
                >
                  <div className={`flex items-center justify-center w-10 h-8 rounded-xl transition-all duration-150 ${isActive ? 'bg-violet-50 dark:bg-violet-900/40' : ''}`}>
                    <Icon active={isActive} />
                  </div>
                  <span className={`text-[10px] font-medium transition-colors duration-150 ${isActive ? 'text-violet-600' : 'text-zinc-400'}`}>
                    {label}
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </nav>
  )
}

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={active ? 'text-violet-600' : 'text-zinc-400'}>
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" fillOpacity={active ? 0.2 : 0} />
      <path d="M9 21V12h6v9" />
    </svg>
  )
}

function TaskIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={active ? 'text-violet-600' : 'text-zinc-400'}>
      <rect x="3" y="3" width="18" height="18" rx="2.5" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.15 : 0} />
      <path d="M8 8.5h8M8 12h5.5M8 15.5h4" />
    </svg>
  )
}

function CartIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={active ? 'text-violet-600' : 'text-zinc-400'}>
      <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.15 : 0} />
      <path d="M3 6h18M16 10a4 4 0 01-8 0" />
    </svg>
  )
}

function MoreIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={active ? 'text-violet-600' : 'text-zinc-400'}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.2 : 0} />
      <rect x="14" y="3" width="7" height="7" rx="1.5" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.2 : 0} />
      <rect x="3" y="14" width="7" height="7" rx="1.5" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.2 : 0} />
      <rect x="14" y="14" width="7" height="7" rx="1.5" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.2 : 0} />
    </svg>
  )
}

function GearIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={active ? 'text-violet-600' : 'text-zinc-400'}>
      <circle cx="12" cy="12" r="3" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.25 : 0} />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  )
}
