import test from "node:test";
import assert from "node:assert/strict";
import {
  materialSnapshotFromBlocks,
  questionSnapshotFromPage,
  sanitizePublicText,
} from "../scripts/notion-public-content.mjs";

test("sanitização remove referências internas do Notion", () => {
  const value = "Veja https://app.notion.com/p/abc e collection://1234; mantenha https://www.planalto.gov.br/teste";
  const clean = sanitizePublicText(value);
  assert.doesNotMatch(clean, /notion|collection:\/\//i);
  assert.match(clean, /planalto\.gov\.br/);
});

test("material público conserva pedagogia e remove seção privada", () => {
  const blocks = [
    { type: "heading_2", heading_2: { rich_text: [{ plain_text: "Teoria nuclear" }] } },
    { type: "paragraph", paragraph: { rich_text: [{ plain_text: "Conteúdo pedagógico." }] } },
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
  assert.equal(material.sections.length, 1);
  assert.equal(material.sections[0].heading, "Teoria nuclear");
  assert.doesNotMatch(JSON.stringify(material), /Tempo real/);
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
  assert.ok(!("items" in question));
});
