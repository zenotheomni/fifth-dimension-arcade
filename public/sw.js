/* Fifth Floor Arcade service worker — Web Push only (no offline caching). Scope: /arcade/ */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Fifth Floor Arcade', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'Fifth Floor Arcade'
  const options = {
    body: data.body || '',
    icon: '/arcade/icons/icon-192.png',
    badge: '/arcade/icons/badge-96.png',
    tag: data.tag || 'arcade',
    renotify: true,
    data: { url: data.url || '/arcade/' },
  }
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) =>
        clients.forEach((c) => c.postMessage({ type: 'arcade-push', kind: data.kind || null })),
      ),
    ]),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL((event.notification.data && event.notification.data.url) || '/arcade/', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if (c.url.startsWith(self.location.origin + '/arcade') && 'focus' in c) {
          c.navigate(url)
          return c.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
