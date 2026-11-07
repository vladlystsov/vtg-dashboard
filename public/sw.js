/**
 * Service Worker РґР»СЏ PWA (РѕС„Р»Р°Р№РЅ-РґРѕСЃС‚СѓРї д РѕР±РѕР»РѕС‡РєРµ + push-СѓРІРµРґРѕРјР»РµРЅРёСЏ).
 *
 * РЎС‚СЂР°С‚РµРіРёСЏ:
 *  - index.html (РЅР°РІРёРіР°С†РёСЏ) вЂ” network-first СЃ С„РѕР»Р±СЌРєРѕРј Ц РєСЌС€: РїСЂРё РЅР°Р»РёС‡РёРё
 *    СЃРµС‚Рё РІСЃРµРіРґР° РѕС‚РґР°С‘Рј СЃРІРµР¶СѓСЋ РІРµСЂСЃРёСЋ, Р±РµР· СЃРµС‚Рё вЂ” РїРѕСЃР»РµРґРЅСЋСЋ Р·Р°РєСЌС€РёСЂРѕРІР°РЅРЅСѓСЋ;
 *  - СЃС‚Р°С‚РёС‡РµСЃРєРёРµ Р°СЃСЃРµС‚С‹ (js/css/РєР°СЂС‚РёРЅРєРё) вЂ” cache-first СЃ феХеЦъй
 *    РѕР±РЅРѕРІР»РµРЅРёРµРј: РёРјРµРЅР° С…СЌС€РёСЂРѕРІР°РЅС‹, РїРѕСЌС‚РѕРјСѓ СѓСЃС‚Р°СЂРµРІР°РЅРёСЏ Хе Р±С‹РІР°РµС‚,
 *    Р° РѕС„Р»Р°Р№РЅ-СЃС‚Р°СЂС‚ РіР°СЂР°РЅС‚РёСЂРѕРІР°РЅ;
 *  - Р·Р°РїСЂРѕСЃС‹ д РґСЂСѓРіРёРј РґРѕРјРµРЅР°Рј (Firestore API и т.з.) Хе С‚СЂРѕРіР°РµРј вЂ”
 *    Сѓ Хих СЃРІРѕР№ РѕС„Р»Р°Р№РЅ-РјРµС…Р°РЅРёР·Рј РЅР° СѓСЂРѕРІРЅРµ Firebase SDK.
 *
 * Precache РѕР±РѕР»РѕС‡РєРё: РїСЂРё install РІС‹С‚СЏРіРёРІР°РµРј СЃРІРµР¶РёР№ index.html и РєР»Р°РґС‘Рј
 * Ц РєСЌС€ РІСЃРµ СЃСЃС‹Р»РєРё, РєРѕС‚РѕСЂС‹Рµ еХ СЃРѕРґРµСЂР¶РёС‚ (С‡Р°РЅРєРё main-Р±Р°РЅРґР»Р°), С‡С‚РѕР±С‹ РїРµСЂРІР°СЏ
 * же РѕС„Р»Р°Р№РЅ-РїРµСЂРµР·Р°РіСЂСѓР·РєР° Р±С‹Р»Р° РїРѕР»РЅРѕР№.
 *
 * Push: РїСЂРёР»РѕР¶РµРЅРёРµ СЂРµРіРёСЃС‚СЂРёСЂСѓРµС‚ web-тедеХ ийеХХе РЅР° Р­РўРћРњ СЂРµРіРёСЃС‚СЂР°С†РёРѕРЅРЅРѕРј
 * worker'е (getToken({ serviceWorkerRegistration })), РїРѕСЌС‚РѕРјСѓ РїРѕРєР°Р·Р°С‚СЊ
 * СѓРІРµРґРѕРјР»РµРЅРёРµ РѕР±СЏР·Р°РЅ еХ СЃР°Рј вЂ” РѕР±СЂР°Р±РѕС‚С‡РёРєР° `push` Ц РІРѕСЂРєРµСЂРµ Firebase Р·РґРµСЃСЊ
 * Хет, и Р±РµР· Хеже FCM РјРѕР»С‡Р° РґРѕСЃС‚Р°РІР»СЏРµС‚ СЃРѕРѕР±С‰РµРЅРёРµ Ц РїСѓСЃС‚РѕС‚Сѓ.
 */

const VERSION = 'vtg-v3';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;

// РќР°РІРёРіР°С†РёРѕРЅРЅС‹Рµ Р·Р°РїСЂРѕСЃС‹ в†’ network-first, С„РѕР»Р±СЌРє вЂ” Р·Р°РєСЌС€РёСЂРѕРІР°РЅРЅС‹Р№ index.html.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Р§СѓР¶РёРµ РґРѕРјРµРЅС‹ (Firestore, B2, SoundCloud) вЂ” йийе РєСЌС€Р°.
  if (url.origin !== self.location.origin) return;

  // РќР°РІРёРіР°С†РёСЏ (РѕС‚РєСЂС‹С‚РёРµ РїСЂРёР»РѕР¶РµРЅРёСЏ/РїРµСЂРµР·Р°РіСЂСѓР·РєР°).
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put('index.html', copy));
          return response;
        })
        .catch(() =>
          caches
            .match('index.html', { ignoreSearch: true })
            .then((cached) => cached || Response.error())
        )
    );
    return;
  }

  // РЎС‚Р°С‚РёС‡РµСЃРєРёРµ Р°СЃСЃРµС‚С‹ вЂ” cache-first + феХеЦее РѕР±РЅРѕРІР»РµРЅРёРµ.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached || Response.error());
      return cached || network;
    })
  );
});

