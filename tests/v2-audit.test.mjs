import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("src/App.tsx", "utf8");
const css = fs.readFileSync("src/styles.css", "utf8");

test("home V2 respeita a sequência pedagógica antes do calendário", () => {
  assert.match(app, /published\.find\(\(d\) => !cachedProgress\(d\.dxx\)\?\.completed\)/);
  assert.doesNotMatch(app, /hasPublicSession\(snapshot, d\) && d\.date >= today/);
});

test("breakpoint legado não contamina o layout V2 em tablet", () => {
  assert.match(css, /\.layout:not\(\.v2-layout\) \{ grid-template-columns: 1fr; \}/);
  assert.match(css, /\.sidebar:not\(\.v2-sidebar\)/);
});

test("âncoras da aula compensam topbar e abas sticky", () => {
  assert.match(css, /\.study-content h2\[id\], \.study-content h3\[id\] \{ scroll-margin-top: 9rem; \}/);
});

test("desempenho deixou de ser uma página estática vazia", () => {
  assert.match(app, /function PerformancePage\(\{ snapshot \}/);
  assert.match(app, /route === "\/desempenho\/"\) page = <PerformancePage snapshot=\{snapshot\} \/>/);
  assert.match(css, /\.performance-grid/);
});
