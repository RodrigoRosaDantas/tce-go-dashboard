import { useEffect, useMemo, useState } from "react";
import { loadSnapshot, publicRoute } from "./data";
import type { DaySnapshot, Snapshot } from "./types";
import { ProgressPanel } from "./ProgressPanel";
import { ErrorWriteback, EssayWriteback, ReviewWriteback, SimulationWriteback } from "./ExecutionForms";
import { cachedProgress, conflictCount, hasConnectedAccount, pendingCount, platformBatteryUrl } from "./progress";

const primaryNav = [
  ["/", "Hoje", "⌂"],
  ["/dias/", "Trilha", "▤"],
  ["/revisoes/", "Revisar", "↻"],
  ["/desempenho/", "Desempenho", "◔"],
] as const;

const studyNav = [
  ["/redacoes/", "Redações"],
  ["/erros/", "Caderno de erros"],
  ["/simulados/", "Simulados"],
] as const;

const referenceNav = [
  ["/edital/", "Edital verticalizado"],
  ["/legislacao/", "Legislação"],
  ["/reta-final/", "Reta final"],
  ["/sync/", "Sistema e sincronização"],
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

function extractStudyToc(html?: string) {
  if (!html || typeof DOMParser === "undefined") return [] as Array<{ id: string; label: string; level: number }>;
  const doc = new DOMParser().parseFromString(html, "text/html");
  return Array.from(doc.querySelectorAll("h2[id], h3[id]"))
    .slice(0, 18)
    .map((node) => ({
      id: node.id,
      label: node.textContent?.trim() || "Seção",
      level: node.tagName === "H3" ? 3 : 2,
    }));
}

function availabilityLabel(snapshot: Snapshot, day: DaySnapshot) {
  if (day.protected) return "Dia protegido";
  if (hasPublicSession(snapshot, day)) return "Disponível";
  if (day.readyForStudy) return "Publicação pendente";
  return "Em preparação";
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
  const currentRoute = publicRoute(window.location.pathname);
  const isCurrent = (path: string) => path === "/" ? currentRoute === "/" : currentRoute.startsWith(path);

  return (
    <>
      <header className="topbar v2-topbar">
        <a className="brand v2-brand" href={href("/")}>
          <span className="brand-mark">TC</span>
          <span><strong>TCE-GO</strong><small>Plano de estudos</small></span>
        </a>
        <div className="top-actions">
          <a className="top-action-link" href={href("/dias/")}>Trilha S01–S47</a>
          <a className="top-action-link subtle" href={href("/sync/")} aria-label="Abrir status do sistema">●</a>
        </div>
      </header>

      <div className="layout v2-layout">
        <aside className="sidebar v2-sidebar" aria-label="Navegação principal">
          <div className="sidebar-group">
            <p className="sidebar-label">Estudar</p>
            {primaryNav.map(([path, label, icon]) => (
              <a
                key={path}
                href={href(path)}
                className={`sidebar-link ${isCurrent(path) ? "active" : ""}`}
                aria-current={isCurrent(path) ? "page" : undefined}
              >
                <span aria-hidden="true">{icon}</span><span>{label}</span>
              </a>
            ))}
          </div>

          <div className="sidebar-group">
            <p className="sidebar-label">Treino</p>
            {studyNav.map(([path, label]) => (
              <a key={path} href={href(path)} className={`sidebar-link compact ${isCurrent(path) ? "active" : ""}`} aria-current={isCurrent(path) ? "page" : undefined}>{label}</a>
            ))}
          </div>

          <div className="sidebar-group">
            <p className="sidebar-label">Referência</p>
            {referenceNav.map(([path, label]) => (
              <a key={path} href={href(path)} className={`sidebar-link compact ${isCurrent(path) ? "active" : ""}`} aria-current={isCurrent(path) ? "page" : undefined}>{label}</a>
            ))}
          </div>

          <div className="sidebar-system">
            <span className="system-dot" aria-hidden="true" />
            <span>Snapshot carregado</span>
            {syncTime ? <small>{new Date(syncTime).toLocaleString("pt-BR")}</small> : null}
          </div>
        </aside>

        <main className="v2-main">{children}</main>
      </div>

      <nav className="mobile-bottom-nav" aria-label="Navegação móvel">
        {primaryNav.map(([path, label, icon]) => (
          <a key={path} href={href(path)} className={isCurrent(path) ? "active" : ""} aria-current={isCurrent(path) ? "page" : undefined}>
            <span aria-hidden="true">{icon}</span><small>{label}</small>
          </a>
        ))}
        <details className="mobile-more">
          <summary><span aria-hidden="true">•••</span><small>Mais</small></summary>
          <div className="mobile-more-menu">
            {[...studyNav, ...referenceNav].map(([path, label]) => <a key={path} href={href(path)}>{label}</a>)}
          </div>
        </details>
      </nav>
    </>
  );
}

function Home({ snapshot }: { snapshot: Snapshot }) {
  const today = currentDateInBrasilia();
  const ordered = [...snapshot.days].sort((a, b) => a.order - b.order);
  const active = ordered.filter((d) => !d.protected);
  const published = active.filter((d) => hasPublicSession(snapshot, d));
  const next = published.find((d) => !cachedProgress(d.dxx)?.completed)
    ?? published.at(-1);
  const nextIndex = next ? active.findIndex((d) => d.dxx === next.dxx) : -1;
  const nextAfter = nextIndex >= 0 ? active[nextIndex + 1] : undefined;

  return (
    <section className="home-v2">
      <div className="home-intro">
        <div>
          <p className="eyebrow">Técnico de Controle Externo · TCE-GO</p>
          <h1>Seu próximo passo.</h1>
          <p>Sequência pedagógica primeiro, calendário depois. Hoje é ${formatDate(today)}; a home não pula sessão só porque a data virou.</p>
        </div>
        <div className="trail-meter" aria-label="Cobertura editorial da trilha">
          <div className="trail-meter-head"><span>Trilha pedagógica</span><strong>{published.length}/{active.length}</strong></div>
          <div className="trail-meter-track"><span style={{ width: `${active.length ? Math.round((published.length / active.length) * 100) : 0}%` }} /></div>
          <small>Sessões atualmente publicadas no site</small>
        </div>
      </div>

      {next ? (
        <article className="focus-card">
          <div className="focus-card-copy">
            <div className="focus-kicker">
              <span className="session-chip">{next.session ?? "Sessão"}</span>
              <span>{next.dxx}</span>
              <span>{formatDate(next.date)}</span>
            </div>
            <h2>{next.focus}</h2>
            <p>{next.type} · Material + {next.questionSlug?.toUpperCase() ?? "Qxx"} + recuperação ativa D0</p>
            <div className="focus-actions">
              <a className="primary primary-large" href={href(`/dia/${next.dxx.toLowerCase()}/`)}>Começar sessão →</a>
              {next.questionSlug ? <a className="ghost-link" href={href(`/questoes/${next.questionSlug}/`)}>Ir direto às questões</a> : null}
            </div>
          </div>
          <div className="focus-sequence" aria-label="Fluxo da sessão">
            <span className="step active"><b>1</b> Aula</span>
            <span className="step"><b>2</b> Questões</span>
            <span className="step"><b>3</b> D0</span>
          </div>
        </article>
      ) : <div className="empty-state">Nenhuma sessão está liberada para estudo neste momento.</div>}

      <div className="quick-grid">
        <a className="quick-card" href={href("/dias/")}>
          <span className="quick-icon">▤</span>
          <div><strong>Ver a trilha inteira</strong><small>S01–S47 sem o ruído dos dias protegidos.</small></div>
          <span>→</span>
        </a>
        <a className="quick-card" href={href("/revisoes/")}>
          <span className="quick-icon">↻</span>
          <div><strong>Revisar</strong><small>D0, D7, D20 e Fatal Errors no mesmo lugar.</small></div>
          <span>→</span>
        </a>
        <a className="quick-card" href={href("/erros/")}>
          <span className="quick-icon">!</span>
          <div><strong>Caderno de erros</strong><small>Registre só o que merece voltar para a prova.</small></div>
          <span>→</span>
        </a>
      </div>

      {nextAfter ? (
        <div className="up-next">
          <span>Depois desta</span>
          <strong>{nextAfter.session} · {nextAfter.dxx}</strong>
          <p>{nextAfter.focus}</p>
        </div>
      ) : null}
    </section>
  );
}

function Days({ snapshot }: { snapshot: Snapshot }) {
  const days = [...snapshot.days].sort((a, b) => a.order - b.order);
  const active = days.filter((day) => !day.protected);
  const protectedDays = days.filter((day) => day.protected);

  return (
    <section className="trail-page">
      <div className="page-head v2-page-head">
        <p className="eyebrow">47 sessões ativas</p>
        <h1>Trilha de estudo</h1>
        <p>O calendário de 100 dias continua preservado, mas aqui a prioridade é a sequência que você realmente estuda.</p>
      </div>

      <div className="trail-list">
        {active.map((day, index) => {
          const available = hasPublicSession(snapshot, day);
          return (
            <article key={day.dxx} className={`trail-row ${available ? "available" : ""}`}>
              <div className="trail-number">{String(index + 1).padStart(2, "0")}</div>
              <div className="trail-row-main">
                <div className="trail-row-meta">
                  <strong>{day.session ?? "—"} · {day.dxx}</strong>
                  <span>{formatDate(day.date)}</span>
                  <span>{day.type}</span>
                </div>
                <h2>{day.focus}</h2>
              </div>
              <div className="trail-row-status">
                <span className={`availability ${available ? "ok" : ""}`}>{availabilityLabel(snapshot, day)}</span>
                {available ? <a className="secondary compact-button" href={href(`/dia/${day.dxx.toLowerCase()}/`)}>Abrir →</a> : null}
              </div>
            </article>
          );
        })}
      </div>

      <details className="protected-calendar">
        <summary>Ver calendário completo e {protectedDays.length} dias protegidos</summary>
        <div className="protected-grid">
          {days.map((day) => (
            <div key={day.dxx} className={`protected-mini ${day.protected ? "is-protected" : "is-active"}`}>
              <strong>{day.dxx}</strong>
              <span>{formatDate(day.date)}</span>
              <small>{day.protected ? "Protegido" : day.session}</small>
            </div>
          ))}
        </div>
      </details>
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
        <div className="page-head v2-page-head"><DayLabel day={day} /><h1>Dia protegido</h1></div>
        <p>{formatDate(day.date)}</p>
        <div className="notice">Este dia existe no calendário, mas não cria sessão de estudo nem dívida pedagógica.</div>
        <a className="secondary" href={href("/dias/")}>← Voltar à trilha</a>
      </section>
    );
  }

  if (!day.readyForStudy) return <NotFound />;

  const material = snapshot.materials[day.slug ?? ""];
  const question = snapshot.questions[day.questionSlug ?? ""];
  if (!material || !question) {
    return (
      <section>
        <div className="page-head v2-page-head">
          <DayLabel day={day} />
          <h1>{day.focus}</h1>
          <p>{formatDate(day.date)} · {day.type}</p>
        </div>
        <div className="notice">A sessão está aprovada no planejamento, mas ainda não foi publicada integralmente no site.</div>
        <SessionNavigation snapshot={snapshot} day={day} />
      </section>
    );
  }

  const toc = extractStudyToc(material.contentHtml);

  return (
    <section className="study-session">
      <div className="study-session-top">
        <a href={href("/dias/")} className="back-link">← Trilha</a>
        <span>{day.session} · {day.dxx}</span>
        <span>{formatDate(day.date)}</span>
      </div>

      <header className="study-hero">
        <div>
          <p className="eyebrow">{day.type}</p>
          <h1>{day.focus}</h1>
          <p>{material.summary}</p>
        </div>
        <div className="study-hero-meta">
          <span>Material</span>
          <span>{question.adaptive ? "Bateria adaptativa" : `${question.meta} questões`}</span>
          <span>D0 no fechamento</span>
        </div>
      </header>

      <nav className="study-tabs" aria-label="Etapas da sessão">
        <a href="#visao-geral">Visão geral</a>
        <a href="#aula">Aula</a>
        <a href="#questoes">Questões</a>
        <a href="#registro">Fechamento</a>
      </nav>

      <div className="study-layout-v2">
        <aside className="study-index">
          <strong>Nesta aula</strong>
          <a href="#visao-geral">Visão geral</a>
          {toc.map((item) => <a key={item.id} className={item.level === 3 ? "level-3" : ""} href={`#${item.id}`}>{item.label}</a>)}
          <a href="#questoes">Questões do dia</a>
          <a href="#registro">Registro e D0</a>
        </aside>

        <div className="study-main-column">
          <section id="visao-geral" className="session-overview-card">
            <div>
              <span className="mini-label">Objetivo da sessão</span>
              <h2>Entender, aplicar e testar.</h2>
              <p>Estude o material até conseguir explicar os conceitos centrais sem apoio. Em seguida, faça {day.questionSlug?.toUpperCase() ?? "o Qxx"} e feche o aprendizado com recuperação ativa.</p>
            </div>
            <ol>
              <li><strong>1.</strong> Aula</li>
              <li><strong>2.</strong> Questões</li>
              <li><strong>3.</strong> Correção + D0</li>
            </ol>
          </section>

          <article id="aula" className="panel lesson-panel">
            <div className="section-title-row">
              <div><span className="mini-label">Etapa 1</span><h2>Aula</h2></div>
              <a href="#questoes" className="ghost-link">Pular para questões ↓</a>
            </div>
            {material.contentHtml ? (
              <div className="study-content" dangerouslySetInnerHTML={{ __html: material.contentHtml }} />
            ) : material.sections?.map((section) => (
              <section key={section.heading} className="material-section">
                <h3>{section.heading}</h3>
                <p>{section.body}</p>
              </section>
            ))}
          </article>

          <section id="questoes" className="panel question-stage">
            <div className="section-title-row">
              <div><span className="mini-label">Etapa 2</span><h2>Questões do dia</h2></div>
              <span className="question-count">{question.adaptive ? "Adaptativa" : `${question.meta} itens`}</span>
            </div>
            <p>{question.sourceSummary}</p>
            <div className="question-actions">
              {day.questionSlug ? <a className="primary" href={href(`/questoes/${day.questionSlug}/`)}>Abrir {day.questionSlug.toUpperCase()} →</a> : null}
              {question.platformBattery ? (
                <a className="secondary" href={platformBatteryUrl({
                  dxx: day.dxx,
                  sxx: day.session,
                  materia: question.platformBattery.materia,
                  topico: question.platformBattery.topico,
                  subtopico: question.platformBattery.subtopico,
                  size: question.platformBattery.size,
                })}>Abrir bateria na Plataforma</a>
              ) : null}
            </div>
            <p className="small">Quando a questão estiver em fonte externa, o site usa referência e metadados em vez de republicar o enunciado.</p>
          </section>

          <section id="registro">
            <div className="section-title-row register-title">
              <div><span className="mini-label">Etapa 3</span><h2>Fechamento da sessão</h2></div>
              <span className="availability ok">D0</span>
            </div>
            <ProgressPanel day={day} />
          </section>

          <SessionNavigation snapshot={snapshot} day={day} />
        </div>
      </div>
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

const sectionCopy: Record<string, [string, string]> = {};

function PerformancePage({ snapshot }: { snapshot: Snapshot }) {
  const rows = snapshot.days
    .filter((day) => !day.protected)
    .sort((a, b) => a.order - b.order)
    .map((day) => ({ day, progress: cachedProgress(day.dxx) }))
    .filter((item) => item.progress);

  const completed = rows.filter((item) => item.progress?.completed).length;
  const studied = rows.filter((item) => item.progress?.studied).length;
  const totalMinutes = rows.reduce((sum, item) => sum + (item.progress?.timeMinutes ?? 0), 0);
  const questions = rows.reduce((sum, item) => sum + (item.progress?.questionsDone ?? 0), 0);
  const correct = rows.reduce((sum, item) => sum + (item.progress?.correct ?? 0), 0);
  const errors = rows.reduce((sum, item) => sum + (item.progress?.errors ?? 0), 0);
  const accuracy = correct + errors > 0 ? Math.round((correct / (correct + errors)) * 100) : null;
  const pending = pendingCount();
  const conflicts = conflictCount();
  const connected = hasConnectedAccount();

  return (
    <section>
      <div className="page-head v2-page-head">
        <p className="eyebrow">Dados privados deste dispositivo</p>
        <h1>Desempenho</h1>
        <p>Resumo do progresso confirmado em cache. O Notion continua sendo a fonte canônica; esta tela não inventa desempenho quando não há registro real.</p>
      </div>

      <div className="performance-grid">
        <article className="metric-card"><strong>{completed}</strong><span>Sessões concluídas</span><small>{studied} com estudo registrado</small></article>
        <article className="metric-card"><strong>{totalMinutes}</strong><span>Minutos registrados</span><small>{Math.floor(totalMinutes / 60)}h {totalMinutes % 60}min</small></article>
        <article className="metric-card"><strong>{questions}</strong><span>Questões feitas</span><small>{correct} acertos · {errors} erros</small></article>
        <article className="metric-card"><strong>{accuracy === null ? "—" : accuracy + "%"}</strong><span>Aproveitamento</span><small>Somente itens com acerto/erro registrado</small></article>
      </div>

      <div className="panel performance-status">
        <h2>Status dos dados</h2>
        <p><strong>Conta:</strong> {connected ? "conectada" : "não conectada neste navegador"}.</p>
        <p><strong>Fila local:</strong> {pending} pendente{pending === 1 ? "" : "s"} · {conflicts} conflito{conflicts === 1 ? "" : "s"}.</p>
        {!rows.length ? <div className="notice">Ainda não há progresso confirmado em cache neste dispositivo. Abra uma sessão e registre a execução real para esta tela ganhar dados.</div> : null}
      </div>

      {rows.length ? (
        <div className="performance-list">
          {rows.map(({ day, progress }) => (
            <article key={day.dxx} className="performance-row">
              <div><strong>{day.session} · {day.dxx}</strong><span>{day.focus}</span></div>
              <div><strong>{progress?.completed ? "Concluída" : progress?.studied ? "Em andamento" : "Registrada"}</strong><span>{progress?.timeMinutes ?? 0} min · {progress?.questionsDone ?? 0} questões</span></div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

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
      <div className="page-head"><p className="eyebrow">Mapa da prova</p><h1>Edital verticalizado</h1></div>
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
  else if (route === "/desempenho/") page = <PerformancePage snapshot={snapshot} />;
  else if (route === "/edital/") page = <EditalPage snapshot={snapshot} />;
  else if (route === "/legislacao/") page = <LegislationPage snapshot={snapshot} />;
  else if (route === "/reta-final/") page = <FinalSprintPage snapshot={snapshot} />;
  else if (route === "/sync/") page = <SyncPage snapshot={snapshot} />;
  else if (sectionCopy[route]) page = <StaticSection route={route} />;
  else page = <NotFound />;

  return <Shell syncTime={snapshot.generatedAt}>{page}</Shell>;
}
