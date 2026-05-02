import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import PushInitializer from '@/components/PushInitializer'
import DateBar from '@/components/DateBar'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'HomeBase',
  description: 'ניהול חכם של משימות הבית',
  icons: {
    // apple-touch-icon — required for iOS home screen installation
    apple: '/icon-192.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'HomeBase',
  },
}

export const viewport: Viewport = {
  themeColor: '#f9fafb',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={`h-full ${inter.variable}`}>
      <head>
        {/* Runs synchronously before first paint to prevent flash of wrong theme */}
        <script dangerouslySetInnerHTML={{
          __html: `(function(){try{var t=localStorage.getItem('hb_theme');if(t==='dark'){document.documentElement.classList.add('dark');document.documentElement.style.backgroundColor='#09090b'}else{document.documentElement.style.backgroundColor='#f9fafb'}}catch(e){}})()`
        }} />
      </head>
      <body className="min-h-full bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 antialiased font-sans">
        <PushInitializer />
        <DateBar />
        {children}
      </body>
    </html>
  )
}
