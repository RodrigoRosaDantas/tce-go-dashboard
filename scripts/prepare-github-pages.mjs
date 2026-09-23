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
console.log(`GitHub Pages preparado: ${routes.length + 1} rotas + fallback.`);
