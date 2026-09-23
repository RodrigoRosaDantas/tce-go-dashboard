import fs from "node:fs";
import path from "node:path";

const dist = path.resolve("dist");
const index = path.join(dist, "index.html");
if (!fs.existsSync(index)) throw new Error("dist/index.html não encontrado");

const snapshot = JSON.parse(fs.readFileSync("public/data/tce-go-snapshot.json", "utf8"));
const staticRoutes = [
  "dias","revisoes","redacoes","erros","simulados","desempenho",
  "edital","legislacao","reta-final","sync"
];
const hasPublicPayload = (d) => (
  !d.protected
  && d.readyForStudy
  && d.slug
  && d.questionSlug
  && snapshot.materials?.[d.slug]
  && snapshot.questions?.[d.questionSlug]
);
const dynamicRoutes = snapshot.days
  .filter(hasPublicPayload)
  .flatMap((d) => [`dia/${d.dxx.toLowerCase()}`, `questoes/${d.questionSlug}`]);
const routes = [...staticRoutes, ...dynamicRoutes];

for (const route of routes) {
  const dir = path.join(dist, route);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(index, path.join(dir, "index.html"));
}

fs.copyFileSync(index, path.join(dist, "404.html"));
fs.writeFileSync(path.join(dist, ".nojekyll"), "");

const assetDir = path.join(dist, "assets");
const assets = fs.existsSync(assetDir)
  ? fs.readdirSync(assetDir, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const parent = path.relative(assetDir, entry.parentPath || entry.path || assetDir);
        return `./assets/${path.join(parent, entry.name).replaceAll("\\", "/").replace(/^\.\//, "")}`;
      })
  : [];
const offlineCore = [
  "./",
  "./dias/",
  "./data/tce-go-snapshot.json",
  "./manifest.webmanifest",
  "./icon.svg",
  ...staticRoutes.map((route) => `./${route}/`),
  ...dynamicRoutes.map((route) => `./${route}/`),
  ...assets,
];
const cacheName = `tce-go-${snapshot.contentHash?.slice(0, 12) || snapshot.generatedAt.replace(/[^0-9]/g, "").slice(0, 14) || "v1"}`;
const serviceWorker = `const CACHE = ${JSON.stringify(cacheName)};
const CORE = ${JSON.stringify(offlineCore)};
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== location.origin) return;
  event.respondWith(fetch(event.request)
    .then((response) => {
      const clone = response.clone();
      caches.open(CACHE).then((cache) => cache.put(event.request, clone));
      return response;
    })
    .catch(() => caches.match(event.request).then((cached) => cached || (event.request.mode === "navigate" ? caches.match("./") : undefined))));
});
`;
fs.writeFileSync(path.join(dist, "sw.js"), serviceWorker);
console.log(`GitHub Pages preparado: ${routes.length + 1} rotas + fallback; ${offlineCore.length} recursos precacheados.`);
