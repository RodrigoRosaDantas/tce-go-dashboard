import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.9.6";

const NAPI = "https://api.notion.com/v1";
const NVER = "2026-03-11";
const DAYS = "a1075521-857b-4e1e-8fb2-849b51fdccc0";
const REDACTIONS = "d837d3d6-7646-4f41-888a-ed8b48f94c9d";
const SIMULATIONS = "6deb1496-01ae-4a2d-8b38-5e99423410ee";
const EDITAL = "930ae7dd-c076-40ad-a723-b2b9118c3367";
const SOURCES = "926f6b7c-7886-4917-a2f8-76aa1d87d39f";
const FINAL_SPRINT = "bd489b71-876d-450b-81f3-a8944f837bda";
const ISSUER = "https://token.actions.githubusercontent.com";
const AUDIENCE = "tce-go-sync";
const REPOSITORY = "RodrigoRosaDantas/tce-go-dashboard";
const WORKFLOW = ".github/workflows/sync-notion.yml";
const JWKS = createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));
const PRIVATE_SECTION = /(?:navega[çc][ãa]o|controle\s+operacional|execu[çc][ãa]o\s+real|registro\s+de\s+execu[çc][ãa]o|folha\s+de\s+resposta|respostas\s+pessoais|tempo\s+real|desempenho\s+pessoal|hist[óo]rico\s+pessoal|hist[óo]rico\s+reaproveitado|o\s+que\s+j[áa]\s+existe\s+no\s+hist[óo]rico|baseline\s+pessoal)/i;
const PRIVATE_LINE = /(?:resposta\s+pessoal|tempo\s+real|acertos\/erros\s+reais|n[ãa]o\s+preencher\s+editorialmente|meus\s+dados)/i;

