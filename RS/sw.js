/* ==========================================================
   ROSSEVER — Service Worker
   Recibe el push y muestra la notificación en el celular.
   ========================================================== */

self.addEventListener('push', (event) => {
  let data = { title: 'Rossever', body: 'Tienes un nuevo detalle.', url: './index.html' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    /* si no llega JSON, se usan los valores por defecto */
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: './icon-192.png',
      badge: './badge-96.png',
      data: { url: data.url },
      vibrate: [80, 40, 80],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || './index.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
