import { useEffect, useMemo, useState } from "react";
import { loadSnapshot, publicRoute } from "./data";
import type { DaySnapshot, Snapshot } from "./types";
import { ProgressPanel } from "./ProgressPanel";
import { ErrorWriteback, EssayWriteback, ReviewWriteback, SimulationWriteback } from "./ExecutionForms";
import { platformBatteryUrl } from "./progress";

const navItems = [
  ["/", "Hoje"],
  ["/dias/", "Dias"],
  ["/revisoes/", "Revisões"],
  ["/redacoes/", "Redações"],
  ["/erros/", "Erros"],
  ["/simulados/", "Simulados"],
  ["/desempenho/", "Desempenho"],
  ["/edital/", "Edital"],
  ["/legislacao/", "Legislação"],
  ["/reta-final/", "Reta final"],
  ["/sync/", "Sync"],
] as const;

function href(path: string) {
  return `${import.meta.env.BASE_URL.replace(/\/$/, "")}${path}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(
    new Date(`${value}T12:00:00`),
  );
}

function currentDateInBrasilia() {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function hasPublicSession(snapshot: Snapshot, day: DaySnapshot) {
  if (day.protected || !day.readyForStudy || !day.slug || !day.questionSlug) return false;
  return Boolean(snapshot.materials[day.slug] && snapshot.questions[day.questionSlug]);
}

function DayLabel({ day }: { day: DaySnapshot }) {
  return (
    <span className="day-label">
      <strong>{day.dxx}</strong>
      {!day.protected && day.session ? <span className="session">· {day.session}</span> : null}
    </span>
  );
}

function SessionNavigation({
  snapshot,
  day,
}: {
  snapshot: Snapshot;
  day: DaySnapshot;
}) {
  const activeDays = [...snapshot.days]
    .filter((item) => !item.protected)
    .sort((a, b) => a.order - b.order);
  const index = activeDays.findIndex((item) => item.dxx === day.dxx);
  const previous = index > 0 ? activeDays[index - 1] : undefined;
  const next = index >= 0 ? activeDays[index + 1] : undefined;

  const renderNeighbor = (neighbor: DaySnapshot | undefined, direction: "Anterior" | "Próxima") => {
    if (!neighbor) return <span className="session-nav-placeholder">{direction}: —</span>;
    if (hasPublicSession(snapshot, neighbor)) {
      return (
        <a className="secondary session-nav-link" href={href(`/dia/${neighbor.dxx.toLowerCase()}/`)}>
          {direction}: <DayLabel day={neighbor} />
        </a>
      );
    }
    return (
      <span className="session-nav-placeholder">
        {direction}: <DayLabel day={neighbor} /> · aguardando sync
      </span>
    );
  };

  return (
    <nav className="session-nav" aria-label="Navegação entre sessões TCE">
      <a className="secondary session-nav-link" href={href("/dias/")}>← Voltar ao calendário</a>
      {renderNeighbor(previous, "Anterior")}
      {renderNeighbor(next, "Próxima")}
    </nav>
  );
}

function Shell({ children, syncTime }: { children: React.ReactNode; syncTime?: string }) {
  return (
    <>
      <header className="topbar">
        <a className="brand" href={href("/")}>TCE-GO</a>
        <span className="source-pill">Notion canônico → snapshot</span>
      </header>
      <div className="layout">
        <aside className="sidebar" aria-label="Navegação principal">
          {navItems.map(([path, label]) => <a key={path} href={href(path)}>{label}</a>)}
        </aside>
        <main>{children}</main>
      </div>
      <footer>
        <span>Snapshot público sanitizado.</span>
        {syncTime ? <span> Gerado em {new Date(syncTime).toLocaleString("pt-BR")}.</span> : null}
      </footer>
    </>
  );
}

function Home({ snapshot }: { snapshot: Snapshot }) {
  const today = currentDateInBrasilia();
  const ordered = [...snapshot.days].sort((a, b) => a.order - b.order);
  const next = ordered.find((d) => hasPublicSession(snapshot, d) && d.date >= today)
    ?? ordered.find((d) => hasPublicSession(snapshot, d));

  return (
    <section>
      <div className="hero">
        <p className="eyebrow">Projeto 100 Dias · Técnico de Controle Externo</p>
        <h1>Hoje / próximo passo</h1>
        <p>O calendário é governado por <strong>Dxx + Ordem</strong>. Sxx apenas identifica a sequência pedagógica dos dias ativos.</p>
      </div>
      <div className="stats">
        <article><strong>{snapshot.publicStats.totalDays}</strong><span>Dias no calendário</span></article>
        <article><strong>{snapshot.publicStats.sessions}</strong><span>Sessões TCE</span></article>
        <article><strong>{snapshot.publicStats.protectedDays}</strong><span>Dias protegidos</span></article>
        <article><strong>{snapshot.publicStats.readyDays}</strong><span>Prontos no Notion</span></article>
      </div>
      {next ? (
        <article className="session-card">
          <div>
            <DayLabel day={next} />
            <h2>{next.focus}</h2>
            <p>{formatDate(next.date)} · {next.type}</p>
          </div>
          <a className="primary" href={href(`/dia/${next.dxx.toLowerCase()}/`)}>Abrir sessão</a>
        </article>
      ) : <p>Nenhuma sessão liberada no snapshot atual.</p>}
    </section>
  );
}

function Days({ snapshot }: { snapshot: Snapshot }) {
  const days = [...snapshot.days].sort((a, b) => a.order - b.order);
  return (
    <section>
      <div className="page-head"><p className="eyebrow">Calendário canônico</p><h1>D001–D100</h1></div>
      <div className="day-grid">
        {days.map((day) => (
          <article key={day.dxx} className={`day-card ${day.protected ? "protected" : ""}`}>
            <DayLabel day={day} />
            <time>{formatDate(day.date)}</time>
            <p>{day.focus}</p>
            {day.protected ? (
              <span className="badge muted">Protegido · sem Sxx</span>
            ) : hasPublicSession(snapshot, day) ? (
              <a className="secondary" href={href(`/dia/${day.dxx.toLowerCase()}/`)}>Abrir</a>
            ) : day.readyForStudy ? (
              <span className="badge ready">Pronto · aguardando sync</span>
            ) : (
              <span className="badge">Em preparação</span>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function DayPage({ snapshot, dxx }: { snapshot: Snapshot; dxx: string }) {
  const days = [...snapshot.days].sort((a, b) => a.order - b.order);
  const day = days.find((item) => item.dxx.toLowerCase() === dxx.toLowerCase());
  if (!day) return <NotFound />;

  if (day.protected) {
    return (
      <section>
        <div className="page-head"><DayLabel day={day} /><h1>Dia protegido</h1></div>
        <p>{formatDate(day.date)}</p>
        <div className="notice">Este dia aparece no calendário, mas não recebe sessão Sxx e não cria dívida pedagógica.</div>
        <a className="secondary" href={href("/dias/")}>← Voltar ao calendário</a>
      </section>
    );
  }

  if (!day.readyForStudy) return <NotFound />;

  const material = snapshot.materials[day.slug ?? ""];
  const question = snapshot.questions[day.questionSlug ?? ""];
  if (!material || !question) {
    return (
      <section>
        <div className="page-head">
          <DayLabel day={day} />
          <h1>{day.focus}</h1>
          <p>{formatDate(day.date)} · {day.type}</p>
        </div>
        <div className="notice">
          Esta sessão está pronta no Notion, mas o Material + Qxx ainda não chegaram ao snapshot público sanitizado.
          O site não a trata como sessão publicada até o próximo sync completo.
        </div>
        <SessionNavigation snapshot={snapshot} day={day} />
      </section>
    );
  }

  return (
    <section>
      <div className="page-head">
        <DayLabel day={day} />
        <h1>{day.focus}</h1>
        <p>{formatDate(day.date)} · {day.type} · versão editorial {day.version ?? "—"}</p>
      </div>
      <div className="status-row">
        <span className={day.readyForStudy ? "badge ready" : "badge"}>{day.readyForStudy ? "Pronto para estudo" : "Em preparação"}</span>
        <span className="badge muted">Ordem {day.order}</span>
      </div>
      <div className="content-grid">
        <article className="panel">
          <h2>Material</h2>
          {material ? (
            <>
              <p>{material.summary}</p>
              {material.contentHtml ? (
                <div className="study-content" dangerouslySetInnerHTML={{ __html: material.contentHtml }} />
              ) : material.sections?.map((section) => (
                <section key={section.heading} className="material-section">
                  <h3>{section.heading}</h3>
                  <p>{section.body}</p>
                </section>
              ))}
            </>
          ) : (
            <p>Metadados editoriais liberados. O conteúdo integral entra somente pelo sincronizador server-side após sanitização.</p>
          )}
        </article>
        <article className="panel">
          <h2>Questões</h2>
          {question ? (
            <>
              {question.adaptive ? (
                <p><strong>Adaptativo</strong> · meta {question.meta} equivalentes/retestes definidos pela execução real.</p>
              ) : (
                <p><strong>{question.valid}</strong> itens válidos · meta {question.meta}.</p>
              )}
              <p>{question.sourceSummary}</p>
              <p className="small">Questões de terceiros permanecem em modo metadados + referência; não há republicação massiva.</p>
            </>
          ) : <p>Qxx vinculado ao dia; detalhes serão publicados pelo snapshot sanitizado.</p>}
          {day.questionSlug ? <a className="secondary" href={href(`/questoes/${day.questionSlug}/`)}>Abrir Qxx</a> : null}
          {question?.platformBattery ? (
            <a className="secondary" href={platformBatteryUrl({
              dxx: day.dxx,
              sxx: day.session,
              materia: question.platformBattery.materia,
              topico: question.platformBattery.topico,
              subtopico: question.platformBattery.subtopico,
              size: question.platformBattery.size,
            })}>Abrir bateria validada na Plataforma</a>
          ) : null}
        </article>
      </div>
      <ProgressPanel day={day} />
      <SessionNavigation snapshot={snapshot} day={day} />
    </section>
  );
}

function QuestionPage({ snapshot, qxx }: { snapshot: Snapshot; qxx: string }) {
  const q = snapshot.questions[qxx.toLowerCase()];
  const dxx = q?.dxx ?? `D${qxx.slice(1)}`;
  const day = snapshot.days.find((d) => d.dxx === dxx);
  if (!day || !day.readyForStudy || !q) return <NotFound />;
  return (
    <section>
      <div className="page-head"><p className="eyebrow">{qxx.toUpperCase()}</p><h1>{q?.title ?? `Questões de ${day.dxx}`}</h1></div>
      <p><DayLabel day={day} /> · {day.focus}</p>
      {q ? (
        <div className="panel">
          {q.adaptive ? (
            <p><strong>Modo:</strong> adaptativo · <strong>meta:</strong> {q.meta} equivalentes/retestes, preenchidos somente com evidência da execução real.</p>
          ) : (
            <p><strong>Meta:</strong> {q.meta} · <strong>válidas:</strong> {q.valid}</p>
          )}
          <p><strong>Origem:</strong> {q.sourceSummary}</p>
          <div className="notice">Questões externas permanecem em metadados/referência; conteúdo autoral e comentários pedagógicos são publicados somente após sanitização server-side.</div>
          <p className="small">O sincronizador automático não publica enunciados externos; o Qxx público permanece em metadados e referência.</p>
          {q.platformBattery ? (
            <a className="secondary" href={platformBatteryUrl({
              dxx: day.dxx,
              sxx: day.session,
              materia: q.platformBattery.materia,
              topico: q.platformBattery.topico,
              subtopico: q.platformBattery.subtopico,
              size: q.platformBattery.size,
            })}>Abrir bateria validada na Plataforma</a>
          ) : (
            <div className="notice">Sem bateria externa validada para este Dxx. O Qxx do Notion continua sendo o fallback integral.</div>
          )}
        </div>
      ) : <div className="notice">Qxx liberado no dia, aguardando extração sanitizada do conteúdo.</div>}
      <div className="question-nav">
        <a className="secondary" href={href(`/dia/${day.dxx.toLowerCase()}/`)}>← Voltar à sessão</a>
        <a className="secondary" href={href("/dias/")}>Voltar ao calendário</a>
      </div>
    </section>
  );
}

const sectionCopy: Record<string, [string, string]> = {
  "/desempenho/": ["Desempenho", "Tempo, acertos, erros, dúvidas e sessões são privados. O registro operacional acontece na sessão autenticada e só vira canônico após confirmação do Notion."],
};

function RevisionsPage({ snapshot }: { snapshot: Snapshot }) {
  return (
    <section>
      <div className="page-head"><p className="eyebrow">D0 · D7 · D20 · Fatal Error</p><h1>Revisões</h1></div>
      <div className="notice">D0 integra o próprio dia; D7 e D20 só devem ser registrados quando o gatilho real ocorrer. O histórico de execução permanece privado.</div>
      <ReviewWriteback snapshot={snapshot} />
    </section>
  );
}

function ErrorsPage({ snapshot }: { snapshot: Snapshot }) {
  return (
    <section>
      <div className="page-head"><p className="eyebrow">Caderno privado</p><h1>Caderno de Erros</h1></div>
      <div className="notice">Somente erros reais, dúvidas relevantes e reincidências devem entrar aqui. O registro é enviado ao banco canônico privado do Notion.</div>
      <ErrorWriteback snapshot={snapshot} />
    </section>
  );
}

function EmptyAux({ label }: { label: string }) {
  return <div className="notice">{label} ainda não está disponível no snapshot público validado.</div>;
}

function RedactionsPage({ snapshot }: { snapshot: Snapshot }) {
  const rows = snapshot.redactions ?? [];
  return (
    <section>
      <div className="page-head"><p className="eyebrow">Plano editorial público</p><h1>Redações R1–R8</h1></div>
      <div className="notice">Tema e agenda vêm do Notion. Texto produzido, tempo, correção, notas e reescrita permanecem privados.</div>
      {rows.length ? <div className="aux-grid">{rows.map((item) => (
        <article className="panel aux-card" key={item.code}>
          <p className="eyebrow">{item.code} · {item.dxx}</p>
          <h2>{item.title}</h2>
          <p><strong>{item.date ? formatDate(item.date) : "Data não definida"}</strong></p>
          <p>{item.theme || "Tema editorial ainda sem descrição pública."}</p>
        </article>
      ))}</div> : <EmptyAux label="Plano R1–R8" />}
      <EssayWriteback snapshot={snapshot} />
    </section>
  );
}

function SimulationsPage({ snapshot }: { snapshot: Snapshot }) {
  const rows = snapshot.simulations ?? [];
  return (
    <section>
      <div className="page-head"><p className="eyebrow">Marcos canônicos</p><h1>Simulados e checkpoints</h1></div>
      <div className="notice">O site publica somente o plano. Acertos, tempo, decisão, fragilidades e impactos pessoais ficam fora do snapshot público.</div>
      {rows.length ? <div className="aux-grid">{rows.map((item) => (
        <article className="panel aux-card" key={item.dxx}>
          <p className="eyebrow">{item.dxx}</p>
          <h2>{item.title}</h2>
          <p>{item.date ? formatDate(item.date) : "Data não definida"} · {item.type}</p>
          <p className="small">Cobertura prevista: {item.plannedCoverage || "—"} · sessões previstas: {item.plannedSessions || "—"}</p>
        </article>
      ))}</div> : <EmptyAux label="Plano de simulados/checkpoints" />}
      <SimulationWriteback snapshot={snapshot} />
    </section>
  );
}

function EditalPage({ snapshot }: { snapshot: Snapshot }) {
  const rows = snapshot.edital ?? [];
  return (
    <section>
      <div className="page-head"><p className="eyebrow">Notion → snapshot</p><h1>Edital verticalizado</h1></div>
      {rows.length ? (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr><th>Código</th><th>Disciplina</th><th>Bloco</th><th>Questões</th><th>Peso</th><th>Status editorial</th></tr></thead>
            <tbody>{rows.map((item) => <tr key={item.code}>
              <td><strong>{item.code}</strong></td><td>{item.discipline}</td><td>{item.block}</td><td>{item.questions}</td><td>{item.weight}</td><td>{item.editorialStatus}</td>
            </tr>)}</tbody>
          </table>
        </div>
      ) : <EmptyAux label="Edital verticalizado" />}
    </section>
  );
}

function LegislationPage({ snapshot }: { snapshot: Snapshot }) {
  const rows = snapshot.legislation ?? [];
  return (
    <section>
      <div className="page-head"><p className="eyebrow">Fontes oficiais externas</p><h1>Legislação</h1></div>
      <div className="notice">A lista é derivada do banco canônico de Fontes. URLs internas do Notion e fontes não oficiais não entram no snapshot público.</div>
      {rows.length ? <div className="aux-grid">{rows.map((item) => (
        <article className="panel aux-card" key={item.code}>
          <p className="eyebrow">{item.code} · {item.category}</p>
          <h2>{item.title}</h2>
          <p>{item.cutoff || "Corte/vigência não informado"}{item.dxx ? " · " + item.dxx : ""}</p>
          {item.use ? <p className="small">{item.use}</p> : null}
          <a className="secondary" href={item.officialUrl} target="_blank" rel="noreferrer">Abrir fonte oficial ↗</a>
        </article>
      ))}</div> : <EmptyAux label="Fontes oficiais de legislação" />}
    </section>
  );
}

function FinalSprintPage({ snapshot }: { snapshot: Snapshot }) {
  const rows = snapshot.finalSprint ?? [];
  return (
    <section>
      <div className="page-head"><p className="eyebrow">31/12/2026–16/01/2027</p><h1>Reta final</h1></div>
      <div className="notice">A reta final não cria D101–D117. O snapshot expõe somente o calendário estrutural; recalibração, carga e desempenho pós-D100 permanecem privados.</div>
      {rows.length ? <div className="day-grid">{rows.map((item) => (
        <article className="day-card" key={item.code}>
          <p className="eyebrow">{item.code}</p>
          <strong>{item.title}</strong>
          <time>{formatDate(item.date)}</time>
          <p>{item.type}</p>
        </article>
      ))}</div> : <EmptyAux label="Calendário da reta final" />}
    </section>
  );
}

function StaticSection({ route }: { route: string }) {
  const [title, body] = sectionCopy[route] ?? ["Página", "Conteúdo não encontrado."];
  return <section><div className="page-head"><h1>{title}</h1></div><div className="panel"><p>{body}</p></div></section>;
}

function SyncPage({ snapshot }: { snapshot: Snapshot }) {
  return (
    <section>
      <div className="page-head"><p className="eyebrow">Contrato de sincronização</p><h1>Sync</h1></div>
      <div className="panel">
        <p><strong>Origem:</strong> Notion canônico.</p>
        <p><strong>Último snapshot:</strong> {new Date(snapshot.generatedAt).toLocaleString("pt-BR")}.</p>
        <p><strong>Modo de conteúdo:</strong> {snapshot.contentMode === "full" ? "completo e sincronizado" : "bootstrap versionado"}.</p>
        <p><strong>Cobertura pública:</strong> {snapshot.publicStats.materialPages ?? Object.keys(snapshot.materials).length} materiais · {snapshot.publicStats.questionPages ?? Object.keys(snapshot.questions).length} cadernos Qxx.</p>
        {snapshot.contentHash ? <p><strong>Hash:</strong> <code>{snapshot.contentHash.slice(0, 12)}</code>.</p> : null}
        <p><strong>Fluxo:</strong> extração server-side → normalização → validação → sanitização → snapshot → quality → Pages/PWA.</p>
        <p><strong>Privacidade:</strong> respostas, notas, tempo real, Caderno de Erros detalhado e URLs internas não são publicados.</p>
        <p><strong>Writeback:</strong> progresso privado segue site → endpoint autenticado → validação Dxx → resolução Sxx no Notion → gravação → confirmação → cache.</p>
        <p><strong>Offline:</strong> eventos ficam “Pendente de sincronização” até a confirmação do Notion; replay usa idempotency key e não transforma cache em fonte canônica.</p>
      </div>
    </section>
  );
}

function NotFound() {
  return <section><div className="page-head"><h1>Não encontrado</h1></div><p>A rota ou sessão ainda não está disponível no snapshot público.</p></section>;
}

export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const route = useMemo(() => publicRoute(window.location.pathname), []);

  useEffect(() => {
    loadSnapshot().then(setSnapshot).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <Shell><section><h1>Falha de snapshot</h1><p>{error}</p></section></Shell>;
  if (!snapshot) return <Shell><section><h1>Carregando…</h1></section></Shell>;

  let page: React.ReactNode;
  const dayMatch = route.match(/^\/dia\/(d\d{3})\/$/i);
  const questionMatch = route.match(/^\/questoes\/(q\d{3})\/$/i);

  if (route === "/") page = <Home snapshot={snapshot} />;
  else if (route === "/dias/") page = <Days snapshot={snapshot} />;
  else if (dayMatch) page = <DayPage snapshot={snapshot} dxx={dayMatch[1]} />;
  else if (questionMatch) page = <QuestionPage snapshot={snapshot} qxx={questionMatch[1]} />;
  else if (route === "/revisoes/") page = <RevisionsPage snapshot={snapshot} />;
  else if (route === "/redacoes/") page = <RedactionsPage snapshot={snapshot} />;
  else if (route === "/erros/") page = <ErrorsPage snapshot={snapshot} />;
  else if (route === "/simulados/") page = <SimulationsPage snapshot={snapshot} />;
  else if (route === "/edital/") page = <EditalPage snapshot={snapshot} />;
  else if (route === "/legislacao/") page = <LegislationPage snapshot={snapshot} />;
  else if (route === "/reta-final/") page = <FinalSprintPage snapshot={snapshot} />;
  else if (route === "/sync/") page = <SyncPage snapshot={snapshot} />;
  else if (sectionCopy[route]) page = <StaticSection route={route} />;
  else page = <NotFound />;

  return <Shell syncTime={snapshot.generatedAt}>{page}</Shell>;
}
