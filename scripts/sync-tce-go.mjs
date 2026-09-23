import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { validateSnapshot } from "./snapshot-contract.mjs";

const token = process.env.TCE_GO_NOTION_TOKEN?.trim();
const dataSourceId = process.env.TCE_GO_DAYS_DATA_SOURCE_ID?.trim();
const notionVersion = process.env.NOTION_VERSION || "2026-03-11";
const notionApiBase = "https://api.notion.com/v1";
const maxConcurrency = 4;

if (!token) throw new Error("TCE_GO_NOTION_TOKEN não configurado.");
if (!dataSourceId) throw new Error("TCE_GO_DAYS_DATA_SOURCE_ID não configurado.");

const currentPath = path.resolve("public/data/tce-go-snapshot.json");
const current = fs.existsSync(currentPath)
  ? JSON.parse(fs.readFileSync(currentPath, "utf8"))
  : { materials: {}, questions: {} };

const request = createNotionRequest();
const rows = await queryAll();
const normalized = rows
  .map(normalizeDayRecord)
  .sort((left, right) => left.day.order - right.day.order);

const days = normalized.map((item) => item.day);
const ready = normalized.filter((item) => item.day.readyForStudy && !item.day.protected);

for (const item of ready) {
  if (!item.materialId) throw new Error(`${item.day.dxx}: Pronto para estudo sem Material canônico.`);
  if (!item.questionId) throw new Error(`${item.day.dxx}: Pronto para estudo sem Questões canônicas.`);
}

const routeByPageId = new Map();
for (const item of ready) {
  routeByPageId.set(compactId(item.materialId), `/dia/${item.day.dxx.toLowerCase()}/`);
  routeByPageId.set(compactId(item.questionId), `/questoes/${item.day.questionSlug}/`);
}

const materials = {};
const questions = {};

await Promise.all(
  ready.flatMap((item) => [
    syncMaterial(item),
    syncQuestion(item),
  ]),
);

const publicStats = {
  totalDays: days.length,
  activeDays: days.filter((d) => !d.protected).length,
  protectedDays: days.filter((d) => d.protected).length,
  sessions: days.filter((d) => d.session).length,
  readyDays: ready.length,
  materialPages: Object.keys(materials).length,
  questionPages: Object.keys(questions).length,
};

if (publicStats.materialPages !== publicStats.readyDays) {
  throw new Error(`Materiais publicáveis incompletos: ${publicStats.materialPages}/${publicStats.readyDays}.`);
}
if (publicStats.questionPages !== publicStats.readyDays) {
  throw new Error(`Qxx publicáveis incompletos: ${publicStats.questionPages}/${publicStats.readyDays}.`);
}

let snapshot = {
  schemaVersion: "1.0.0",
  generatedAt: current.generatedAt || new Date().toISOString(),
  source: "notion",
  days,
  materials,
  questions,
  publicStats,
};

if (snapshotComparable(snapshot) !== snapshotComparable(current)) {
  snapshot.generatedAt = new Date().toISOString();
} else if (current.generatedAt) {
  snapshot.generatedAt = current.generatedAt;
}

const errors = validateSnapshot(snapshot);
if (errors.length) throw new Error(`Snapshot recusado:\n- ${errors.join("\n- ")}`);

const tmp = `${currentPath}.tmp`;
fs.writeFileSync(tmp, JSON.stringify(snapshot, null, 2) + "\n");
fs.renameSync(tmp, currentPath);
writeSplit(snapshot);
console.log(
  `Sync concluído: ${snapshot.publicStats.readyDays} dias, `
  + `${snapshot.publicStats.materialPages} materiais e `
  + `${snapshot.publicStats.questionPages} Qxx publicáveis.`,
);

