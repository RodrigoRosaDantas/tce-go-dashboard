import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { validateSnapshot } from "./snapshot-contract.mjs";
import {
  materialSnapshotFromBlocks,
  pageTitle,
  propertyText,
  questionSnapshotFromPage,
  relationIds,
} from "./notion-public-content.mjs";

const token = process.env.TCE_GO_NOTION_TOKEN?.trim();
const dataSourceId = process.env.TCE_GO_DAYS_DATA_SOURCE_ID?.trim();
const notionVersion = process.env.NOTION_VERSION || "2026-03-11";
const notionBase = "https://api.notion.com/v1";
const maxConcurrency = 3;

if (!token) throw new Error("TCE_GO_NOTION_TOKEN não configurado.");
if (!dataSourceId) throw new Error("TCE_GO_DAYS_DATA_SOURCE_ID não configurado.");

const currentPath = path.resolve("public/data/tce-go-snapshot.json");
const current = fs.existsSync(currentPath)
  ? JSON.parse(fs.readFileSync(currentPath, "utf8"))
  : { materials: {}, questions: {} };

const rows = await queryAllDays();
const links = rows.map(normalizeDayRecord).sort((a, b) => a.day.order - b.day.order);
const days = links.map((item) => item.day);
const ready = links.filter((item) => !item.day.protected && item.day.readyForStudy);

const pairs = await mapLimit(ready, maxConcurrency, async (item) => {
  if (!item.materialPageId) throw new Error(`${item.day.dxx}: Material canônico ausente.`);
  if (!item.questionPageId) throw new Error(`${item.day.dxx}: Questões canônicas ausentes.`);

  const [materialPage, questionPage] = await Promise.all([
    notionRequest(`/pages/${item.materialPageId}`),
    notionRequest(`/pages/${item.questionPageId}`),
  ]);

  assertLinkedDxx(item.day.dxx, materialPage, "material");
  assertLinkedDxx(item.day.dxx, questionPage, "questões");

  const previousMaterial = current.materials?.[item.day.slug];
  let material;
  if (previousMaterial?.lastEdited === materialPage.last_edited_time && Array.isArray(previousMaterial?.sections)) {
    material = previousMaterial;
  } else {
    const blocks = await getBlockTree(item.materialPageId);
    material = materialSnapshotFromBlocks({
      dxx: item.day.dxx,
      title: pageTitle(materialPage, item.day.focus),
      focus: propertyText(materialPage.properties, "Foco") || item.day.focus,
      version: numberProperty(materialPage.properties, "Versão editorial"),
      lastEdited: materialPage.last_edited_time,
    }, blocks);
  }

  const question = questionSnapshotFromPage({ dxx: item.day.dxx, page: questionPage });
  return { materialSlug: item.day.slug, questionSlug: item.day.questionSlug, material, question };
});

const materials = Object.fromEntries(pairs.map((item) => [item.materialSlug, item.material]));
const questions = Object.fromEntries(pairs.map((item) => [item.questionSlug, item.question]));
const publicStats = {
  totalDays: days.length,
  activeDays: days.filter((d) => !d.protected).length,
  protectedDays: days.filter((d) => d.protected).length,
  sessions: days.filter((d) => d.session).length,
  readyDays: ready.length,
  materialDays: Object.keys(materials).length,
  questionDays: Object.keys(questions).length,
};

const stablePayload = {
  schemaVersion: "1.0.0",
  source: "notion",
  contentMode: "full",
  days,
  materials,
  questions,
  publicStats,
};
const contentHash = createHash("sha256").update(JSON.stringify(stablePayload)).digest("hex");
const generatedAt = current.contentHash === contentHash && current.generatedAt
  ? current.generatedAt
  : new Date().toISOString();

const snapshot = { ...stablePayload, generatedAt, contentHash };
const errors = validateSnapshot(snapshot);
if (errors.length) throw new Error(`Snapshot recusado:\n- ${errors.join("\n- ")}`);

if (current.contentHash === contentHash && current.contentMode === "full") {
  console.log(`Sem mudança pública: ${publicStats.readyDays} dias prontos, hash ${contentHash.slice(0, 12)}.`);
  process.exit(0);
}

writeSnapshot(snapshot);
console.log(`Sync completo: ${publicStats.materialDays} materiais + ${publicStats.questionDays} cadernos públicos sanitizados.`);

