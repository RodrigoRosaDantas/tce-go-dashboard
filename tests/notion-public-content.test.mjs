import test from "node:test";
import assert from "node:assert/strict";
import {
  materialSnapshotFromBlocks,
  questionSnapshotFromPage,
  sanitizePublicText,
  stripHtml,
} from "../scripts/notion-public-content.mjs";

test("sanitização remove referências internas do Notion", () => {
  const value = "Veja https://app.notion.com/p/abc e collection://1234; mantenha https://www.planalto.gov.br/teste";
  const clean = sanitizePublicText(value);
  assert.doesNotMatch(clean, /notion|collection:\/\//i);
  assert.match(clean, /planalto\.gov\.br/);
});

test("material público conserva pedagogia, tabela e remove seção privada", () => {
  const blocks = [
    { type: "heading_2", heading_2: { rich_text: [{ plain_text: "Teoria nuclear" }] } },
    { type: "paragraph", paragraph: { rich_text: [{ plain_text: "Conteúdo pedagógico." }] } },
    { type: "table", table: { has_column_header: true }, children: [
      { type: "table_row", table_row: { cells: [[{ plain_text: "Artigo" }],[{ plain_text: "Núcleo" }]] } },
      { type: "table_row", table_row: { cells: [[{ plain_text: "70" }],[{ plain_text: "Fiscalização" }]] } },
    ]},
    { type: "heading_2", heading_2: { rich_text: [{ plain_text: "Execução real" }] } },
    { type: "paragraph", paragraph: { rich_text: [{ plain_text: "Tempo real: __" }] } },
  ];
  const material = materialSnapshotFromBlocks({
    dxx: "D001",
    title: "D001 — Controle",
    focus: "Controle constitucional",
    version: 3,
    lastEdited: "2026-09-23T00:00:00Z",
  }, blocks);

  assert.match(material.contentHtml, /Teoria nuclear/);
  assert.match(material.contentHtml, /<table>/);
  assert.doesNotMatch(material.contentHtml, /Execução real|Tempo real/);
  assert.ok(stripHtml(material.contentHtml).length > 20);
  assert.match(material.hash, /^[a-f0-9]{64}$/);
});

test("Qxx público usa somente metadados editoriais", () => {
  const page = {
    last_edited_time: "2026-09-23T00:00:00Z",
    properties: {
      Qxx: { rich_text: [{ plain_text: "Q001" }] },
      "Questões do dia": { title: [{ plain_text: "Q001 — Questões" }] },
      Meta: { number: 20 },
      "Questões válidas": { number: 20 },
      "Origem prioritária": { rich_text: [{ plain_text: "FCC por referência + autorais controladas" }] },
      "Versão editorial": { number: 4 },
      "Lacuna declarada": { checkbox: false },
    },
  };
  const question = questionSnapshotFromPage({ dxx: "D001", page });
  assert.equal(question.meta, 20);
  assert.equal(question.valid, 20);
  assert.equal(question.copyrightMode, "metadata-only");
  assert.ok(!("contentHtml" in question));
  assert.ok(!("items" in question));
});

test("subseção privada aninhada não vaza conteúdo", () => {
  const blocks = [
    { type: "heading_2", heading_2: { rich_text: [{ plain_text: "Teoria pública" }] } },
    { type: "paragraph", paragraph: { rich_text: [{ plain_text: "Conteúdo permitido." }] } },
    { type: "heading_2", heading_2: { rich_text: [{ plain_text: "Execução real" }] } },
    { type: "paragraph", paragraph: { rich_text: [{ plain_text: "Tempo real: 55 min" }] } },
    { type: "heading_3", heading_3: { rich_text: [{ plain_text: "Métricas" }] } },
    { type: "paragraph", paragraph: { rich_text: [{ plain_text: "Acertos: 18" }] } },
    { type: "heading_2", heading_2: { rich_text: [{ plain_text: "Fechamento pedagógico" }] } },
    { type: "paragraph", paragraph: { rich_text: [{ plain_text: "Conteúdo final permitido." }] } },
  ];
  const material = materialSnapshotFromBlocks({
    dxx: "D001",
    title: "D001 — Controle",
    focus: "Controle constitucional",
    version: 3,
    lastEdited: "2026-09-23T00:00:00Z",
  }, blocks);
  const serialized = JSON.stringify(material);
  assert.match(serialized, /Conteúdo permitido/);
  assert.match(serialized, /Conteúdo final permitido/);
  assert.doesNotMatch(serialized, /Tempo real|Acertos: 18|Métricas/);
});

test("observações editoriais não viram resumo público do Qxx", () => {
  const page = {
    properties: {
      Qxx: { rich_text: [{ plain_text: "Q002" }] },
      "Questões do dia": { title: [{ plain_text: "Q002 — Questões" }] },
      "Observações editoriais": { rich_text: [{ plain_text: "nota interna que não deve sair" }] },
    },
  };
  const question = questionSnapshotFromPage({ dxx: "D002", page });
  assert.doesNotMatch(question.sourceSummary, /nota interna/i);
});