async function syncMaterial(item) {
  const slug = item.day.slug;
  const previous = current.materials?.[slug];
  const page = await request(`/pages/${apiId(item.materialId)}`);
  let contentHtml = previous?.lastEdited === page.last_edited_time && previous?.contentHtml
    ? previous.contentHtml
    : "";

  if (!contentHtml) {
    const tree = await getBlockTree(page.id);
    contentHtml = withStudyIndex(
      sanitizePublicStudyHtml(renderBlocks(tree), "material"),
      slug,
    );
  }

  const textLength = stripHtml(contentHtml).length;
  if (textLength < 350) {
    throw new Error(`${item.day.dxx}: Material pronto com conteúdo público insuficiente (${textLength} caracteres).`);
  }

  materials[slug] = {
    dxx: item.day.dxx,
    title: pageTitle(page) || item.day.focus || item.day.dxx,
    summary: item.day.focus,
    contentHtml,
    version: propertyNumber(page.properties, "Versão editorial") || item.day.version || 1,
    lastEdited: page.last_edited_time || null,
    hash: sha256(contentHtml),
  };
}

async function syncQuestion(item) {
  const slug = item.day.questionSlug;
  const previous = current.questions?.[slug];
  const page = await request(`/pages/${apiId(item.questionId)}`);
  let contentHtml = previous?.lastEdited === page.last_edited_time && previous?.contentHtml
    ? previous.contentHtml
    : "";

  if (!contentHtml) {
    const tree = await getBlockTree(page.id);
    contentHtml = withStudyIndex(
      sanitizePublicStudyHtml(renderBlocks(tree), "question"),
      slug,
    );
  }

  const textLength = stripHtml(contentHtml).length;
  if (textLength < 120) {
    throw new Error(`${slug.toUpperCase()}: Qxx pronto com conteúdo público insuficiente (${textLength} caracteres).`);
  }

  const sourceSummary =
    propertyText(page.properties, "Origem prioritária")
    || propertyText(page.properties, "Observações editoriais")
    || "Curadoria vinculada ao Dxx canônico.";
  const copyrightMode = /autoral/i.test(sourceSummary)
    ? (/FCC|terceir|prova/i.test(sourceSummary) ? "sanitized-mixed" : "project-authored")
    : "metadata-only";

  questions[slug] = {
    qxx: propertyText(page.properties, "Qxx") || slug.toUpperCase(),
    dxx: item.day.dxx,
    title: pageTitle(page) || `Questões | ${item.day.focus}`,
    meta: propertyNumber(page.properties, "Meta") || propertyNumber(page.properties, "Meta de questões") || 0,
    valid: propertyNumber(page.properties, "Questões válidas"),
    sourceSummary,
    copyrightMode,
    contentHtml,
    version: propertyNumber(page.properties, "Versão editorial") || item.day.version || 1,
    lastEdited: page.last_edited_time || null,
    hash: sha256(contentHtml),
  };
}

async function queryAll() {
  const pages = [];
  let cursor = null;
  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const response = await request(`/data_sources/${apiId(dataSourceId)}/query`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    pages.push(...(response.results || []));
    cursor = response.has_more ? response.next_cursor : null;
  } while (cursor);
  return pages.filter((page) => !page.archived);
}

function normalizeDayRecord(page) {
  const p = page.properties || {};
  const order = propertyNumber(p, "Ordem");
  const dxx = propertyText(p, "Dia").match(/^D\d{3}/)?.[0] || `D${String(order).padStart(3, "0")}`;
  const protectedDay = propertyText(p, "Tipo") === "Protegido";
  const readyForStudy = propertyCheckbox(p, "Pronto para estudo");
  const audited = propertyCheckbox(p, "Auditado");
  const slug = propertyText(p, "Slug") || (protectedDay ? undefined : dxx.toLowerCase());
  const questionSlug = protectedDay ? undefined : `q${dxx.slice(1)}`;
  const day = {
    dxx,
    order,
    ...(protectedDay ? {} : { session: propertyText(p, "Sessão TCE") }),
    protected: protectedDay,
    date: propertyDate(p, "Data") || "",
    type: propertyText(p, "Tipo"),
    focus: propertyText(p, "Foco"),
    editorialStatus: protectedDay ? "protected" : readyForStudy ? "ready" : audited ? "audited" : "draft",
    readyForStudy,
    ...(slug ? { slug, questionSlug } : {}),
  };
  const version = propertyNumber(p, "Versão editorial");
  if (version) day.version = version;

  return {
    day,
    materialId: propertyRelationIds(p, "Material canônico")[0] || null,
    questionId: propertyRelationIds(p, "Questões canônicas")[0] || null,
  };
}

