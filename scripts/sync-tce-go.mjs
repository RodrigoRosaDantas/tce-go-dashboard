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
  stripHtml,
} from "./notion-public-content.mjs";

const token = process.env.TCE_GO_NOTION_TOKEN?.trim();
const dataSourceOverride = process.env.TCE_GO_DAYS_DATA_SOURCE_ID?.trim();
const notionVersion = process.env.NOTION_VERSION || "2026-03-11";
const daysDataSourceTitle = "Estudo dia a dia — D001 a D100 | TCE-GO";
const auxiliaryDataSources = {
  redactions: "d837d3d6-7646-4f41-888a-ed8b48f94c9d",
  simulations: "6deb1496-01ae-4a2d-8b38-5e99423410ee",
  edital: "930ae7dd-c076-40ad-a723-b2b9118c3367",
  sources: "926f6b7c-7886-4917-a2f8-76aa1d87d39f",
  finalSprint: "bd489b71-876d-450b-81f3-a8944f837bda",
};
const notionBase = "https://api.notion.com/v1";
const maxConcurrency = 3;

if (!token) throw new Error("TCE_GO_NOTION_TOKEN não configurado.");

const currentPath = path.resolve("public/data/tce-go-snapshot.json");
const current = fs.existsSync(currentPath)
  ? JSON.parse(fs.readFileSync(currentPath, "utf8"))
  : { materials: {}, questions: {} };

const dataSourceId = dataSourceOverride || await discoverDaysDataSourceId();
const rows = await queryAllDays();
const links = rows.map(normalizeDayRecord).sort((a, b) => a.day.order - b.day.order);
const days = links.map((item) => item.day);
const ready = links.filter((item) => !item.day.protected && item.day.readyForStudy);

const [redactionRows, simulationRows, editalRows, sourceRows, finalSprintRows] = await Promise.all([
  queryAllDataSource(auxiliaryDataSources.redactions),
  queryAllDataSource(auxiliaryDataSources.simulations),
  queryAllDataSource(auxiliaryDataSources.edital),
  queryAllDataSource(auxiliaryDataSources.sources),
  queryAllDataSource(auxiliaryDataSources.finalSprint),
]);
const redactions = redactionRows.map(normalizeRedactionPlan)
  .filter((item) => item.code && item.dxx)
  .sort((a, b) => a.code.localeCompare(b.code, "pt-BR", { numeric: true }));
const simulations = simulationRows.map(normalizeSimulationPlan)
  .filter((item) => item.dxx)
  .sort((a, b) => Number(a.dxx.slice(1)) - Number(b.dxx.slice(1)));
const edital = editalRows.map(normalizeEditalItem)
  .filter((item) => item.code && item.discipline)
  .sort((a, b) => a.order - b.order);
const legislation = sourceRows.map(normalizeLegislationSource)
  .filter((item) => item && ["Constituição", "Lei estadual", "Ato TCE-GO"].includes(item.category))
  .sort((a, b) => a.code.localeCompare(b.code, "pt-BR", { numeric: true }));
const finalSprint = finalSprintRows.map(normalizeFinalSprintDay)
  .filter((item) => item.code && item.date)
  .sort((a, b) => a.order - b.order);

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
  const previousQuestion = current.questions?.[item.day.questionSlug];
  const publishQuestionContent = item.day.dxx === "D001";
  const canReuseMaterial = Boolean(
    previousMaterial?.lastEdited === materialPage.last_edited_time
    && previousMaterial?.contentHtml
    && Array.isArray(previousMaterial?.sections)
  );
  const canReuseQuestion = Boolean(
    publishQuestionContent
    && previousQuestion?.lastEdited === questionPage.last_edited_time
    && previousQuestion?.contentHtml
    && Array.isArray(previousQuestion?.sections)
    && Array.isArray(previousQuestion?.authorialItems)
    && previousQuestion.authorialItems.length > 0
  );

  const [materialBlocks, questionBlocks] = await Promise.all([
    canReuseMaterial ? Promise.resolve(null) : getBlockTree(item.materialPageId),
    !publishQuestionContent || canReuseQuestion ? Promise.resolve(null) : getBlockTree(item.questionPageId),
  ]);

  const material = canReuseMaterial
    ? previousMaterial
    : materialSnapshotFromBlocks({
        dxx: item.day.dxx,
        title: pageTitle(materialPage, item.day.focus),
        focus: propertyText(materialPage.properties, "Foco") || item.day.focus,
        version: numberProperty(materialPage.properties, "Versão editorial"),
        lastEdited: materialPage.last_edited_time,
      }, materialBlocks);

  if (stripHtml(material.contentHtml || "").length < 250) {
    throw new Error(`${item.day.dxx}: Material público insuficiente após sanitização.`);
  }

  const question = canReuseQuestion
    ? previousQuestion
    : questionSnapshotFromPage({
        dxx: item.day.dxx,
        page: questionPage,
        blocks: publishQuestionContent ? questionBlocks : [],
      });

  if (question.contentHtml && stripHtml(question.contentHtml).length < 120) {
    throw new Error(`${item.day.dxx}: Qxx público insuficiente após sanitização.`);
  }

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
  materialPages: Object.keys(materials).length,
  questionPages: Object.keys(questions).length,
  redactionPlans: redactions.length,
  simulationPlans: simulations.length,
  editalItems: edital.length,
  legislationSources: legislation.length,
  finalSprintDays: finalSprint.length,
};

