// No offline caching in this version: authentication and new deployments must not use stale assets.
self.addEventListener('install', event => { self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil((async () => { for (const key of await caches.keys()) await caches.delete(key); await self.clients.claim(); })()); });
