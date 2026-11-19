/* Web Push handlers, imported into the generated service worker (see vite.config.js). */

// Ask open app windows to reload pending alerts from the server: a suspended app (common on phones)
// misses live events, so the banner and badge would otherwise only update after a full restart
const refreshAlerts = async () => {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  windows.forEach((client) => client.postMessage({ type: 'refresh-alerts' }));
  return windows;
};

self.addEventListener('push', (event) => {
  let data;
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const base = self.registration.scope;
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title || 'Traccar', {
        body: data.body || '',
        icon: new URL('pwa-192x192.png', base).href,
        badge: new URL('pwa-64x64.png', base).href,
        tag: data.tag,
        renotify: Boolean(data.tag),
        data: { url: data.url || base },
      }),
      refreshAlerts(),
    ]),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || self.registration.scope;
  event.waitUntil(
    refreshAlerts().then((windows) => {
      const existing = windows.find((client) => client.url.startsWith(self.registration.scope));
      if (existing) {
        return existing.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
