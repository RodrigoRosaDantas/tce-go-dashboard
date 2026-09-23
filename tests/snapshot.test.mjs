import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { validateSnapshot } from "../scripts/snapshot-contract.mjs";

const snapshot = JSON.parse(fs.readFileSync("public/data/tce-go-snapshot.json", "utf8"));

test("snapshot canônico é válido", () => {
  assert.deepEqual(validateSnapshot(snapshot), []);
});

test("S01–S47 existe apenas nos 47 dias ativos", () => {
  const active = snapshot.days.filter((d) => !d.protected);
  const protectedDays = snapshot.days.filter((d) => d.protected);
  assert.equal(active.length, 47);
  assert.equal(protectedDays.length, 53);
  assert.equal(active[0].session, "S01");
  assert.equal(active.at(-1).session, "S47");
  assert.ok(protectedDays.every((d) => !("session" in d)));
});

test("frontend pode ordenar somente por Ordem", () => {
  const shuffled = [...snapshot.days].reverse();
  shuffled.sort((a, b) => a.order - b.order);
  assert.equal(shuffled[0].dxx, "D001");
  assert.equal(shuffled.at(-1).dxx, "D100");
});

test("somente dias prontos podem ser tratados como liberados", () => {
  const released = snapshot.days.filter((d) => d.readyForStudy);
  assert.equal(released.length, snapshot.publicStats.readyDays);
  assert.ok(released.every((d) => !d.protected && d.editorialStatus === "ready"));
});

test("conteúdo público pertence somente a dias liberados", () => {
  const released = snapshot.days.filter((d) => d.readyForStudy && !d.protected);
  const materialSlugs = new Set(released.map((d) => d.slug).filter(Boolean));
  const questionSlugs = new Set(released.map((d) => d.questionSlug).filter(Boolean));

  for (const [slug, material] of Object.entries(snapshot.materials || {})) {
    assert.ok(materialSlugs.has(slug), `material indevido: ${slug}`);
    assert.equal(material.dxx, released.find((d) => d.slug === slug)?.dxx);
  }
  for (const [slug, question] of Object.entries(snapshot.questions || {})) {
    assert.ok(questionSlugs.has(slug), `Qxx indevido: ${slug}`);
    assert.equal(question.dxx, released.find((d) => d.questionSlug === slug)?.dxx);
  }
});

test("snapshot não expõe referência interna do Notion nem HTML ativo", () => {
  const serialized = JSON.stringify(snapshot);
  assert.doesNotMatch(serialized, /app\.notion\.com|notion\.so|collection:\/\//i);
  for (const entry of [
    ...Object.values(snapshot.materials || {}),
    ...Object.values(snapshot.questions || {}),
  ]) {
    if (!entry.contentHtml) continue;
    assert.doesNotMatch(entry.contentHtml, /<script\b|javascript:|\son[a-z]+\s*=/i);
  }
});