Deno.serve(async (req) => {
  if (req.method !== "GET") return json({ error: "Método não permitido." }, 405);
  try {
    await authenticateGithub(req);
    const token = await resolveNotionToken();
    if (!token) return json({ error: "Nenhuma credencial Notion server-side válida para o TCE-GO.", code: "NOTION_UNCONFIGURED" }, 503);

    const rows = await queryAllDays(token);
    const links = rows.map(normalizeDayRecord).sort((a, b) => a.day.order - b.day.order);
    const days = links.map((item) => item.day);
    assertDayContract(days);
    const ready = links.filter((item) => !item.day.protected && item.day.readyForStudy);

    if (new URL(req.url).searchParams.get("health") === "1") {
      const [redactionRows, simulationRows, editalRows, sourceRows, finalSprintRows] = await Promise.all([
        queryAllDataSource(REDACTIONS, token),
        queryAllDataSource(SIMULATIONS, token),
        queryAllDataSource(EDITAL, token),
        queryAllDataSource(SOURCES, token),
        queryAllDataSource(FINAL_SPRINT, token),
      ]);
      const legislation = sourceRows.map(normalizeLegislationSource)
        .filter((item) => item && ["Constituição", "Lei estadual", "Ato TCE-GO"].includes(item.category));
      return json({
        ok: true,
        notionConfigured: true,
        contentMode: "full",
        auxiliaryMode: "full",
        totalDays: days.length,
        activeDays: days.filter((d) => !d.protected).length,
        protectedDays: days.filter((d) => d.protected).length,
        readyDays: ready.length,
        sessions: new Set(days.map((d) => d.session).filter(Boolean)).size,
        redactionPlans: redactionRows.length,
        simulationPlans: simulationRows.length,
        editalItems: editalRows.length,
        legislationSources: legislation.length,
        finalSprintDays: finalSprintRows.length,
      });
    }

    const pairs = await mapLimit(ready, 3, async (item) => {
      if (!item.materialPageId) throw new Error(`${item.day.dxx}: Material canônico ausente.`);
      if (!item.questionPageId) throw new Error(`${item.day.dxx}: Questões canônicas ausentes.`);

      const [materialPage, questionPage] = await Promise.all([
        notion(`/pages/${item.materialPageId}`, token),
        notion(`/pages/${item.questionPageId}`, token),
      ]);
      assertLinkedDxx(item.day.dxx, materialPage, "material");
      assertLinkedDxx(item.day.dxx, questionPage, "questões");

      const blocks = await getBlockTree(item.materialPageId, token);
      const material = materialSnapshotFromBlocks({
        dxx: item.day.dxx,
        title: pageTitle(materialPage, item.day.focus),
        focus: propertyText(materialPage.properties, "Foco") || item.day.focus,
        version: numberProperty(materialPage.properties, "Versão editorial"),
        lastEdited: materialPage.last_edited_time,
      }, blocks);

      if (stripHtml(material.contentHtml || "").length < 250) {
        throw new Error(`${item.day.dxx}: Material público insuficiente após sanitização.`);
      }

      const question = questionSnapshotFromPage(item.day.dxx, questionPage);
      return { materialSlug: item.day.slug, questionSlug: item.day.questionSlug, material, question };
    });

    const [redactionRows, simulationRows, editalRows, sourceRows, finalSprintRows] = await Promise.all([
      queryAllDataSource(REDACTIONS, token),
      queryAllDataSource(SIMULATIONS, token),
      queryAllDataSource(EDITAL, token),
      queryAllDataSource(SOURCES, token),
      queryAllDataSource(FINAL_SPRINT, token),
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
    const contentHash = await sha256(JSON.stringify(stable(stablePayload)));
    return json({ ...stablePayload, generatedAt: new Date().toISOString(), contentHash });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("tce-public-snapshot", detail);
    if (/Notion 404: Could not find data_source/i.test(detail)) {
      return json({
        error: "Integração Notion sem acesso ao banco canônico TCE-GO.",
        code: "NOTION_ACCESS_REQUIRED",
      }, 503);
    }
    return json({ error: "Falha segura no snapshot público TCE-GO.", detail }, 502);
  }
});

async function resolveNotionToken() {
  const candidates = [...new Set([
    (Deno.env.get("TCE_GO_NOTION_TOKEN") || "").trim(),
    (Deno.env.get("SEEDF") || "").trim(),
  ].filter(Boolean))];
  for (const token of candidates) {
    try {
      await notion(`/data_sources/${DAYS}/query`, token, { method: "POST", body: JSON.stringify({ page_size: 1 }) });
      return token;
    } catch (error) {
      console.warn("Credencial Notion server-side recusada; tentando alternativa configurada.", error instanceof Error ? error.message.replace(/:.*/, "") : "erro");
    }
  }
  return "";
}

async function authenticateGithub(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new Error("OIDC ausente.");
  const { payload } = await jwtVerify(token, JWKS, { issuer: ISSUER, audience: AUDIENCE });
  const repository = String(payload.repository || "");
  const ref = String(payload.ref || "");
  const workflowRef = String(payload.workflow_ref || "");
  if (repository !== REPOSITORY) throw new Error("Repositório OIDC não autorizado.");
  if (ref !== "refs/heads/main") throw new Error("Ref OIDC não autorizada.");
  if (!workflowRef.startsWith(`${REPOSITORY}/${WORKFLOW}@refs/heads/main`)) throw new Error("Workflow OIDC não autorizado.");
}

async function queryAllDays(token: string) {
  return queryAllDataSource(DAYS, token);
}

async function queryAllDataSource(id: string, token: string) {
  const pages: any[] = [];
  let cursor: string | undefined;
  do {
    const body: Record<string, unknown> = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const result = await notion(`/data_sources/${id}/query`, token, { method: "POST", body: JSON.stringify(body) });
    pages.push(...(result.results || []));
    cursor = result.has_more ? result.next_cursor : undefined;
  } while (cursor);
  return pages.filter((page) => !page.archived);
}

function normalizeRedactionPlan(page: any) {
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

function normalizeSimulationPlan(page: any) {
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

function normalizeEditalItem(page: any) {
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

function normalizeLegislationSource(page: any) {
  const p = page.properties || {};
  const official = checkboxProperty(p, "Fonte oficial");
  const nature = propertyText(p, "Natureza");
  const officialUrl = safeExternalUrl(p?.["URL oficial"]?.url || "");
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

function normalizeFinalSprintDay(page: any) {
  const p = page.properties || {};
  return {
    code: propertyText(p, "Código"),
    order: numberProperty(p, "Ordem"),
    date: dateProperty(p, "Data"),
    title: propertyText(p, "Dia da reta final"),
    type: propertyText(p, "Tipo"),
  };
}

function normalizeDayRecord(page: any) {
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

function assertDayContract(days: any[]) {
  if (days.length !== 100) throw new Error(`Esperado 100 Dxx; recebido ${days.length}.`);
  const active = days.filter((d) => !d.protected);
  const protectedDays = days.filter((d) => d.protected);
  if (active.length !== 47 || protectedDays.length !== 53) throw new Error("Contrato 47 ativos / 53 protegidos violado.");
  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    const expectedD = `D${String(i + 1).padStart(3, "0")}`;
    if (d.order !== i + 1 || d.dxx !== expectedD) throw new Error(`${d.dxx}: Ordem/Dxx divergente.`);
    if (d.protected && d.session) throw new Error(`${d.dxx}: protegido com Sxx.`);
  }
  for (let i = 0; i < active.length; i++) {
    const expectedS = `S${String(i + 1).padStart(2, "0")}`;
    if (active[i].session !== expectedS) throw new Error(`${active[i].dxx}: esperado ${expectedS}; recebido ${active[i].session || "∅"}.`);
  }
}

async function getBlockTree(blockId: string, token: string, depth = 0): Promise<any[]> {
  if (depth > 5) return [];
  const blocks: any[] = [];
  let cursor: string | undefined;
  do {
    const query = new URLSearchParams({ page_size: "100" });
    if (cursor) query.set("start_cursor", cursor);
    const result = await notion(`/blocks/${blockId}/children?${query}`, token);
    for (const block of result.results || []) {
      const item = { ...block };
      if (block.has_children && !["child_page", "child_database"].includes(block.type)) {
        item.children = await getBlockTree(block.id, token, depth + 1);
      }
      blocks.push(item);
    }
    cursor = result.has_more ? result.next_cursor : undefined;
  } while (cursor);
  return blocks;
}

function materialSnapshotFromBlocks(meta: any, blocks: any[]) {
  const publicBlocks = filterPublicBlocks(blocks);
  const contentHtml = withStudyIndex(sanitizeMaterialHtml(renderBlocks(publicBlocks)), meta.dxx.toLowerCase());
  const sections = extractTextSections(publicBlocks);
  return {
    dxx: meta.dxx,
    title: sanitizePublicText(meta.title) || meta.dxx,
    summary: sanitizePublicText(meta.focus) || stripHtml(contentHtml).slice(0, 420),
    contentHtml,
    sections,
    ...(meta.version ? { version: meta.version } : {}),
    ...(meta.lastEdited ? { lastEdited: meta.lastEdited } : {}),
  };
}

function questionSnapshotFromPage(dxx: string, page: any) {
  const p = page?.properties || {};
  const qxx = propertyText(p, "Qxx") || `Q${dxx.slice(1)}`;
  const title = propertyText(p, "Questões do dia") || `Questões | ${dxx}`;
  const meta = numberProperty(p, "Meta");
  const valid = numberProperty(p, "Questões válidas");
  const priority = propertyText(p, "Origem prioritária");
  const focus = propertyText(p, "Matéria/foco");
  const sourceSummary = priority || focus || "Metadados editoriais do caderno canônico.";
  const adaptive = valid === 0 && meta > 0 && /adaptativ|reteste|equivalente/i.test(sourceSummary);
  const version = numberProperty(p, "Versão editorial");
  const gapDeclared = checkboxProperty(p, "Lacuna declarada");
  const platformValidated = checkboxProperty(p, "Plataforma — bateria validada");
  const platformMateria = sanitizePublicText(propertyText(p, "Plataforma — matéria"));
  const platformTopico = sanitizePublicText(propertyText(p, "Plataforma — tópico"));
  const platformSubtopico = sanitizePublicText(propertyText(p, "Plataforma — subtópico"));
  const platformQuantity = numberProperty(p, "Plataforma — quantidade validada");
  const platformBattery = platformValidated && platformMateria && platformTopico && meta > 0 && platformQuantity >= meta
    ? { materia: platformMateria, topico: platformTopico, ...(platformSubtopico ? { subtopico: platformSubtopico } : {}), size: meta }
    : null;
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
  };
}

function filterPublicBlocks(blocks: any[]) {
  const out: any[] = [];
  let skipLevel: number | null = null;
  for (const original of blocks || []) {
    const block = { ...original };
    const level = headingLevel(block.type);
    const text = blockPlainText(block);
    if (level !== null) {
      if (skipLevel !== null) {
        if (level > skipLevel) continue;
        skipLevel = null;
      }
      if (PRIVATE_SECTION.test(text)) { skipLevel = level; continue; }
    } else if (skipLevel !== null) continue;
    if (PRIVATE_LINE.test(text)) continue;
    if (Array.isArray(block.children)) block.children = filterPublicBlocks(block.children);
    out.push(block);
  }
  return out;
}

function renderBlocks(blocks: any[]) {
  let html = "";
  for (let index = 0; index < (blocks || []).length; index++) {
    const block = blocks[index];
    if (["bulleted_list_item", "numbered_list_item"].includes(block.type)) {
      const type = block.type;
      const tag = type === "bulleted_list_item" ? "ul" : "ol";
      const items: string[] = [];
      while (index < blocks.length && blocks[index].type === type) {
        const item = blocks[index], data = item[type] || {};
        items.push(`<li>${richTextHtml(data.rich_text)}${renderBlocks(item.children || [])}</li>`);
        index++;
      }
      index--;
      html += `<${tag}>${items.join("")}</${tag}>`;
      continue;
    }
    html += renderBlock(block);
  }
  return html;
}

function renderBlock(block: any) {
  const type = block?.type, data = block?.[type] || {};
  const text = richTextHtml(data.rich_text), children = renderBlocks(block?.children || []);
  if (type === "paragraph") return text ? `<p>${text}</p>${children}` : children;
  if (type === "heading_1" || type === "heading_2") return `<h2>${text}</h2>${children}`;
  if (type === "heading_3") return `<h3>${text}</h3>${children}`;
  if (type === "quote") return `<blockquote>${text}${children}</blockquote>`;
  if (type === "callout") return `<aside class="study-callout">${data.icon?.type === "emoji" ? escapeHtml(data.icon.emoji) + " " : ""}${text}${children}</aside>`;
  if (type === "divider") return "<hr>";
  if (type === "toggle") return `<details class="study-toggle"><summary>${text || "Ver conteúdo"}</summary>${children}</details>`;
  if (type === "to_do") return `<div class="study-todo"><span>${data.checked ? "☑" : "☐"}</span><span>${text}</span></div>${children}`;
  if (type === "code") return `<pre><code>${escapeHtml((data.rich_text || []).map((x: any) => x.plain_text || "").join(""))}</code></pre>${children}`;
  if (type === "equation") return `<div class="study-equation">${escapeHtml(data.expression || "")}</div>${children}`;
  if (type === "table") {
    const rows = (block.children || []).filter((x: any) => x.type === "table_row").map((row: any, rowIndex: number) => {
      const cells = (row.table_row?.cells || []).map((cell: any) => {
        const tag = rowIndex === 0 && data.has_column_header ? "th" : "td";
        return `<${tag}>${richTextHtml(cell)}</${tag}>`;
      }).join("");
      return `<tr>${cells}</tr>`;
    }).join("");
    return `<div class="study-table-wrap"><table>${rows}</table></div>`;
  }
  if (["bookmark", "link_preview", "embed"].includes(type)) {
    const url = safeExternalUrl(data.url);
    return url ? `<p><a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">Abrir referência externa ↗</a></p>` : children;
  }
  if (type === "image") return children || '<div class="study-media-note">🖼️ Imagem disponível apenas na fonte canônica.</div>';
  if (["synced_block", "column", "column_list"].includes(type)) return children;
  if (["child_page", "child_database", "file", "pdf", "video", "audio"].includes(type)) return children || '<div class="study-media-note">Anexo ou conteúdo vinculado disponível apenas na fonte canônica.</div>';
  if (type === "table_row") return "";
  return children || (text ? `<p>${text}</p>` : "");
}

function richTextHtml(items: any[] = []) {
  return (items || []).map((item: any) => {
    let value = item.type === "equation" ? escapeHtml(item.equation?.expression || "") : escapeHtml(item.plain_text || item.text?.content || "");
    const a = item.annotations || {};
    if (a.code) value = `<code>${value}</code>`;
    if (a.bold) value = `<strong>${value}</strong>`;
    if (a.italic) value = `<em>${value}</em>`;
    if (a.underline) value = `<u>${value}</u>`;
    if (a.strikethrough) value = `<s>${value}</s>`;
    const external = safeExternalUrl(item.href || item.text?.link?.url || "");
    if (external) value = `<a href="${escapeHtml(external)}" target="_blank" rel="noreferrer">${value}</a>`;
    return value;
  }).join("");
}

function withStudyIndex(html: string, code: string) {
  const headings: Array<{ id: string; label: string; level: number }> = [];
  let counter = 0;
  const anchored = String(html || "").replace(/<h([23])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (heading, level, inner) => {
    const label = stripHtml(inner);
    if (!label) return heading;
    counter++;
    const id = `${String(code).toLowerCase()}-${slugifyHeading(label)}-${counter}`;
    headings.push({ id, label, level: Number(level) });
    return `<h${level} id="${id}">${inner}</h${level}>`;
  });
  if (!headings.length) return anchored;
  const index = `<details class="study-toggle study-index"><summary>🧭 Índice da aula</summary><nav class="study-index-nav" aria-label="Seções da aula"><ol>${headings.map((h) => `<li class="study-index-level-${h.level}"><a href="#${h.id}">${escapeHtml(h.label)}</a></li>`).join("")}</ol></nav></details>`;
  return index + anchored;
}

function extractTextSections(blocks: any[]) {
  const flat: any[] = [];
  const visit = (list: any[]) => { for (const block of list || []) { flat.push(block); if (Array.isArray(block.children)) visit(block.children); } };
  visit(blocks);
  const sections: Array<{ heading: string; body: string }> = [];
  let current = { heading: "Visão geral", lines: [] as string[] };
  const flush = () => {
    const body = sanitizePublicText(current.lines.join("\n")), heading = sanitizePublicText(current.heading);
    if (heading && body && !PRIVATE_SECTION.test(heading)) sections.push({ heading, body: body.slice(0, 18000) });
    current = { heading: "Continuação", lines: [] };
  };
  for (const block of flat) {
    const type = block?.type || "", text = blockPlainText(block);
    if (!text) continue;
    if (/^heading_[123]$/.test(type)) { flush(); current = { heading: text, lines: [] }; continue; }
    if (PRIVATE_SECTION.test(current.heading) || PRIVATE_LINE.test(text)) continue;
    current.lines.push(["bulleted_list_item", "numbered_list_item", "to_do"].includes(type) ? `• ${text}` : text);
  }
  flush();
  return sections;
}

function sanitizePublicText(value: unknown) {
  return String(value ?? "")
    .replace(/https?:\/\/(?:www\.)?(?:app\.)?notion\.(?:so|com)\/[^\s)\]}]+/gi, "")
    .replace(/collection:\/\/[-a-z0-9]+/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
function sanitizeMaterialHtml(value: string) { return String(value || "").replace(/<script[\s\S]*?<\/script>/gi, "").replace(/\son[a-z]+="[^"]*"/gi, "").replace(/\son[a-z]+='[^']*'/gi, "").replace(/\s{2,}/g, " ").trim(); }
function stripHtml(value = "") { return String(value).replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/\s+/g, " ").trim(); }
function blockPlainText(block: any) { const type = block?.type, data = block?.[type] || {}; if (type === "table_row") return sanitizePublicText((data.cells || []).map((cell: any) => richTextPlain(cell)).join(" | ")); if (type === "equation") return sanitizePublicText(data.expression || ""); return sanitizePublicText(richTextPlain(data.rich_text || data.caption || [])); }
function richTextPlain(items: any[] = []) { return (items || []).map((item: any) => item?.plain_text || item?.text?.content || "").join(""); }
function safeExternalUrl(value: unknown) { const raw = String(value || "").trim(); if (!/^https?:\/\//i.test(raw)) return ""; try { const url = new URL(raw); if (/^(?:www\.)?notion\.so$/i.test(url.hostname) || /^app\.notion\.com$/i.test(url.hostname)) return ""; return url.toString(); } catch { return ""; } }
function escapeHtml(value: unknown = "") { return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
function slugifyHeading(value: string) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "secao"; }
function pageTitle(page: any, fallback = "") { for (const property of Object.values(page?.properties || {}) as any[]) { if (Array.isArray(property?.title)) { const v = richTextPlain(property.title); if (v) return sanitizePublicText(v); } } return sanitizePublicText(fallback); }
function propertyText(properties: any, name: string) { const p = properties?.[name]; if (!p) return ""; const rich = p.title || p.rich_text; if (Array.isArray(rich)) return sanitizePublicText(rich.map((x: any) => x.plain_text || x.text?.content || "").join("")); if (p.select?.name) return sanitizePublicText(p.select.name); if (p.status?.name) return sanitizePublicText(p.status.name); if (p.formula?.type === "string") return sanitizePublicText(p.formula.string || ""); return ""; }
function titleProperty(properties: any, name: string) { return (properties?.[name]?.title || []).map((x: any) => x.plain_text || x.text?.content || "").join("").trim(); }
function richProperty(properties: any, name: string) { return (properties?.[name]?.rich_text || []).map((x: any) => x.plain_text || x.text?.content || "").join("").trim(); }
function selectProperty(properties: any, name: string) { return properties?.[name]?.select?.name || properties?.[name]?.status?.name || ""; }
function numberProperty(properties: any, name: string) { const v = properties?.[name]?.number; return typeof v === "number" && Number.isFinite(v) ? v : 0; }
function checkboxProperty(properties: any, name: string) { return Boolean(properties?.[name]?.checkbox); }
function dateProperty(properties: any, name: string) { return properties?.[name]?.date?.start?.slice(0, 10) || ""; }
function relationIds(property: any) { return Array.isArray(property?.relation) ? property.relation.map((x: any) => x?.id).filter(Boolean) : []; }
function assertLinkedDxx(expected: string, page: any, kind: string) { const actual = propertyText(page.properties, "Dxx"); if (actual && actual !== expected) throw new Error(`${expected}: ${kind} vinculado declara ${actual}.`); }

async function notion(path: string, token: string, init: RequestInit = {}, attempt = 1): Promise<any> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Notion-Version", NVER);
  headers.set("Content-Type", "application/json");
  const response = await fetch(NAPI + path, { ...init, headers });
  if ((response.status === 429 || response.status >= 500) && attempt < 5) {
    const retryAfter = Number(response.headers.get("retry-after") || 0);
    await sleep(Math.max(retryAfter * 1000, 500 * 2 ** (attempt - 1)));
    return notion(path, token, init, attempt + 1);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Notion ${response.status}: ${data?.message || "erro"}`);
  return data;
}

async function mapLimit<T, R>(items: T[], limit: number, mapper: (item: T, index: number) => Promise<R>) {
  const output = new Array<R>(items.length);
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
function stable(value: any): any { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === "object") { const out: Record<string, any> = {}; for (const key of Object.keys(value).sort()) out[key] = stable(value[key]); return out; } return value; }
async function sha256(value: string) { const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join(""); }
function headingLevel(type: string) { if (type === "heading_1") return 1; if (type === "heading_2") return 2; if (type === "heading_3") return 3; return null; }
function sleep(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function json(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } }); }
