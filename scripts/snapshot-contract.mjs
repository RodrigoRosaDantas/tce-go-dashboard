export const FORBIDDEN_PUBLIC_KEYS = new Set([
  "estudado","concluido","concluído","tempoReal","tempo real","tempo real (min)",
  "acertos","erros","respostas","resposta","confidence","confiança","questões feitas",
  "observações","observacoes","notionUrl","notionId","url"
]);

export function validateSnapshot(snapshot) {
  const errors = [];
  if (!snapshot || typeof snapshot !== "object") errors.push("snapshot ausente");
  if (snapshot.schemaVersion !== "1.0.0") errors.push("schemaVersion inválida");
  if (snapshot.source !== "notion") errors.push("source deve ser notion");
  if (!Array.isArray(snapshot.days)) errors.push("days deve ser array");
  if (snapshot.contentHash && !/^[a-f0-9]{64}$/.test(snapshot.contentHash)) errors.push("contentHash inválido");
  if (errors.length) return errors;

  const days = snapshot.days;
  if (days.length !== 100) errors.push(`esperado 100 dias; recebido ${days.length}`);
  const orders = days.map((d) => d.order);
  const expectedOrders = Array.from({ length: 100 }, (_, i) => i + 1);
  if (JSON.stringify(orders) !== JSON.stringify(expectedOrders)) errors.push("Ordem deve ser 1–100 sem lacuna/duplicação");

  const dxxs = new Set(days.map((d) => d.dxx));
  if (dxxs.size !== 100) errors.push("Dxx duplicado");
  for (const d of days) {
    const expected = `D${String(d.order).padStart(3, "0")}`;
    if (d.dxx !== expected) errors.push(`${d.dxx}: incompatível com Ordem ${d.order}`);
    if (d.protected && d.session) errors.push(`${d.dxx}: protegido não pode ter session`);
    if (!d.protected && !d.session) errors.push(`${d.dxx}: ativo sem session`);
    if (d.protected && d.readyForStudy) errors.push(`${d.dxx}: protegido não pode estar liberado`);
    if (!d.protected && (!d.slug || !d.questionSlug)) errors.push(`${d.dxx}: ativo sem slug público`);
  }

  const active = days.filter((d) => !d.protected);
  const protectedDays = days.filter((d) => d.protected);
  if (active.length !== 47) errors.push(`esperado 47 ativos; recebido ${active.length}`);
  if (protectedDays.length !== 53) errors.push(`esperado 53 protegidos; recebido ${protectedDays.length}`);

  const sessions = active.map((d) => d.session);
  for (let i = 1; i <= 47; i++) {
    const expected = `S${String(i).padStart(2, "0")}`;
    if (sessions[i - 1] !== expected) errors.push(`sessão ${i}: esperado ${expected}; recebido ${sessions[i - 1]}`);
  }
  if (new Set(sessions).size !== 47) errors.push("Sxx duplicado");

  const ready = days.filter((d) => d.readyForStudy && !d.protected);
  const readyMaterialSlugs = new Set(ready.map((d) => d.slug).filter(Boolean));
  const readyQuestionSlugs = new Set(ready.map((d) => d.questionSlug).filter(Boolean));
  const materials = snapshot.materials || {};
  const questions = snapshot.questions || {};

  for (const [slug, material] of Object.entries(materials)) {
    if (!readyMaterialSlugs.has(slug)) errors.push(`material ${slug}: publicado sem Dxx liberado`);
    const day = ready.find((d) => d.slug === slug);
    if (day && material?.dxx !== day.dxx) errors.push(`material ${slug}: dxx divergente`);
    validatePublicHtml(material?.contentHtml, `materials.${slug}.contentHtml`, errors);
  }

  for (const [slug, question] of Object.entries(questions)) {
    if (!readyQuestionSlugs.has(slug)) errors.push(`questões ${slug}: publicadas sem Dxx liberado`);
    const day = ready.find((d) => d.questionSlug === slug);
    if (day && question?.dxx !== day.dxx) errors.push(`questões ${slug}: dxx divergente`);
    if (question?.qxx && question.qxx.toLowerCase() !== slug) errors.push(`questões ${slug}: qxx divergente`);
    if (question?.copyrightMode !== "metadata-only") errors.push(`questões ${slug}: modo público deve ser metadata-only no sync automático`);
    if (question?.platformBattery) {
      if (!question.platformBattery.materia || !question.platformBattery.topico) {
        errors.push(`questões ${slug}: plataforma exige matéria + tópico validados`);
      }
      for (const value of Object.values(question.platformBattery)) {
        if (typeof value === "string" && /app\.notion\.com|notion\.so|collection:\/\//i.test(value)) {
          errors.push(`questões ${slug}: filtro da plataforma contém referência interna`);
        }
      }
    }
  }

  if (snapshot.contentMode === "full") {
    for (const d of ready) {
      if (!materials[d.slug]) errors.push(`${d.dxx}: material público ausente em modo full`);
      if (!questions[d.questionSlug]) errors.push(`${d.dxx}: caderno Qxx ausente em modo full`);
    }
  }

  if (snapshot.publicStats) {
    if (snapshot.publicStats.totalDays !== 100) errors.push("publicStats.totalDays inválido");
    if (snapshot.publicStats.activeDays !== 47) errors.push("publicStats.activeDays inválido");
    if (snapshot.publicStats.protectedDays !== 53) errors.push("publicStats.protectedDays inválido");
    if (snapshot.publicStats.sessions !== 47) errors.push("publicStats.sessions inválido");
    if (snapshot.publicStats.readyDays !== ready.length) errors.push("publicStats.readyDays inválido");
    if (
      typeof snapshot.publicStats.materialPages === "number"
      && snapshot.publicStats.materialPages !== Object.keys(materials).length
    ) errors.push("publicStats.materialPages inválido");
    if (
      typeof snapshot.publicStats.questionPages === "number"
      && snapshot.publicStats.questionPages !== Object.keys(questions).length
    ) errors.push("publicStats.questionPages inválido");
  }

  walk(snapshot, [], errors);
  return errors;
}

function validatePublicHtml(value, path, errors) {
  if (!value) return;
  if (typeof value !== "string") {
    errors.push(`${path}: HTML deve ser string`);
    return;
  }
  if (/<script\b|javascript:|\son[a-z]+\s*=/i.test(value)) {
    errors.push(`${path}: HTML público contém construção insegura`);
  }
  if (/app\.notion\.com|notion\.so|collection:\/\//i.test(value)) {
    errors.push(`${path}: HTML público contém referência interna do Notion`);
  }
}

function walk(value, path, errors) {
  if (Array.isArray(value)) return value.forEach((item, index) => walk(item, [...path, String(index)], errors));
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && /app\.notion\.com|notion\.so|collection:\/\//i.test(value)) {
      errors.push(`referência interna do Notion em ${path.join(".")}`);
    }
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_PUBLIC_KEYS.has(key)) errors.push(`chave privada proibida: ${[...path,key].join(".")}`);
    walk(child, [...path,key], errors);
  }
}
