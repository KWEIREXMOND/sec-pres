/* eslint-disable no-restricted-globals */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'Tema Secondary School SRC', body: event.data?.text() || 'You have a new update.' };
  }

  const title = payload.title || 'Tema Secondary School SRC';
  const options = {
    body: payload.body || 'Open the workspace to view this update.',
    tag: payload.tag || 'src-secretariat-update',
    data: { url: payload.url || '/workspace/dashboard' },
    badge: '/icon.svg',
    icon: '/icon.svg',
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/workspace/dashboard';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(target);
          return;
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
