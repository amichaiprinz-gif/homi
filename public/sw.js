// HomeBase Service Worker v4
// Handles push notifications for Android and iOS (PWA)

self.addEventListener('install', () => {
  // Immediately replace any old service worker — don't wait for tabs to close
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  // Take control of all open pages immediately
  event.waitUntil(clients.claim())
})

self.addEventListener('push', (event) => {
  console.log('SW_PUSH_EVENT_RECEIVED timestamp=' + Date.now())

  let title = 'HomeBase 🏠'
  let body = 'יש עדכון חדש'
  let url = '/dashboard'

  // Parse the payload — handle both JSON and plain text safely
  if (event.data) {
    try {
      const data = event.data.json()
      title = data.title || title
      body = data.body || body
      url = data.url || url
      console.log('SW_PAYLOAD_PARSED mode=json title="' + title + '" body="' + body + '" url="' + url + '"')
    } catch {
      // Payload was plain text, not JSON
      const text = event.data.text()
      if (text) body = text
      console.log('SW_PAYLOAD_PARSED mode=text body="' + body + '"')
    }
  } else {
    console.log('SW_PAYLOAD_PARSED mode=empty using_defaults')
  }

  const finalTitle = title
  const finalBody = body
  const finalUrl = url

  // Use an async IIFE so showNotification runs first with its own error handling,
  // and client messaging runs after — failure in one cannot block the other.
  event.waitUntil(
    (async () => {
      // ── Step 1: Show the system notification (must succeed independently) ───
      console.log('SW_SHOW_NOTIFICATION_START title="' + finalTitle + '"')
      try {
        await self.registration.showNotification(finalTitle, {
          body: finalBody,
          vibrate: [200, 100, 200],
          dir: 'rtl',
          lang: 'he',
          // Unique tag so notifications don't collapse each other
          tag: 'homebase-' + Date.now(),
          data: { url: finalUrl },
        })
        console.log('SW_SHOW_NOTIFICATION_SUCCESS')
      } catch (err) {
        console.error('SW_SHOW_NOTIFICATION_ERROR err="' + String(err) + '"')
      }

      // ── Step 2: Notify open windows for in-app banner (best-effort only) ───
      // Failure here does NOT affect the system notification above.
      try {
        const windowClients = await clients.matchAll({ type: 'window', includeUncontrolled: false })
        windowClients.forEach((client) => {
          client.postMessage({ type: 'PUSH_RECEIVED', title: finalTitle, body: finalBody, url: finalUrl })
        })
      } catch {
        // Non-critical — system notification was already handled above
      }
    })()
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const targetUrl = event.notification.data?.url || '/dashboard'
  console.log('SW_NOTIFICATION_CLICK url="' + targetUrl + '"')

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // If a window of this app is already open, focus it and navigate
        for (const client of windowClients) {
          if ('focus' in client) {
            client.focus()
            if ('navigate' in client) {
              return client.navigate(targetUrl)
            }
            return
          }
        }
        // No open window — open a new one
        return clients.openWindow(targetUrl)
      })
  )
})