function createNotionRequest() {
  let inFlight = 0;
  const waiting = [];

  const acquire = () => new Promise((resolve) => {
    if (inFlight < maxConcurrency) {
      inFlight += 1;
      resolve();
    } else {
      waiting.push(resolve);
    }
  });

  const release = () => {
    const next = waiting.shift();
    if (next) next();
    else inFlight -= 1;
  };

  return async (endpoint, init = {}, attempt = 0) => {
    await acquire();
    try {
      const response = await fetch(`${notionApiBase}${endpoint}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          "Notion-Version": notionVersion,
          "Content-Type": "application/json",
          ...(init.headers || {}),
        },
      });
      const body = await response.text();
      if (response.status === 429 && attempt < 6) {
        const retryAfter = Number(response.headers.get("retry-after") || 1);
        await sleep(Math.max(600, retryAfter * 1000));
        return await notionRequestDirect(endpoint, init, attempt + 1);
      }
      if (!response.ok) throw new Error(`Notion API ${response.status}: ${body.slice(0, 320)}`);
      return JSON.parse(body);
    } finally {
      release();
    }
  };
}

async function notionRequestDirect(endpoint, init = {}, attempt = 0) {
  const response = await fetch(`${notionApiBase}${endpoint}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": notionVersion,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const body = await response.text();
  if (response.status === 429 && attempt < 6) {
    const retryAfter = Number(response.headers.get("retry-after") || 1);
    await sleep(Math.max(600, retryAfter * 1000));
    return notionRequestDirect(endpoint, init, attempt + 1);
  }
  if (!response.ok) throw new Error(`Notion API ${response.status}: ${body.slice(0, 320)}`);
  return JSON.parse(body);
}

async function getAllChildren(blockId) {
  const results = [];
  let cursor = null;
  do {
    const query = new URLSearchParams({ page_size: "100" });
    if (cursor) query.set("start_cursor", cursor);
    const response = await request(`/blocks/${apiId(blockId)}/children?${query}`);
    results.push(...(response.results || []));
    cursor = response.has_more ? response.next_cursor : null;
  } while (cursor);
  return results;
}

async function getBlockTree(blockId) {
  const blocks = await getAllChildren(blockId);
  await Promise.all(blocks.map(async (block) => {
    if (block.has_children && !["child_page", "child_database"].includes(block.type)) {
      block.__children = await getBlockTree(block.id);
    } else {
      block.__children = [];
    }
  }));
  return blocks;
}

function renderBlocks(blocks) {
  let html = "";
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (["bulleted_list_item", "numbered_list_item"].includes(block.type)) {
      const type = block.type;
      const tag = type === "bulleted_list_item" ? "ul" : "ol";
      const items = [];
      while (index < blocks.length && blocks[index].type === type) {
        const item = blocks[index];
        const data = item[type] || {};
        items.push(`<li>${richTextHtml(data.rich_text)}${renderBlocks(item.__children || [])}</li>`);
        index += 1;
      }
      index -= 1;
      html += `<${tag}>${items.join("")}</${tag}>`;
      continue;
    }
    html += renderBlock(block);
  }
  return html;
}

function renderBlock(block) {
  const type = block.type;
  const data = block[type] || {};
  const text = richTextHtml(data.rich_text);
  const children = renderBlocks(block.__children || []);

  if (type === "paragraph") return text ? `<p>${text}</p>${children}` : children;
  if (type === "heading_1" || type === "heading_2") return `<h2>${text}</h2>${children}`;
  if (type === "heading_3") return `<h3>${text}</h3>${children}`;
  if (type === "quote") return `<blockquote>${text}${children}</blockquote>`;
  if (type === "callout") {
    const icon = data.icon?.type === "emoji" ? `${escapeHtml(data.icon.emoji)} ` : "";
    return `<aside class="study-callout">${icon}${text}${children}</aside>`;
  }
  if (type === "divider") return "<hr>";
  if (type === "toggle") return `<details class="study-toggle"><summary>${text || "Ver conteúdo"}</summary>${children}</details>`;
  if (type === "to_do") return `<div class="study-todo"><span>${data.checked ? "☑" : "☐"}</span><span>${text}</span></div>${children}`;
  if (type === "code") {
    const raw = (data.rich_text || []).map((item) => item.plain_text || "").join("");
    return `<pre><code>${escapeHtml(raw)}</code></pre>${children}`;
  }
  if (type === "equation") return `<div class="study-equation">${escapeHtml(data.expression || "")}</div>${children}`;
  if (type === "table") {
    const rows = (block.__children || [])
      .filter((item) => item.type === "table_row")
      .map((row, rowIndex) => {
        const cells = (row.table_row?.cells || []).map((cell) => {
          const tag = rowIndex === 0 && data.has_column_header ? "th" : "td";
          return `<${tag}>${richTextHtml(cell)}</${tag}>`;
        }).join("");
        return `<tr>${cells}</tr>`;
      }).join("");
    return `<div class="study-table-wrap"><table>${rows}</table></div>`;
  }
  if (type === "bookmark" || type === "link_preview") {
    const url = safeExternalUrl(data.url);
    return url ? `<p><a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">Abrir referência externa ↗</a></p>` : children;
  }
  if (type === "image") {
    const url = data.type === "external" ? safeExternalUrl(data.external?.url) : "";
    const caption = richTextHtml(data.caption);
    return url
      ? `<figure><img src="${escapeHtml(url)}" alt="" loading="lazy">${caption ? `<figcaption>${caption}</figcaption>` : ""}</figure>`
      : `<div class="study-media-note">🖼️ Imagem disponível apenas na fonte canônica.</div>`;
  }
  if (["synced_block", "column", "column_list"].includes(type)) return children;
  if (["child_page", "child_database", "file", "pdf", "video", "audio"].includes(type)) {
    return children || `<div class="study-media-note">Anexo ou conteúdo vinculado disponível apenas na fonte canônica.</div>`;
  }
  return children || (text ? `<p>${text}</p>` : "");
}

function richTextHtml(items = []) {
  return (items || []).map((item) => {
    let value = item.type === "equation"
      ? escapeHtml(item.equation?.expression || "")
      : escapeHtml(item.plain_text || item.text?.content || "");
    const annotations = item.annotations || {};
    if (annotations.code) value = `<code>${value}</code>`;
    if (annotations.bold) value = `<strong>${value}</strong>`;
    if (annotations.italic) value = `<em>${value}</em>`;
    if (annotations.underline) value = `<u>${value}</u>`;
    if (annotations.strikethrough) value = `<s>${value}</s>`;

    const href = item.href || item.text?.link?.url || "";
    const external = safeExternalUrl(href);
    if (external) value = `<a href="${escapeHtml(external)}" target="_blank" rel="noreferrer">${value}</a>`;
    return value;
  }).join("");
}

function sanitizePublicStudyHtml(value, kind) {
  let html = String(value || "")
    .replaceAll(/<script[\s\S]*?<\/script>/gi, "")
    .replaceAll(/\son[a-z]+="[^"]*"/gi, "")
    .replaceAll(/\son[a-z]+='[^']*'/gi, "");

  const sectionPattern = kind === "question"
    ? /navega[çc][ãa]o|controle\s+operacional|folha\s+de\s+resposta|registro\s+de\s+execu[çc][ãa]o|execu[çc][ãa]o\s+real|dados\s+de\s+execu[çc][ãa]o|desempenho\s+pessoal|hist[óo]rico\s+pessoal/i
    : /navega[çc][ãa]o|controle\s+operacional|registro\s+de\s+execu[çc][ãa]o|execu[çc][ãa]o\s+real|dados\s+de\s+execu[çc][ãa]o|hist[óo]rico\s+pessoal|hist[óo]rico\s+reaproveitado|baseline\s+pessoal/i;

  html = removeHtmlSections(html, (heading) => sectionPattern.test(stripHtml(heading)));
  html = html.replace(/<(p|blockquote|li|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, (block) => {
    const plain = stripHtml(block);
    return /resposta\s+pessoal|tempo\s+real|acertos\/erros\s+reais|n[ãa]o\s+preencher\s+editorialmente|meus\s+dados/i.test(plain)
      ? ""
      : block;
  });

  return html.replace(/\s{2,}/g, " ").trim();
}

function removeHtmlSections(html, shouldRemove) {
  const headingPattern = /<h[23]\b[^>]*>[\s\S]*?<\/h[23]>/gi;
  const matches = [...html.matchAll(headingPattern)];
  if (!matches.length) return html;

  let output = "";
  let cursor = 0;
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const start = match.index ?? 0;
    const nextStart = matches[index + 1]?.index ?? html.length;
    output += html.slice(cursor, start);
    if (!shouldRemove(match[0])) output += html.slice(start, nextStart);
    cursor = nextStart;
  }
  return output + html.slice(cursor);
}

function withStudyIndex(html, code) {
  const headings = [];
  let counter = 0;
  const anchored = String(html || "").replace(/<h([23])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (heading, level, inner) => {
    const label = stripHtml(inner);
    if (!label) return heading;
    counter += 1;
    const id = `${String(code).toLowerCase()}-${slugifyHeading(label)}-${counter}`;
    headings.push({ id, label, level: Number(level) });
    return `<h${level} id="${id}">${inner}</h${level}>`;
  });
  if (!headings.length) return anchored;
  const index = `<details class="study-toggle study-index"><summary>🧭 Índice da aula</summary><nav class="study-index-nav" aria-label="Seções da aula"><ol>${headings.map((h) => `<li class="study-index-level-${h.level}"><a href="#${h.id}">${escapeHtml(h.label)}</a></li>`).join("")}</ol></nav></details>`;
  return index + anchored;
}

function propertyText(properties, name) {
  const property = properties?.[name];
  if (!property) return "";
  if (property.title) return property.title.map((item) => item.plain_text || item.text?.content || "").join("").trim();
  if (property.rich_text) return property.rich_text.map((item) => item.plain_text || item.text?.content || "").join("").trim();
  if (property.select) return property.select?.name || "";
  if (property.status) return property.status?.name || "";
  if (property.formula?.type === "string") return property.formula.string || "";
  return "";
}

function propertyNumber(properties, name) {
  const value = properties?.[name]?.number;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function propertyCheckbox(properties, name) {
  return Boolean(properties?.[name]?.checkbox);
}

function propertyDate(properties, name) {
  return properties?.[name]?.date?.start?.slice(0, 10) || "";
}

function propertyRelationIds(properties, name) {
  return (properties?.[name]?.relation || []).map((item) => item.id).filter(Boolean);
}

function pageTitle(page) {
  const property = Object.values(page?.properties || {}).find((item) => item?.type === "title" || item?.title);
  return property?.title?.map((item) => item.plain_text || item.text?.content || "").join("") || "";
}

function safeExternalUrl(value) {
  const raw = String(value || "").trim();
  if (!/^https?:\/\//i.test(raw)) return "";
  try {
    const url = new URL(raw);
    if (/^(?:www\.)?notion\.so$/i.test(url.hostname) || /^app\.notion\.com$/i.test(url.hostname)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function compactId(value) {
  const raw = String(value || "");
  const match = raw.match(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}|[0-9a-f]{32}/i);
  return (match ? match[0] : raw.replaceAll("-", "")).replaceAll("-", "").toLowerCase();
}

function apiId(value) {
  const compact = compactId(value);
  if (compact.length !== 32) return value;
  return compact.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function stripHtml(value = "") {
  return String(value)
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll(/&nbsp;/gi, " ")
    .replaceAll(/&amp;/gi, "&")
    .replaceAll(/&quot;/gi, '"')
    .replaceAll(/&#39;/gi, "'")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function slugifyHeading(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "secao";
}

function sha256(value) {
  return createHash("sha256").update(String(value || "")).digest("hex");
}

function snapshotComparable(value) {
  return JSON.stringify(value, (key, nested) => key === "generatedAt" ? undefined : nested);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeSplit(data) {
  const dir = path.resolve("public/data");
  fs.writeFileSync(path.join(dir, "tce-go-days.json"), JSON.stringify(data.days, null, 2) + "\n");
  fs.writeFileSync(path.join(dir, "tce-go-materials.json"), JSON.stringify(data.materials, null, 2) + "\n");
  fs.writeFileSync(path.join(dir, "tce-go-questions.json"), JSON.stringify(data.questions, null, 2) + "\n");
}
