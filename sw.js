// sw.js — Service Worker do Bíblia Live
// Permite abrir o app e ler as traduções já baixadas sem internet.
//
// Estratégias:
// - Páginas e arquivos do próprio site: rede primeiro (sempre a versão mais nova quando online),
//   com o cache como reserva offline.
// - Traduções (data/*.js, ~4 MB cada): cache primeiro. Cada tradução é baixada uma vez.
// - Bibliotecas do CDN (versões fixas) e fontes: cache primeiro.
// - API do Supabase: nunca passa pelo cache (a sincronização tem sua própria fila offline).
//
// Ao alterar os arquivos de data/, incremente DATA_CACHE para forçar um novo download.

const SHELL_CACHE = "biblia-shell-v4";
const DATA_CACHE = "biblia-data-v2";
const ASSET_CACHE = "biblia-assets-v1";
const ACTIVE_CACHES = [SHELL_CACHE, DATA_CACHE, ASSET_CACHE];

// Arquivos essenciais para abrir o app offline
const SHELL_FILES = [
  "./",
  "./index.html",
  "./styles_v7.css",
  "./config.js",
  "./supabase.js",
  "./auth_v2.js",
  "./offline_data.js",
  "./reading_plans.js",
  "./custom-select_v3.js",
  "./app.js",
  "./pwa.js",
  "./manifest.json",
  "./imagens/favicon.png",
  "./imagens/app-icon.png",
  "./imagens/app-icon-192.png"
];

const CACHE_FIRST_HOSTS = ["cdn.jsdelivr.net", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => !ACTIVE_CACHES.includes(key)).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.includes("/data/")) {
      event.respondWith(cacheFirst(request, DATA_CACHE));
    } else if (request.mode === "navigate") {
      event.respondWith(networkFirst(request, SHELL_CACHE, "./index.html"));
    } else {
      event.respondWith(networkFirst(request, SHELL_CACHE));
    }
    return;
  }

  if (CACHE_FIRST_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
  }
  // Demais origens (API do Supabase, login do Google etc.): comportamento normal do navegador
});

// Rede primeiro; offline, usa o cache. Os arquivos do site levam ?v=… na URL, então são
// guardados sem a query string: cada deploy substitui a cópia anterior em vez de acumular.
async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  const url = new URL(request.url);
  const cacheKey = url.origin + url.pathname;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(cacheKey, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(cacheKey)
      || (fallbackUrl && await cache.match(fallbackUrl));
    if (cached) return cached;
    throw error;
  }
}

// Cache primeiro; se não houver, busca na rede e guarda
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  // Respostas opacas (status 0) vêm de CSS/fontes sem CORS e também podem ser guardadas
  if (response.ok || response.type === "opaque") cache.put(request, response.clone());
  return response;
}
