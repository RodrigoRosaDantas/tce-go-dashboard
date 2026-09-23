import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const required = [
  "",
  "dias",
  "dia/d001",
  "questoes/q001",
  "revisoes",
  "redacoes",
  "erros",
  "simulados",
  "desempenho",
  "edital",
  "legislacao",
  "reta-final",
  "sync",
];

test("rotas críticas foram materializadas no build", () => {
  for (const route of required) {
    const file = route ? path.join("dist", route, "index.html") : path.join("dist", "index.html");
    assert.ok(fs.existsSync(file), `rota ausente: /${route}/`);
  }
});

test("fallback e PWA existem", () => {
  assert.ok(fs.existsSync("dist/404.html"));
  assert.ok(fs.existsSync("dist/sw.js"));
  assert.ok(fs.existsSync("dist/manifest.webmanifest"));
  assert.ok(fs.existsSync("dist/.nojekyll"));
});

test("build usa base path do GitHub Pages", () => {
  const html = fs.readFileSync("dist/index.html", "utf8");
  assert.match(html, /\/tce-go-dashboard\/assets\//);
});

test("rotas dinâmicas existem somente quando Material + Qxx públicos estão disponíveis", () => {
  const snapshot = JSON.parse(fs.readFileSync("public/data/tce-go-snapshot.json", "utf8"));
  for (const day of snapshot.days.filter((d) => !d.protected && d.readyForStudy)) {
    const shouldPublish = Boolean(
      day.slug
      && day.questionSlug
      && snapshot.materials?.[day.slug]
      && snapshot.questions?.[day.questionSlug]
    );
    const dayFile = path.join("dist", "dia", day.dxx.toLowerCase(), "index.html");
    const questionFile = path.join("dist", "questoes", day.questionSlug, "index.html");
    assert.equal(fs.existsSync(dayFile), shouldPublish, `${day.dxx}: rota de dia divergente da cobertura pública`);
    assert.equal(fs.existsSync(questionFile), shouldPublish, `${day.dxx}: rota Qxx divergente da cobertura pública`);
  }
});
