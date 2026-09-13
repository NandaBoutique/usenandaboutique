/* UseNandaBoutique: somente a estrutura pública do aplicativo fica offline.
 * Aumente VERSION em cada publicação que altere HTML, CSS, JS ou ícones.
 * A lista fechada impede armazenar contas, API, estoque ou mídias do Supabase.
 */
'use strict';
const VERSION = '2026-09-12-v1';
const CACHE_PREFIX = 'usenandaboutique-shell-';
const SHELL_CACHE = CACHE_PREFIX + VERSION;
const SHELL_FILES = [
  './', './index.html', './style.css', './config.js', './auth.js', './script.js', './pwa.js', './manifest.json',
  './img/pwa-icon-192.png', './img/pwa-icon-512.png', './img/pwa-maskable-512.png', './img/apple-touch-icon.png',
  './img/logo-nanda.jpg', './img/cerejeira-direita.png', './img/logo-borboleta.png', './img/sacola-carrinho.png',
  './img/icon-whatsapp.png', './img/icon-instagram.png', './img/rodape-menu.jpg', './img/rodape-em-cima.jpg',
  './img/chuva-de-petalas.png', './img/look-listras-rosa-1.jpg', './img/conjunto-renda-3.jpg',
  './img/look-listras-rosa-2.jpg', './img/cintos-colecao-1.jpg'
];
const shellURLs = new Set(SHELL_FILES.map(file => new URL(file, self.registration.scope).href));
const indexURL = new URL('./index.html', self.registration.scope).href;

self.addEventListener('install', event => {
  // A instalação só termina quando a versão inteira pode funcionar offline.
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(SHELL_FILES.map(file => new Request(new URL(file, self.registration.scope), { cache: 'reload' })));
    // Não pula a espera: a pessoa escolhe quando recarregar, preservando edições.
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== SHELL_CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  // Recebido somente depois do toque explícito em “Atualizar app”.
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Nem rotas autenticadas, nem APIs, nem mídias remotas passam por este cache.
  if (/\/(auth|rest|storage|functions|api)\//i.test(url.pathname)) return;
  const isShellNavigation = request.mode === 'navigate' &&
    (url.pathname === new URL('./', self.registration.scope).pathname || url.pathname === new URL(indexURL).pathname);
  if (isShellNavigation) {
    // A estrutura versionada mantém HTML e scripts compatíveis até a atualização.
    // Parâmetros de recuperação de senha permanecem na URL, nunca são cacheados.
    event.respondWith((async () => {
      const cached = await (await caches.open(SHELL_CACHE)).match(indexURL);
      return cached || fetch(request);
    })());
    return;
  }
  if (url.search || !shellURLs.has(url.href)) return;
  event.respondWith((async () => {
    const cached = await (await caches.open(SHELL_CACHE)).match(request);
    return cached || fetch(request);
  })());
});
