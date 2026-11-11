/* Gestione delle notifiche push, caricata dal service worker generato da Workbox */
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { body: event.data && event.data.text() } }
  const title = data.title || 'Soldi'
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: self.registration.scope + 'icon-192.png',
    badge: self.registration.scope + 'icon-192.png',
    data: { url: data.url || '/' },
    tag: data.tag,
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = self.registration.scope + '#' + ((event.notification.data && event.notification.data.url) || '/')
  event.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of all) {
      if (c.url.startsWith(self.registration.scope)) { await c.focus(); return c.navigate(target) }
    }
    return clients.openWindow(target)
  })())
})
