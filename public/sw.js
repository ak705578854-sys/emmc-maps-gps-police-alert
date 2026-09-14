self.addEventListener('push', event => {
  let data = {};

  try {
    data = event.data
      ? event.data.json()
      : {};
  } catch {
    data = {
      title: 'EMMC Alert',
      body: event.data?.text?.() || 'New emergency alert'
    };
  }

  const title = data.title || '🚨 EMMC Emergency Alert';

  const options = {
    body: data.body || 'Ambulance alert received.',
    tag: data.tag || 'emmc-alert',
    renotify: true,
    requireInteraction: true,
    data: data.data || {}
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const target =
    event.notification.data?.latitude &&
    event.notification.data?.longitude
      ? '/'
      : '/';

  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then(list => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }

      return clients.openWindow(target);
    })
  );
});
