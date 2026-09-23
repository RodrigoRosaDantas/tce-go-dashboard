import { useEffect, useMemo, useState } from "react";
import { loadSnapshot, publicRoute } from "./data";
import type { DaySnapshot, Snapshot } from "./types";

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

function DayLabel({ day }: { day: DaySnapshot }) {
  return (
    <span className="day-label">
      <strong>{day.dxx}</strong>
      {!day.protected && day.session ? <span className="session">· {day.session}</span> : null}
    </span>
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
  const today = new Date().toISOString().slice(0, 10);
  const ordered = [...snapshot.days].sort((a, b) => a.order - b.order);
  const next = ordered.find((d) => !d.protected && d.readyForStudy && d.date >= today)
    ?? ordered.find((d) => !d.protected && d.readyForStudy);

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
        <article><strong>{snapshot.publicStats.readyDays}</strong><span>Liberados editorialmente</span></article>
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
            ) : day.readyForStudy ? (
              <a className="secondary" href={href(`/dia/${day.dxx.toLowerCase()}/`)}>Abrir</a>
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
      </section>
    );
  }

  const material = snapshot.materials[day.slug ?? ""];
  const question = snapshot.questions[day.questionSlug ?? ""];
  const currentIndex = days.findIndex((d) => d.dxx === day.dxx);
  const nextActive = days.slice(currentIndex + 1).find((d) => !d.protected);

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
              <p><strong>{question.valid}</strong> itens válidos · meta {question.meta}.</p>
              <p>{question.sourceSummary}</p>
              <p className="small">Questões de terceiros permanecem em modo metadados + referência; não há republicação massiva.</p>
            </>
          ) : <p>Qxx vinculado ao dia; detalhes serão publicados pelo snapshot sanitizado.</p>}
          {day.questionSlug ? <a className="secondary" href={href(`/questoes/${day.questionSlug}/`)}>Abrir Qxx</a> : null}
        </article>
      </div>
      <div className="next-card">
        <span>Próxima sessão ativa</span>
        {nextActive ? <a href={href(`/dia/${nextActive.dxx.toLowerCase()}/`)}><DayLabel day={nextActive} /> — {nextActive.focus}</a> : <strong>Fim da esteira D001–D100</strong>}
      </div>
    </section>
  );
}

function QuestionPage({ snapshot, qxx }: { snapshot: Snapshot; qxx: string }) {
  const q = snapshot.questions[qxx.toLowerCase()];
  const dxx = q?.dxx ?? `D${qxx.slice(1)}`;
  const day = snapshot.days.find((d) => d.dxx === dxx);
  if (!day || !day.readyForStudy) return <NotFound />;
  return (
    <section>
      <div className="page-head"><p className="eyebrow">{qxx.toUpperCase()}</p><h1>{q?.title ?? `Questões de ${day.dxx}`}</h1></div>
      <p><DayLabel day={day} /> · {day.focus}</p>
      {q ? (
        <div className="panel">
          <p><strong>Meta:</strong> {q.meta} · <strong>válidas:</strong> {q.valid}</p>
          <p><strong>Origem:</strong> {q.sourceSummary}</p>
          <div className="notice">Questões externas permanecem em metadados/referência; conteúdo autoral e comentários pedagógicos são publicados somente após sanitização server-side.</div>
          {q.contentHtml ? <div className="study-content" dangerouslySetInnerHTML={{ __html: q.contentHtml }} /> : null}
        </div>
      ) : <div className="notice">Qxx liberado no dia, aguardando extração sanitizada do conteúdo.</div>}
      <a className="secondary" href={href(`/dia/${day.dxx.toLowerCase()}/`)}>Voltar ao dia</a>
    </section>
  );
}

const sectionCopy: Record<string, [string, string]> = {
  "/revisoes/": ["Revisões", "D0 é parte do próprio dia; D7 e D20 entram apenas quando houver gatilho real."],
  "/redacoes/": ["Redações", "R1–R8 permanecem separadas da objetiva e seguem a rubrica FCC do projeto."],
  "/erros/": ["Caderno de Erros", "A camada pública não expõe respostas pessoais, reincidências ou diagnósticos privados."],
  "/simulados/": ["Simulados e checkpoints", "D20, D45, D70, D90, D96 e D100 aparecem pela mesma Ordem canônica do calendário."],
  "/desempenho/": ["Desempenho", "Dados pessoais de execução não entram no snapshot público. Esta tela mantém apenas o contrato de privacidade."],
  "/edital/": ["Edital verticalizado", "A publicação editorial usa o recorte canônico do Notion; nenhum conteúdo é corrigido apenas no frontend."],
  "/legislacao/": ["Legislação", "Fontes e vigência são consumidas do snapshot sanitizado; o Notion continua sendo a fonte editorial."],
  "/reta-final/": ["Reta final", "A fase 31/12/2026–16/01/2027 não é D101–D117 e será recalibrada pelo D100 real."],
};

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
        <p><strong>Cobertura pública:</strong> {snapshot.publicStats.materialDays ?? Object.keys(snapshot.materials).length} materiais · {snapshot.publicStats.questionDays ?? Object.keys(snapshot.questions).length} cadernos Qxx.</p>
        {snapshot.contentHash ? <p><strong>Hash:</strong> <code>{snapshot.contentHash.slice(0, 12)}</code>.</p> : null}
        <p><strong>Fluxo:</strong> extração server-side → normalização → validação → sanitização → snapshot → quality → Pages/PWA.</p>
        <p><strong>Privacidade:</strong> respostas, notas, tempo real, Caderno de Erros detalhado e URLs internas não são publicados.</p>
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
  else if (route === "/sync/") page = <SyncPage snapshot={snapshot} />;
  else if (sectionCopy[route]) page = <StaticSection route={route} />;
  else page = <NotFound />;

  return <Shell syncTime={snapshot.generatedAt}>{page}</Shell>;
}