const stablePayload = {
  schemaVersion: "1.0.0",
  source: "notion",
  contentMode: "full",
  auxiliaryMode: "full",
  days,
  materials,
  questions,
  redactions,
  simulations,
  edital,
  legislation,
  finalSprint,
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
console.log(`Sync completo: ${publicStats.materialPages} materiais + ${publicStats.questionPages} cadernos Qxx públicos.`);

async function discoverDaysDataSourceId() {
  const json = await notionRequest("/search", {
    method: "POST",
    body: JSON.stringify({
      query: "Estudo dia a dia",
      page_size: 100,
      filter: { property: "object", value: "data_source" },
    }),
  });

  const sources = (json.results || []).filter((item) => item?.object === "data_source");
  const exact = sources.find((item) => dataSourceTitle(item) === daysDataSourceTitle);
  if (exact?.id) return exact.id;

  const fallback = sources.filter((item) => {
    const title = dataSourceTitle(item);
    return /D001\s*(?:a|–|-)\s*D100/i.test(title) && /TCE-?GO/i.test(title);
  });
  if (fallback.length === 1 && fallback[0]?.id) return fallback[0].id;

  const found = sources.map(dataSourceTitle).filter(Boolean).join(" | ");
  throw new Error(`Data source canônico não localizado por título: "${daysDataSourceTitle}". Encontrados: ${found || "nenhum"}.`);
}

function dataSourceTitle(item) {
  if (Array.isArray(item?.title)) {
    return item.title.map((part) => part?.plain_text || part?.text?.content || "").join("").trim();
  }
  return String(item?.name || "").trim();
}

async function queryAllDays() {
  return queryAllDataSource(dataSourceId);
}

async function queryAllDataSource(id) {
  const pages = [];
  let cursor;
  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const json = await notionRequest(`/data_sources/${id}/query`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    pages.push(...(json.results || []));
    cursor = json.has_more ? json.next_cursor : undefined;
  } while (cursor);
  return pages.filter((page) => !page.archived);
}

function normalizeRedactionPlan(page) {
  const p = page.properties || {};
  const title = propertyText(p, "Redação");
  const match = title.match(/\bR(\d+)\b/i);
  return {
    code: match ? `R${Number(match[1])}` : "",
    title,
    dxx: propertyText(p, "Dxx"),
    date: dateProperty(p, "Data"),
    theme: propertyText(p, "Tema"),
  };
}

function normalizeSimulationPlan(page) {
  const p = page.properties || {};
  return {
    title: propertyText(p, "Marco"),
    dxx: propertyText(p, "Dxx"),
    date: dateProperty(p, "Data"),
    type: propertyText(p, "Tipo"),
    plannedCoverage: numberProperty(p, "Cobertura — previstos"),
    plannedSessions: numberProperty(p, "Carga — sessões previstas"),
  };
}

function normalizeEditalItem(page) {
  const p = page.properties || {};
  return {
    code: propertyText(p, "Código"),
    order: numberProperty(p, "Ordem"),
    discipline: propertyText(p, "Disciplina"),
    active: checkboxProperty(p, "Ativo"),
    block: propertyText(p, "Bloco"),
    questions: numberProperty(p, "Questões"),
    weight: numberProperty(p, "Peso"),
    weightedPoints: numberProperty(p, "Pontos ponderados"),
    editorialStatus: propertyText(p, "Status editorial"),
    normativeSource: propertyText(p, "Fonte normativa"),
  };
}

function normalizeLegislationSource(page) {
  const p = page.properties || {};
  const official = checkboxProperty(p, "Fonte oficial");
  const nature = propertyText(p, "Natureza");
  const officialUrl = safePublicUrl(urlProperty(p, "URL oficial"));
  if (!official || nature !== "Fonte oficial externa" || !officialUrl) return null;
  return {
    code: propertyText(p, "Código"),
    title: propertyText(p, "Fonte"),
    category: propertyText(p, "Categoria"),
    cutoff: propertyText(p, "Corte/vigência"),
    dxx: propertyText(p, "Dxx principal"),
    use: propertyText(p, "Uso"),
    status: propertyText(p, "Status"),
    officialUrl,
  };
}

function normalizeFinalSprintDay(page) {
  const p = page.properties || {};
  return {
    code: propertyText(p, "Código"),
    order: numberProperty(p, "Ordem"),
    date: dateProperty(p, "Data"),
    title: propertyText(p, "Dia da reta final"),
    type: propertyText(p, "Tipo"),
  };
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
      if (block.has_children && !["child_page", "child_database"].includes(block.type)) {
        item.children = await getBlockTree(block.id, depth + 1);
      }
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
    await sleep(Math.max(retryAfter * 1000, 500 * 2 ** (attempt - 1)));
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
function dateProperty(properties, name) {
  return properties?.[name]?.date?.start?.slice(0, 10) || "";
}
function urlProperty(properties, name) {
  return String(properties?.[name]?.url || "").trim();
}
function safePublicUrl(value) {
  if (!/^https?:\/\//i.test(value || "")) return "";
  try {
    const parsed = new URL(value);
    if (/^(?:www\.)?notion\.so$/i.test(parsed.hostname) || /^app\.notion\.com$/i.test(parsed.hostname)) return "";
    return parsed.toString();
  } catch {
    return "";
  }
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
  fs.writeFileSync(path.join(dir, "tce-go-edital.json"), JSON.stringify(data.edital || [], null, 2) + "\n");
}
