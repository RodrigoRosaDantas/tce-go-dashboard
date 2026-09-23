import { createHash } from "node:crypto";

const PRIVATE_SECTION = /(?:navega[çc][ãa]o|controle\s+operacional|execu[çc][ãa]o\s+real|registro\s+de\s+execu[çc][ãa]o|folha\s+de\s+resposta|respostas\s+pessoais|tempo\s+real|desempenho\s+pessoal|hist[óo]rico\s+pessoal|hist[óo]rico\s+reaproveitado|o\s+que\s+j[áa]\s+existe\s+no\s+hist[óo]rico|baseline\s+pessoal)/i;
const PRIVATE_LINE = /(?:resposta\s+pessoal|tempo\s+real|acertos\/erros\s+reais|n[ãa]o\s+preencher\s+editorialmente|meus\s+dados)/i;
const NOTION_INTERNAL_URL = /https?:\/\/(?:www\.)?(?:app\.)?notion\.(?:so|com)\/[^\s)\]}]+/gi;
const NOTION_INTERNAL_REF = /collection:\/\/[-a-z0-9]+/gi;

export function sanitizePublicText(value) {
  return String(value ?? "")
    .replace(NOTION_INTERNAL_URL, "")
    .replace(NOTION_INTERNAL_REF, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function propertyText(properties, name) {
  const property = properties?.[name];
  if (!property) return "";
  const rich = property.title || property.rich_text;
  if (Array.isArray(rich)) return sanitizePublicText(rich.map((item) => item.plain_text || item.text?.content || "").join(""));
  if (property.select?.name) return sanitizePublicText(property.select.name);
  if (property.status?.name) return sanitizePublicText(property.status.name);
  if (property.formula?.type === "string") return sanitizePublicText(property.formula.string || "");
  return "";
}

export function propertyNumber(properties, name) {
  const property = properties?.[name];
  if (!property) return 0;
  if (typeof property.number === "number" && Number.isFinite(property.number)) return property.number;
  if (property.formula?.type === "number" && typeof property.formula.number === "number") return property.formula.number;
  return 0;
}

export function propertyCheckbox(properties, name) {
  return Boolean(properties?.[name]?.checkbox);
}

export function relationIds(property) {
  return Array.isArray(property?.relation)
    ? property.relation.map((item) => item?.id).filter(Boolean)
    : [];
}

export function materialSnapshotFromBlocks({ dxx, title, focus, version, lastEdited }, blocks) {
  const publicBlocks = filterPublicBlocks(blocks);
  const contentHtml = withStudyIndex(
    sanitizeMaterialHtml(renderBlocks(publicBlocks)),
    dxx.toLowerCase(),
  );
  const sections = extractTextSections(publicBlocks);
  const summary = sanitizePublicText(focus) || stripHtml(contentHtml).slice(0, 420);

  return {
    dxx,
    title: sanitizePublicText(title) || dxx,
    summary,
    contentHtml,
    sections,
    ...(version ? { version } : {}),
    ...(lastEdited ? { lastEdited } : {}),
    hash: sha256(contentHtml),
  };
}

export function questionSnapshotFromPage({ dxx, page, blocks = [] }) {
  const p = page?.properties || {};
  const qxx = propertyText(p, "Qxx") || `Q${dxx.slice(1)}`;
  const title = propertyText(p, "Questões do dia") || `Questões | ${dxx}`;
  const meta = propertyNumber(p, "Meta");
  const valid = propertyNumber(p, "Questões válidas");
  const priority = propertyText(p, "Origem prioritária");
  const focus = propertyText(p, "Matéria/foco");
  const sourceSummary = priority || focus || "Metadados editoriais do caderno canônico.";
  const adaptive = valid === 0 && meta > 0 && /adaptativ|reteste|equivalente/i.test(sourceSummary);
  const version = propertyNumber(p, "Versão editorial");
  const gapDeclared = propertyCheckbox(p, "Lacuna declarada");
  const platformValidated = propertyCheckbox(p, "Plataforma — bateria validada");
  const platformMateria = sanitizePublicText(propertyText(p, "Plataforma — matéria"));
  const platformTopico = sanitizePublicText(propertyText(p, "Plataforma — tópico"));
  const platformSubtopico = sanitizePublicText(propertyText(p, "Plataforma — subtópico"));
  const platformQuantity = propertyNumber(p, "Plataforma — quantidade validada");
  const platformBattery = platformValidated && platformMateria && platformTopico && meta > 0 && platformQuantity >= meta
    ? {
        materia: platformMateria,
        topico: platformTopico,
        ...(platformSubtopico ? { subtopico: platformSubtopico } : {}),
        size: meta,
      }
    : null;

  // O Qxx continua em modo metadata-only para questões de terceiros. O HTML abaixo
  // é derivado do próprio caderno canônico, que registra referências/metadados das
  // questões FCC e só reproduz integralmente itens autorais permitidos.
  const publicBlocks = Array.isArray(blocks) ? filterPublicBlocks(blocks) : [];
  const contentHtml = publicBlocks.length
    ? withStudyIndex(sanitizeMaterialHtml(renderBlocks(publicBlocks)), qxx.toLowerCase())
    : "";
  const sections = publicBlocks.length ? extractTextSections(publicBlocks) : [];

  return {
    qxx,
    dxx,
    title,
    meta,
    valid,
    sourceSummary,
    copyrightMode: "metadata-only",
    ...(version ? { version } : {}),
    ...(page?.last_edited_time ? { lastEdited: page.last_edited_time } : {}),
    ...(gapDeclared ? { gapDeclared: true } : {}),
    ...(adaptive ? { adaptive: true } : {}),
    ...(platformBattery ? { platformBattery } : {}),
    ...(contentHtml ? { contentHtml, sections, hash: sha256(contentHtml) } : {}),
  };
}

export function pageTitle(page, fallback = "") {
  const properties = page?.properties || {};
  for (const property of Object.values(properties)) {
    if (Array.isArray(property?.title)) {
      const value = richTextPlain(property.title);
      if (value) return sanitizePublicText(value);
    }
  }
  return sanitizePublicText(fallback);
}

export function stripHtml(value = "") {
  return String(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function renderBlocks(blocks) {
  let html = "";
  for (let index = 0; index < (blocks || []).length; index += 1) {
    const block = blocks[index];
    if (["bulleted_list_item", "numbered_list_item"].includes(block.type)) {
      const type = block.type;
      const tag = type === "bulleted_list_item" ? "ul" : "ol";
      const items = [];
      while (index < blocks.length && blocks[index].type === type) {
        const item = blocks[index];
        const data = item[type] || {};
        items.push(`<li>${richTextHtml(data.rich_text)}${renderBlocks(item.children || [])}</li>`);
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
  const type = block?.type;
  const data = block?.[type] || {};
  const text = richTextHtml(data.rich_text);
  const children = renderBlocks(block?.children || []);

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
    const rows = (block.children || [])
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
  if (type === "bookmark" || type === "link_preview" || type === "embed") {
    const url = safeExternalUrl(data.url);
    return url
      ? `<p><a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">Abrir referência externa ↗</a></p>`
      : children;
  }
  if (type === "image") {
    return children || '<div class="study-media-note">🖼️ Imagem disponível apenas na fonte canônica.</div>';
  }
  if (["synced_block", "column", "column_list"].includes(type)) return children;
  if (["child_page", "child_database", "file", "pdf", "video", "audio"].includes(type)) {
    return children || '<div class="study-media-note">Anexo ou conteúdo vinculado disponível apenas na fonte canônica.</div>';
  }
  if (type === "table_row") return "";
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

    const external = safeExternalUrl(item.href || item.text?.link?.url || "");
    if (external) value = `<a href="${escapeHtml(external)}" target="_blank" rel="noreferrer">${value}</a>`;
    return value;
  }).join("");
}

function sanitizeMaterialHtml(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+="[^"]*"/gi, "")
    .replace(/\son[a-z]+='[^']*'/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function filterPublicBlocks(blocks) {
  const output = [];
  let skipLevel = null;

  for (const original of blocks || []) {
    const block = { ...original };
    const level = headingLevel(block.type);
    const text = blockPlainText(block);

    if (level !== null) {
      if (skipLevel !== null) {
        if (level > skipLevel) continue;
        skipLevel = null;
      }
      if (PRIVATE_SECTION.test(text)) {
        skipLevel = level;
        continue;
      }
    } else if (skipLevel !== null) {
      continue;
    }

    if (PRIVATE_LINE.test(text)) continue;
    if (Array.isArray(block.children)) {
      block.children = filterPublicBlocks(block.children);
    }
    output.push(block);
  }

  return output;
}

function headingLevel(type) {
  if (type === "heading_1") return 1;
  if (type === "heading_2") return 2;
  if (type === "heading_3") return 3;
  return null;
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

function extractTextSections(blocks) {
  const flat = [];
  const visit = (list) => {
    for (const block of list || []) {
      flat.push(block);
      if (Array.isArray(block.children)) visit(block.children);
    }
  };
  visit(blocks);

  const sections = [];
  let current = { heading: "Visão geral", lines: [] };
  const flush = () => {
    const body = sanitizePublicText(current.lines.join("\n"));
    const heading = sanitizePublicText(current.heading);
    if (heading && body && !PRIVATE_SECTION.test(heading)) sections.push({ heading, body: body.slice(0, 18000) });
    current = { heading: "Continuação", lines: [] };
  };

  for (const block of flat) {
    const type = block?.type || "";
    const text = blockPlainText(block);
    if (!text) continue;
    if (/^heading_[123]$/.test(type)) {
      flush();
      current = { heading: text, lines: [] };
      continue;
    }
    if (PRIVATE_SECTION.test(current.heading) || PRIVATE_LINE.test(text)) continue;
    current.lines.push(["bulleted_list_item","numbered_list_item","to_do"].includes(type) ? `• ${text}` : text);
  }
  flush();
  return sections;
}

function blockPlainText(block) {
  const type = block?.type;
  const data = block?.[type] || {};
  if (type === "table_row") {
    return sanitizePublicText((data.cells || []).map((cell) => richTextPlain(cell)).join(" | "));
  }
  if (type === "equation") return sanitizePublicText(data.expression || "");
  return sanitizePublicText(richTextPlain(data.rich_text || data.caption || []));
}

function richTextPlain(items) {
  return (items || []).map((item) => item?.plain_text || item?.text?.content || "").join("");
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

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
