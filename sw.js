// ═══════════════════════════════════════════
//  AgroPro Service Worker v1.3
//  • Cache offline de recursos estáticos
//  • Firebase/Firestore funciona normalmente
//    (usa cache interno do próprio Firebase SDK)
//  • Quando volta ao ar: recarrega cache automaticamente
// ═══════════════════════════════════════════

const CACHE_NAME = 'agropro-v1.3';

// Recursos que serão pré-cacheados na instalação
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './sw.js',
  // Fontes Google (tentativa – podem falhar por CORS, mas o browser já costuma ter em cache)
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap',
  // jsPDF
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.28/jspdf.plugin.autotable.min.js',
];

// Domínios cujas respostas NUNCA são cacheadas pelo SW
// (Firebase gerencia seu próprio cache IndexedDB offline)
const BYPASS_DOMAINS = [
  'firestore.googleapis.com',
  'firebase.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebaseio.com',
  'www.gstatic.com/firebasejs',  // SDK Firebase – não cachear (módulo ES)
];

// ── INSTALL ──────────────────────────────────
self.addEventListener('install', event => {
  self.skipWaiting(); // Ativa imediatamente sem esperar aba fechar
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Adiciona recursos um por um; ignora falhas individuais
      return Promise.allSettled(
        PRECACHE.map(url =>
          cache.add(url).catch(err => console.warn('[SW] Não cacheou:', url, err.message))
        )
      );
    })
  );
});

// ── ACTIVATE ─────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME) // remove caches antigos
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim()) // assume controle de todas as abas abertas
  );
});

// ── FETCH ─────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Ignora requisições não-GET
  if (event.request.method !== 'GET') return;

  // Ignora URLs de Firebase/Firestore – eles têm cache próprio
  if (BYPASS_DOMAINS.some(d => url.includes(d))) return;

  // Ignora extensões de browser e chrome-extension
  if (url.startsWith('chrome-extension://') || url.startsWith('moz-extension://')) return;

  event.respondWith(
    // Estratégia: Network First com fallback para Cache
    fetch(event.request)
      .then(networkResponse => {
        // Só cacheia respostas válidas (status 200, tipo basic ou cors)
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          (networkResponse.type === 'basic' || networkResponse.type === 'cors')
        ) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return networkResponse;
      })
      .catch(() => {
        // Offline: tenta servir do cache
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          // Para navegação (HTML): retorna o index.html cacheado
          if (event.request.mode === 'navigate') {
            return caches.match('./') || caches.match('./index.html');
          }
          // Para outros recursos: resposta vazia com 503
          return new Response('Recurso não disponível offline', {
            status: 503,
            statusText: 'Service Unavailable',
          });
        });
      })
  );
});

// ── MENSAGEM DO APP ───────────────────────────
// O app envia 'SKIP_WAITING' quando detecta novo SW esperando
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
