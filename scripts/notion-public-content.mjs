const PRIVATE_SECTION = /(?:navega[çc][ãa]o|controle operacional|execução real|registro de execução|folha de resposta|respostas pessoais|tempo real|desempenho pessoal|caderno de erros pessoal|hist[óo]rico pessoal|hist[óo]rico reaproveitado|baseline pessoal)/i;
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

export function blockText(block) {
  if (!block || typeof block !== "object") return "";
  const type = block.type;
  const data = block[type] || {};
  if (type === "table_row") {
    return sanitizePublicText((data.cells || []).map((cell) => richText(cell)).join(" | "));
  }
  if (type === "equation") return sanitizePublicText(data.expression || "");
  if (type === "child_page") return sanitizePublicText(data.title || "");
  if (type === "bookmark" || type === "embed" || type === "link_preview") {
    const url = sanitizePublicText(data.url || "");
    return /^https?:\/\//i.test(url) ? url : "";
  }
  const text = richText(data.rich_text || data.caption || []);
  return sanitizePublicText(text);
}

export function materialSnapshotFromBlocks({ dxx, title, focus, version, lastEdited }, blocks) {
  const flat = flatten(blocks);
  const sections = [];
  let current = { heading: "Visão geral", lines: [] };
  let privateLevel = 0;

  const flush = () => {
    const body = sanitizePublicText(current.lines.join("\n"));
    const heading = sanitizePublicText(current.heading);
    if (heading && body && !PRIVATE_SECTION.test(heading)) {
      sections.push({ heading, body });
    }
    current = { heading: "Continuação", lines: [] };
  };

  for (const block of flat) {
    const type = block.type || "";
    const text = blockText(block);
    if (!text) continue;

    const headingMatch = type.match(/^heading_([123])$/);
    if (headingMatch) {
      const level = Number(headingMatch[1]);

      if (privateLevel && level <= privateLevel) privateLevel = 0;
      if (privateLevel) continue;

      flush();
      if (PRIVATE_SECTION.test(text)) {
        privateLevel = level;
        current = { heading: text, lines: [] };
        continue;
      }

      current = { heading: text, lines: [] };
      continue;
    }

    if (privateLevel || PRIVATE_SECTION.test(current.heading)) continue;
    if (type === "bulleted_list_item") current.lines.push(`• ${text}`);
    else if (type === "numbered_list_item") current.lines.push(`• ${text}`);
    else if (type === "to_do") current.lines.push(`• ${text}`);
    else if (type === "quote") current.lines.push(`“${text}”`);
    else current.lines.push(text);
  }
  flush();

  const safeSections = sections.filter((section) => section.body.length > 0);
  const firstBody = safeSections[0]?.body || sanitizePublicText(focus);
  const summary = sanitizePublicText(focus) || firstBody.slice(0, 420);

  return {
    dxx,
    title: sanitizePublicText(title) || dxx,
    summary,
    sections: safeSections,
    ...(version ? { version } : {}),
    ...(lastEdited ? { lastEdited } : {}),
  };
}

export function questionSnapshotFromPage({ dxx, page }) {
  const p = page?.properties || {};
  const qxx = propertyText(p, "Qxx") || `Q${dxx.slice(1)}`;
  const title = propertyText(p, "Questões do dia") || `Questões | ${dxx}`;
  const meta = propertyNumber(p, "Meta");
  const valid = propertyNumber(p, "Questões válidas");
  const priority = propertyText(p, "Origem prioritária");
  const focus = propertyText(p, "Matéria/foco");
  const sourceSummary = priority || focus || "Metadados editoriais do caderno canônico.";
  const version = propertyNumber(p, "Versão editorial");
  const gapDeclared = propertyCheckbox(p, "Lacuna declarada");

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
  };
}

export function pageTitle(page, fallback = "") {
  const properties = page?.properties || {};
  for (const property of Object.values(properties)) {
    if (Array.isArray(property?.title)) {
      const value = richText(property.title);
      if (value) return sanitizePublicText(value);
    }
  }
  return sanitizePublicText(fallback);
}

function richText(items) {
  return (items || []).map((item) => item?.plain_text || item?.text?.content || "").join("");
}

function flatten(blocks) {
  const out = [];
  const visit = (list) => {
    for (const block of list || []) {
      out.push(block);
      if (Array.isArray(block.children)) visit(block.children);
    }
  };
  visit(blocks);
  return out;
}