async function queryAllDays() {
  const pages = [];
  let cursor;
  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const json = await notionRequest(`/data_sources/${dataSourceId}/query`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    pages.push(...(json.results || []));
    cursor = json.has_more ? json.next_cursor : undefined;
  } while (cursor);
  return pages;
}

function normalizeDayRecord(page) {
  const p = page.properties || {};
  const order = numberProperty(p, "Ordem");
  const dayTitle = titleProperty(p, "Dia");
  const dxx = dayTitle.match(/^D\d{3}/)?.[0] || `D${String(order).padStart(3, "0")}`;
  const protectedDay = selectProperty(p, "Tipo") === "Protegido";
  const readyForStudy = checkboxProperty(p, "Pronto para estudo");
  const audited = checkboxProperty(p, "Auditado");
  const slug = richProperty(p, "Slug") || `d${dxx.slice(1)}`;
  const materialPageId = relationIds(p["Material canônico"])[0] || null;
  const questionPageId = relationIds(p["Questões canônicas"])[0] || null;

  return {
    materialPageId,
    questionPageId,
    day: {
      dxx,
      order,
      ...(protectedDay ? {} : { session: richProperty(p, "Sessão TCE") }),
      protected: protectedDay,
      date: p["Data"]?.date?.start?.slice(0, 10) || "",
      type: selectProperty(p, "Tipo") || "",
      focus: richProperty(p, "Foco") || "",
      editorialStatus: protectedDay ? "protected" : readyForStudy ? "ready" : audited ? "audited" : "draft",
      readyForStudy,
      ...(protectedDay ? {} : { slug, questionSlug: `q${dxx.slice(1)}` }),
      ...(numberProperty(p, "Versão editorial") ? { version: numberProperty(p, "Versão editorial") } : {}),
    },
  };
}

async function getBlockTree(blockId, depth = 0) {
  if (depth > 5) return [];
  const blocks = [];
  let cursor;
  do {
    const query = new URLSearchParams({ page_size: "100" });
    if (cursor) query.set("start_cursor", cursor);
    const json = await notionRequest(`/blocks/${blockId}/children?${query}`);
    for (const block of json.results || []) {
      const item = { ...block };
      if (block.has_children) item.children = await getBlockTree(block.id, depth + 1);
      blocks.push(item);
    }
    cursor = json.has_more ? json.next_cursor : undefined;
  } while (cursor);
  return blocks;
}

async function notionRequest(endpoint, init = {}, attempt = 1) {
  const response = await fetch(`${notionBase}${endpoint}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": notionVersion,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  if ((response.status === 429 || response.status >= 500) && attempt < 5) {
    const retryAfter = Number(response.headers.get("retry-after") || 0);
    await sleep(Math.max(retryAfter * 1000, 350 * 2 ** (attempt - 1)));
    return notionRequest(endpoint, init, attempt + 1);
  }

  const body = await response.text();
  if (!response.ok) throw new Error(`Notion API ${response.status}: ${body.slice(0, 500)}`);
  return body ? JSON.parse(body) : {};
}

function assertLinkedDxx(expected, page, kind) {
  const actual = propertyText(page.properties, "Dxx");
  if (actual && actual !== expected) throw new Error(`${expected}: ${kind} vinculado declara ${actual}.`);
}

function titleProperty(properties, name) {
  const prop = properties?.[name];
  return (prop?.title || []).map((x) => x.plain_text || x.text?.content || "").join("").trim();
}
function richProperty(properties, name) {
  const prop = properties?.[name];
  return (prop?.rich_text || []).map((x) => x.plain_text || x.text?.content || "").join("").trim();
}
function selectProperty(properties, name) {
  return properties?.[name]?.select?.name || properties?.[name]?.status?.name || "";
}
function numberProperty(properties, name) {
  const value = properties?.[name]?.number;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
function checkboxProperty(properties, name) {
  return Boolean(properties?.[name]?.checkbox);
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function mapLimit(items, limit, mapper) {
  const output = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) break;
      output[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return output;
}
function writeSnapshot(data) {
  const dir = path.resolve("public/data");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(currentPath, JSON.stringify(data, null, 2) + "\n");
  fs.writeFileSync(path.join(dir, "tce-go-days.json"), JSON.stringify(data.days, null, 2) + "\n");
  fs.writeFileSync(path.join(dir, "tce-go-materials.json"), JSON.stringify(data.materials, null, 2) + "\n");
  fs.writeFileSync(path.join(dir, "tce-go-questions.json"), JSON.stringify(data.questions, null, 2) + "\n");
}
