/* WC26 Service Worker
 * v1.0 — 2026-04
 *
 * Estrategia: Network First with Cache Fallback
 * - Carga normalmente desde la red
 * - Si no hay red, sirve desde cache
 * - Listo para push notifications cuando se habilite Cloud Functions
 */

const CACHE_NAME = 'wc26-v1';
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png'
];

// === INSTALL: cachea recursos basicos ===
self.addEventListener('install', (event) => {
  console.log('[SW] Install');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Cacheando recursos basicos');
        return cache.addAll(URLS_TO_CACHE).catch(err => {
          // Si falla cachear algo, no romper la instalacion
          console.warn('[SW] Algunos recursos fallaron:', err);
        });
      })
      .then(() => self.skipWaiting())
  );
});

// === ACTIVATE: limpia caches viejos ===
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Borrando cache viejo:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// === FETCH: Network First, Cache Fallback ===
self.addEventListener('fetch', (event) => {
  // Solo manejar requests GET HTTP/HTTPS
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  // No cachear llamadas a Firestore/Auth/etc - dejar pasar normales
  if (
    event.request.url.includes('firestore.googleapis.com') ||
    event.request.url.includes('identitytoolkit.googleapis.com') ||
    event.request.url.includes('googleapis.com') ||
    event.request.url.includes('googletagmanager.com') ||
    event.request.url.includes('chrome-extension')
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clonar la respuesta porque solo se puede leer una vez
        const responseClone = response.clone();
        // Solo cachear respuestas exitosas
        if (response.status === 200) {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone).catch(()=>{});
          });
        }
        return response;
      })
      .catch(() => {
        // Sin red: intentar servir desde cache
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // Si no hay nada, devolver pagina principal
          return caches.match('/index.html');
        });
      })
  );
});

// === PUSH: Notificacion al recibir push del servidor ===
// (Funcional solo cuando el servidor envia. Actualmente, sin Cloud Functions
//  esto no se dispara. Lista la base para cuando se habilite.)
self.addEventListener('push', (event) => {
  console.log('[SW] Push recibido');
  let data = { title: 'WC26', body: 'Notificacion nueva' };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'WC26', body: event.data.text() };
    }
  }

  const options = {
    body: data.body || 'Tienes una notificacion nueva',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'wc26-default',
    data: data.url ? { url: data.url } : { url: '/' },
    requireInteraction: data.requireInteraction || false,
    vibrate: [200, 100, 200],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'WC26', options)
  );
});

// === Click en notificacion: abre la app ===
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
      // Si ya esta abierta una pestana, enfocarla
      for (const client of clientsList) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      // Si no, abrir nueva
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// === Mensaje desde la app: para skipWaiting manualmente ===
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
