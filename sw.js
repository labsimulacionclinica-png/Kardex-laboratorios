/* Service Worker - Kardex de Control de Insumos
   Estrategia: precache del app shell + cache-first con actualización
   en segundo plano (stale-while-revalidate) para CDNs (Tailwind, SheetJS, Chart.js).
   IMPORTANTE: al publicar cambios, subir CACHE_VERSION para forzar la actualización. */
const CACHE_VERSION = "kardex-v1";
const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/styles.css",
  "./js/idb.js",
  "./js/app.js",
  "./js/consumos.js",
  "./js/entradas.js",
  "./js/editor.js",
  "./js/charts.js",
  "./js/scanner.js",
  "./js/backup.js",
  "./js/extras.js",
  "./js/main.js",
  "./assets/icon-192.png",
  "./assets/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      Promise.allSettled(PRECACHE.map((u) => cache.add(new Request(u, { cache: "reload" }))))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      const network = fetch(req)
        .then((res) => {
          if (res && (res.ok || res.type === "opaque")) {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => {
          // Sin conexión: fallback a la página principal para navegaciones.
          if (req.mode === "navigate") return caches.match("./index.html");
          return undefined;
        });

      // Stale-while-revalidate: responde rápido con caché y actualiza en segundo plano.
      return hit ? (network.catch(() => hit), hit) : network;
    })
  );
});
