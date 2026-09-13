/**
 * Service Worker：让应用在离线状态下也能完整使用。
 *
 * 策略
 *   - 导航请求：network-first，失败时回退到缓存的 /（应用外壳）
 *   - 静态资源（/_next/static、附图、图标）：cache-first（内容哈希命名，可长期缓存）
 *   - 其它 GET 请求：stale-while-revalidate
 *
 * 注意：题库数据打包在 JS chunk 中，随静态资源一起缓存，
 * 因此首次访问后即使断网也能刷题（进度本就存在 IndexedDB 本地）。
 */
const VERSION = "v1";
const SHELL_CACHE = `crac-shell-${VERSION}`;
const ASSET_CACHE = `crac-assets-${VERSION}`;
const RUNTIME_CACHE = `crac-runtime-${VERSION}`;
const KEEP = new Set([SHELL_CACHE, ASSET_CACHE, RUNTIME_CACHE]);

const SHELL_URLS = ["/", "/practice", "/exam", "/review", "/stats", "/browse"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // 逐个 add，单个失败不影响整体安装
      await Promise.all(
        SHELL_URLS.map((url) => cache.add(url).catch(() => undefined)),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n.startsWith("crac-") && !KEEP.has(n)).map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

function isAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/figures/") ||
    /\.(?:png|jpe?g|svg|webp|ico|woff2?|css|js)$/i.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 导航请求
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(SHELL_CACHE);
          cache.put(request, fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match(request);
          if (cached) return cached;
          const shell = await caches.match("/");
          if (shell) return shell;
          return new Response("离线且未缓存该页面", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }
      })(),
    );
    return;
  }

  // 静态资源：cache-first
  if (isAsset(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        try {
          const fresh = await fetch(request);
          if (fresh.ok) {
            const cache = await caches.open(ASSET_CACHE);
            cache.put(request, fresh.clone());
          }
          return fresh;
        } catch {
          return new Response("", { status: 504 });
        }
      })(),
    );
    return;
  }

  // 其它请求：stale-while-revalidate
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      const network = fetch(request)
        .then(async (fresh) => {
          if (fresh.ok) {
            const cache = await caches.open(RUNTIME_CACHE);
            cache.put(request, fresh.clone());
          }
          return fresh;
        })
        .catch(() => null);
      return cached ?? (await network) ?? new Response("", { status: 504 });
    })(),
  );
});
