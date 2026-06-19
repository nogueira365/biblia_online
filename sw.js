self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  // Pass-through básico para cumprir o requisito de PWA do Chrome.
  // Para suporte offline mais avançado, o app já usa o localStorage e indexedDB,
  // portanto o ServiceWorker básico é suficiente para a instalação.
});