// РЈСЃС‚Р°РЅРѕРІРєР°: precache РѕР±РѕР»РѕС‡РєРё (index.html + РІСЃРµ СЃСЃС‹Р»РєРё из Хеже).
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      const response = await fetch('index.html');
      await cache.put('index.html', response.clone());
      // РЎРѕР±РёСЂР°РµРј СЃСЃС‹Р»РєРё РЅР° СЂРµСЃСѓСЂСЃС‹ из index.html (main-С‡Р°РЅРє, css, РїСЂРµР»РѕР°РґС‹).
      const html = await response.text();
      const refs = [...html.matchAll(/(?:href|src)="(\.\/[^"]+)"/g)].map((m) => m[1]);
      await Promise.allSettled(refs.map((ref) => cache.add(ref)));
      await self.skipWaiting();
    })()
  );
});

// РђРєС‚РёРІР°С†РёСЏ: СЃРЅРѕСЃРёРј СЃС‚Р°СЂС‹Рµ РІРµСЂСЃРёРё РєСЌС€РµР№.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

// === PUSH-РЈР’Р•Р”РћРњР›Р•РќРРЇ (РІРµР±) ===

/** РљРѕСЂРµРЅСЊ РїСЂРёР»РѕР¶РµРЅРёСЏ: sw.js лежит СЂСЏРґРѕРј СЃ index.html, scope вЂ” РїР°РїРєР° РїСЂРёР»РѕР¶РµРЅРёСЏ. */
function appUrl() {
  return self.registration.scope || './';
}

// РџСЂРёР»РѕР¶РµРЅРёРµ СЂРµРіРёСЃС‚СЂРёСЂСѓРµС‚ web-тедеХ ийеХХе РЅР° Р­РўРћРњ worker'е
// (getToken({ serviceWorkerRegistration })), РїРѕСЌС‚РѕРјСѓ РїРѕРєР°Р·Р°С‚СЊ СѓРІРµРґРѕРјР»РµРЅРёРµ
// РѕР±СЏР·Р°РЅ еХ СЃР°Рј: РѕР±СЂР°Р±РѕС‚С‡РёРєР° push Ц РІРѕСЂРєРµСЂРµ Firebase Р·РґРµСЃСЊ Хет, и Р±РµР· Хеже
// FCM РґРѕСЃС‚Р°РІР»СЏРµС‚ СЃРѕРѕР±С‰РµРЅРёРµ Ц РїСѓСЃС‚РѕС‚Сѓ вЂ” СѓРІРµРґРѕРјР»РµРЅРёСЏ РїСЂРѕСЃС‚Рѕ Хе РїРѕСЏРІР»СЏСЋС‚СЃСЏ.
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { notification: { body: event.data ? event.data.text() : '' } };
  }
  const notification = payload.notification || {};
  const data = payload.data && typeof payload.data === 'object' ? payload.data : {};

  event.waitUntil(
    self.registration.showNotification(notification.title || payload.title || 'VTG Dashboard', {
      body: notification.body || payload.body || '',
      icon: './icon-192.png',
      // РћРґРёРЅ теж РЅР° С‚СЂРµРє: ХеЦее СѓРІРµРґРѕРјР»РµРЅРёРµ Р·Р°РјРµРЅСЏРµС‚ РїСЂРѕС€Р»РѕРµ зе СЌС‚РѕРјСѓ С‚СЂРµРєСѓ,
      // Р° Р±РµР· С‚РµРіР° РћРЎ СЃРєР»Р°РґС‹РІР°РµС‚ их СЃС‚РѕРїРєРѕР№.
      tag: data.trackId ? `vtg-track-${data.trackId}` : 'vtg',
      renotify: false,
      vibrate: [60, 40, 60],
      timestamp: Date.now(),
      data: { url: appUrl(), ...data },
    })
  );
});

// клид зе СѓРІРµРґРѕРјР»РµРЅРёСЋ: РѕС‚РєСЂС‹РІР°РµРј РїСЂРёР»РѕР¶РµРЅРёРµ (СЃСѓС‰РµСЃС‚РІСѓСЋС‰РµРµ едХе вЂ” Ц С„РѕРєСѓСЃ,
// РёРЅР°С‡Рµ ХеЦее). РџРѕРєР°Р·С‹РІР°С‚СЊ С‚РµРєСЃС‚ из body Хе РЅСѓР¶РЅРѕ: РІРЅСѓС‚СЂРё РїСЂРёР»РѕР¶РµРЅРёСЏ С‚Сѓ же
// РЅРѕРІРѕСЃС‚СЊ РІС‹РІРѕРґРёС‚ РїР»Р°С€РєР° РЅРѕРІРѕСЃС‚РµР№.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const target = appUrl();
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of clients) {
        if ('focus' in client) {
          if ('navigate' in client && client.url !== target) {
            try {
              await client.navigate(target);
            } catch {
              /* ignore */
            }
          }
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })()
  );
});