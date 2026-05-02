'use client'

import { useEffect, useRef, useState } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  // Pad to a multiple of 4 characters
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  // Convert URL-safe base64 → standard base64
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  // Decode to binary string then to Uint8Array
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray.buffer as ArrayBuffer
}

async function saveSubscriptionToDb(sub: PushSubscription): Promise<{ ok: boolean; userId?: string }> {
  try {
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // sub.toJSON() gives the clean { endpoint, keys: { p256dh, auth } } object
      body: JSON.stringify(sub.toJSON()),
    })
    if (res.ok) {
      const data = await res.json()
      return { ok: true, userId: data.user_id }
    }
    if (res.status === 401) {
      console.log('PUSH_DEBUG: Not logged in — subscription not saved')
    } else {
      console.error('PUSH_DEBUG: Server rejected subscription, status:', res.status)
    }
    return { ok: false }
  } catch (err) {
    console.error('PUSH_DEBUG: Network error saving subscription:', err)
    return { ok: false }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// forceRegisterPush — exported so any component can call it from a tap event.
// iOS Safari requires that requestPermission() is called within a user gesture.
// ─────────────────────────────────────────────────────────────────────────────

export async function forceRegisterPush(): Promise<boolean> {
  console.log('PUSH_DEBUG: forceRegisterPush() called')

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('PUSH_DEBUG: Push API not supported on this browser/device')
    return false
  }

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapidKey) {
    console.error('PUSH_DEBUG: NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set')
    return false
  }

  try {
    const reg = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready
    console.log('PUSH_DEBUG: Service worker ready')

    // ── Request permission (MUST be from a user gesture on iOS) ──────────────
    const permission = await Notification.requestPermission()
    console.log('PUSH_DEBUG: Permission result:', permission)

    if (permission !== 'granted') {
      console.log('PUSH_DEBUG: Manual registration failure — permission not granted:', permission)
      return false
    }

    // ── Unsubscribe any stale subscription first ──────────────────────────────
    const existing = await reg.pushManager.getSubscription()
    if (existing) {
      const storedVapid = localStorage.getItem('hb_vapid_key')
      if (storedVapid !== vapidKey) {
        console.log('PUSH_DEBUG: VAPID key changed — removing stale subscription')
        await existing.unsubscribe()
      } else {
        // Re-upsert existing subscription in case DB row was deleted
        console.log('PUSH_DEBUG: Re-syncing existing subscription to DB')
        const result = await saveSubscriptionToDb(existing)
        if (result.ok) {
          console.log(`PUSH_DEBUG: Manual registration success — user ${result.userId}`)
          return true
        }
        // If sync failed, fall through to create a new subscription
        await existing.unsubscribe()
      }
    }

    // ── Create a fresh push subscription ─────────────────────────────────────
    console.log('PUSH_DEBUG: Creating new push subscription...')
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    })
    console.log('PUSH_DEBUG: Subscription endpoint:', sub.endpoint.substring(0, 60) + '...')

    const result = await saveSubscriptionToDb(sub)
    if (result.ok) {
      localStorage.setItem('hb_vapid_key', vapidKey)
      console.log(`PUSH_DEBUG: Manual registration success — user ${result.userId}`)
      return true
    }

    console.log('PUSH_DEBUG: Manual registration failure — DB save failed')
    return false
  } catch (err) {
    console.error('PUSH_DEBUG: Manual registration failure —', err)
    return false
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// initPush — silent background sync. Does NOT call requestPermission()
// (no user gesture available). Only re-upserts an existing subscription.
// ─────────────────────────────────────────────────────────────────────────────

async function initPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapidKey) {
    console.error('PUSH_DEBUG: NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set')
    return
  }

  try {
    const reg = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready

    if (Notification.permission !== 'granted') {
      // Don't call requestPermission here — not a user gesture, iOS will block it.
      // The banner in ShoppingClient handles this via forceRegisterPush().
      console.log('PUSH_DEBUG: Silent init — permission not granted, banner will handle registration')
      return
    }

    const existing = await reg.pushManager.getSubscription()
    if (!existing) {
      // No subscription in browser — silently create one (permission already granted)
      console.log('PUSH_DEBUG: No existing subscription — creating silently (permission already granted)')
      try {
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        })
        const result = await saveSubscriptionToDb(sub)
        if (result.ok) {
          localStorage.setItem('hb_vapid_key', vapidKey)
          console.log(`PUSH_DEBUG: Silent re-registration success for user ${result.userId}`)
        }
      } catch (e) {
        console.log('PUSH_DEBUG: Silent re-registration failed:', e)
      }
      return
    }

    const storedVapid = localStorage.getItem('hb_vapid_key')
    if (storedVapid !== vapidKey) {
      console.log('PUSH_DEBUG: VAPID key changed — unsubscribing and re-registering silently')
      await existing.unsubscribe()
      try {
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        })
        const result = await saveSubscriptionToDb(sub)
        if (result.ok) {
          localStorage.setItem('hb_vapid_key', vapidKey)
          console.log(`PUSH_DEBUG: Silent re-registration (VAPID change) success for user ${result.userId}`)
        }
      } catch (e) {
        console.log('PUSH_DEBUG: Silent re-registration (VAPID change) failed:', e)
      }
      return
    }

    // Permission is granted and subscription exists — silently upsert to DB
    console.log('PUSH_DEBUG: Silent sync — upserting existing subscription to DB')
    const result = await saveSubscriptionToDb(existing)
    if (result.ok) {
      console.log(`PUSH_DEBUG: Subscription saved/updated for user ${result.userId}`)
    }
  } catch (err) {
    console.error('PUSH_DEBUG: Silent init error:', err)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component — mounted in the global layout, runs on every page.
// Also renders an in-app banner when a push arrives while the app is open.
// ─────────────────────────────────────────────────────────────────────────────

interface InAppBanner { title: string; body: string; url: string }

export default function PushInitializer() {
  const [banner, setBanner] = useState<InAppBanner | null>(null)
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const timer = setTimeout(initPush, 2000)
    return () => clearTimeout(timer)
  }, [])

  // Listen for PUSH_RECEIVED messages from the service worker.
  // The SW sends this whenever a push arrives, including while the app is foregrounded.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    function handleSwMessage(event: MessageEvent) {
      if (event.data?.type !== 'PUSH_RECEIVED') return
      const { title, body, url } = event.data as InAppBanner & { type: string }
      console.log('[PushInitializer] foreground push received — showing in-app banner:', title)
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current)
      setBanner({ title: title || 'HomeBase 🏠', body: body || '', url: url || '/dashboard' })
      bannerTimerRef.current = setTimeout(() => setBanner(null), 5000)
    }

    navigator.serviceWorker.addEventListener('message', handleSwMessage)
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleSwMessage)
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current)
    }
  }, [])

  if (!banner) return null

  function dismiss() {
    setBanner(null)
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current)
  }

  return (
    <div
      role="alert"
      onClick={() => { dismiss(); window.location.href = banner.url }}
      className="fixed top-4 left-4 right-4 z-[9999] bg-zinc-900 border border-zinc-700 text-white rounded-2xl px-4 py-3.5 shadow-2xl cursor-pointer"
    >
      <div className="flex items-start gap-3">
        <span className="text-xl flex-shrink-0">🏠</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight">{banner.title}</p>
          {banner.body && <p className="text-xs text-zinc-300 mt-1 leading-relaxed">{banner.body}</p>}
        </div>
        <button
          onClick={e => { e.stopPropagation(); dismiss() }}
          className="text-zinc-500 hover:text-white text-base leading-none flex-shrink-0 mt-0.5"
        >✕</button>
      </div>
    </div>
  )
}
