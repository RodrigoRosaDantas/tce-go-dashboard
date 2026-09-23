import type { DaySnapshot, Snapshot } from "../types";
import { ProgressPanel } from "../ProgressPanel";
import { platformBatteryUrl } from "../progress";
import { DayLabel, activeDays, extractStudyToc, formatDate, hasPublicSession, href } from "./shared";
import { ReadingControls, ReadingProgress, RevisionLens, SectionNavigator, SessionChecklist, SessionIndex, StudyNotebook, StudyTimer } from "./StudyTools";
import { useOperational } from "../v4/OperationalContext";
import { errorsForDay, reviewBucket, reviewsForDay } from "../v4/operations";
import { StatusPill } from "../v4/ui";
import { AuthorialTrainer } from "../v4/QuestionTrainer";

function SessionNavigation({ snapshot, day }: { snapshot: Snapshot; day: DaySnapshot }) {
  const active = activeDays(snapshot);
  const index = active.findIndex((item) => item.dxx === day.dxx);
  const previous = index > 0 ? active[index - 1] : undefined;
  const next = index >= 0 ? active[index + 1] : undefined;

  const neighbor = (target: DaySnapshot | undefined, label: string) => {
    if (!target) return <span className="nav-neighbor disabled">{label}<b>—</b></span>;
    if (!hasPublicSession(snapshot, target)) {
      return <span className="nav-neighbor disabled">{label}<b>{target.session} · {target.dxx}</b><small>Aguardando publicação</small></span>;
    }
    return (
      <a className="nav-neighbor" href={href(`/dia/${target.dxx.toLowerCase()}/`)}>
        <span>{label}</span><b>{target.session} · {target.dxx}</b><small>{target.focus}</small>
      </a>
    );
  };

  return (
    <nav className="session-navigation" aria-label="Navegação entre sessões">
      {neighbor(previous, "Anterior")}
      <a className="trail-center-link" href={href("/dias/")}>S01–S47</a>
      {neighbor(next, "Próxima")}
    </nav>
  );
}

function SessionHero({ day, questionMeta }: { day: DaySnapshot; questionMeta: number }) {
  return (
    <header className="session-hero-v3">
      <div className="session-breadcrumb"><a href={href("/dias/")}>Trilha</a><span>/</span><strong>{day.session} · {day.dxx}</strong></div>
      <div className="session-hero-grid">
        <div>
          <div className="session-kicker"><span>{day.type}</span><span>{formatDate(day.date)}</span></div>
          <h1>{day.focus}</h1>
        </div>
        <div className="session-facts">
          <div><span>Material</span><strong>Canônico</strong></div>
          <div><span>Questões</span><strong>{questionMeta || "—"}</strong></div>
          <div><span>Fechamento</span><strong>D0</strong></div>
        </div>
      </div>
    </header>
  );
}

export function StudyPage({ snapshot, dxx }: { snapshot: Snapshot; dxx: string }) {
  const { summary } = useOperational();
  const day = [...snapshot.days].sort((a, b) => a.order - b.order)
    .find((item) => item.dxx.toLowerCase() === dxx.toLowerCase());
  if (!day) return <MissingStudy />;
  if (day.protected) {
    return (
      <section className="protected-page">
        <div className="page-heading"><span className="eyebrow">CALENDÁRIO</span><h1>{day.dxx} · dia protegido</h1><p>{formatDate(day.date)}</p></div>
        <div className="notice">Este dia preserva o calendário do projeto, mas não cria sessão pedagógica nem dívida de estudo.</div>
        <a className="button secondary" href={href("/dias/")}>← Voltar à trilha</a>
      </section>
    );
  }
  if (!day.readyForStudy || !day.slug || !day.questionSlug) return <MissingStudy />;

  const material = snapshot.materials[day.slug];
  const question = snapshot.questions[day.questionSlug];
  if (!material || !question) return <MissingStudy day={day} snapshot={snapshot} />;

  const toc = extractStudyToc(material.contentHtml);
  const dayErrors = errorsForDay(summary, day.dxx);
  const dayReviews = reviewsForDay(summary, day.dxx);
  const urgentReviews = dayReviews.filter((review) => ["overdue","today"].includes(reviewBucket(review)));
  const criticalErrors = dayErrors.filter((error) => error.fatal || error.severity === "P1");

  return (
    <section className="study-player">
      <SessionHero day={day} questionMeta={question.meta} />

      <div className="session-toolbar">
        <ReadingProgress dxx={day.dxx} />
        <StudyTimer dxx={day.dxx} />
        <ReadingControls />
        <StudyNotebook dxx={day.dxx} />
      </div>

      <SessionChecklist dxx={day.dxx} />

      {dayErrors.length || dayReviews.length ? (
        <section className="session-signals-v4">
          <div>
            <span className="eyebrow">HISTÓRICO DESTA SESSÃO</span>
            <strong>O que merece atenção antes de avançar</strong>
          </div>
          <div className="session-signal-pills-v4">
            {criticalErrors.length ? <a href={href(`/erros/?dxx=${day.dxx}`)}><StatusPill tone="danger">{criticalErrors.length} erro(s) P1/Fatal</StatusPill></a> : null}
            {dayErrors.length && !criticalErrors.length ? <a href={href(`/erros/?dxx=${day.dxx}`)}><StatusPill>{dayErrors.length} erro(s) aberto(s)</StatusPill></a> : null}
            {urgentReviews.length ? <a href={href(`/revisoes/?dxx=${day.dxx}`)}><StatusPill tone="warning">{urgentReviews.length} revisão(ões) agora</StatusPill></a> : null}
            {dayReviews.length && !urgentReviews.length ? <a href={href(`/revisoes/?dxx=${day.dxx}`)}><StatusPill>{dayReviews.length} revisão(ões) futura(s)</StatusPill></a> : null}
          </div>
        </section>
      ) : null}

      <nav className="stage-tabs" aria-label="Etapas da sessão">
        <a href="#visao-geral">Visão geral</a>
        <a href="#aula">Material</a>
        <a href="#questoes">Questões</a>
        <a href="#registro">Fechamento</a>
      </nav>

      <div className="study-workspace">
        <SessionIndex dxx={day.dxx} toc={toc} />

        <div className="study-flow">
          <section id="visao-geral" className="session-brief">
            <div>
              <span className="eyebrow">MISSÃO DA SESSÃO</span>
              <h2>Aprender → testar → corrigir → recuperar.</h2>
              <p>{material.summary}</p>
            </div>
            <ol>
              <li><b>1</b><span><strong>Material</strong><small>Compreender e explicar sem apoio.</small></span></li>
              <li><b>2</b><span><strong>{question.qxx}</strong><small>{question.adaptive ? "Bateria adaptativa." : `${question.meta} itens previstos.`}</small></span></li>
              <li><b>3</b><span><strong>Correção + D0</strong><small>Registrar causa e recuperar de memória.</small></span></li>
            </ol>
          </section>

          <article id="aula" className="lesson-card">
            <header className="content-section-head">
              <div><span className="eyebrow">ETAPA 1</span><h2>Material</h2></div>
              <div className="content-head-actions"><a href="#questoes">Ir às questões ↓</a></div>
            </header>
            <RevisionLens html={material.contentHtml} />
            {material.contentHtml ? (
              <div className="study-content" dangerouslySetInnerHTML={{ __html: material.contentHtml }} />
            ) : (
              <div className="study-content">
                {material.sections?.map((section) => <section key={section.heading}><h2>{section.heading}</h2><p>{section.body}</p></section>)}
              </div>
            )}
            <SectionNavigator toc={toc} />
          </article>

          <section id="questoes" className="question-bridge">
            <div className="question-bridge-copy">
              <span className="eyebrow">ETAPA 2</span>
              <h2>{question.title}</h2>
              <p>{question.sourceSummary}</p>
              <div className="question-tags">
                <span>{question.adaptive ? "Adaptativa" : `${question.meta} itens`}</span>
                <span>{question.valid} válidos</span>
                <span>copyright: metadados</span>
              </div>
            </div>
            <div className="question-bridge-actions">
              <a className="button primary large" href={href(`/questoes/${day.questionSlug}/`)}>Abrir {question.qxx} →</a>
              {question.platformBattery ? (
                <a className="button secondary" href={platformBatteryUrl({
                  dxx: day.dxx,
                  sxx: day.session,
                  materia: question.platformBattery.materia,
                  topico: question.platformBattery.topico,
                  subtopico: question.platformBattery.subtopico,
                  size: question.platformBattery.size,
                })}>Bateria validada na Plataforma</a>
              ) : null}
            </div>
          </section>

          <section id="registro" className="closing-section">
            <header className="content-section-head">
              <div><span className="eyebrow">ETAPA 3</span><h2>Fechamento da sessão</h2><p>Use o tempo do cronômetro, registre a execução real e conclua somente depois da correção + D0.</p></div>
              <span className="status-chip success">D0</span>
            </header>
            <ProgressPanel day={day} />
            <div className="closing-links-v4">
              <a href={href(`/erros/?dxx=${day.dxx}#error-form`)}>Registrar erro desta sessão →</a>
              <a href={href(`/revisoes/?dxx=${day.dxx}&type=D7&reason=Erro%20relevante#review-form`)}>Programar D7 →</a>
              <a href={href(`/revisoes/?dxx=${day.dxx}&type=D20&reason=Conte%C3%BAdo%20novo#review-form`)}>Programar D20 →</a>
            </div>
          </section>

          <SessionNavigation snapshot={snapshot} day={day} />
        </div>
      </div>
    </section>
  );
}

export function QuestionPage({ snapshot, qxx }: { snapshot: Snapshot; qxx: string }) {
  const question = snapshot.questions[qxx.toLowerCase()];
  if (!question) return <MissingStudy />;
  const day = snapshot.days.find((item) => item.dxx === question.dxx);
  if (!day || day.protected || !hasPublicSession(snapshot, day)) return <MissingStudy />;

  const toc = extractStudyToc(question.contentHtml);

  return (
    <section className="question-hub">
      <div className="question-hub-top">
        <div className="session-breadcrumb"><a href={href(`/dia/${day.dxx.toLowerCase()}/`)}>{day.session} · {day.dxx}</a><span>/</span><strong>{question.qxx}</strong></div>
        <div className="question-top-actions">
          <a className="button secondary" href={href(`/dia/${day.dxx.toLowerCase()}/#aula`)}>← Material</a>
          <a className="button secondary" href={href(`/dia/${day.dxx.toLowerCase()}/#registro`)}>Fechamento →</a>
        </div>
      </div>

      <header className="question-hero-v3">
        <div>
          <span className="eyebrow">BATERIA CANÔNICA</span>
          <h1>{question.title}</h1>
          <p>{question.sourceSummary}</p>
        </div>
        <div className="question-metrics">
          <article><span>Meta</span><strong>{question.meta}</strong></article>
          <article><span>Válidos</span><strong>{question.valid}</strong></article>
          <article><span>Modo</span><strong>{question.adaptive ? "Adapt." : "Qxx"}</strong></article>
        </div>
      </header>

      <div className="copyright-banner">
        <span>©</span>
        <p><strong>Questões de terceiros não são republicadas integralmente.</strong> O snapshot mantém referências e metadados; itens autorais do projeto podem ser exibidos quando o caderno canônico os contém.</p>
      </div>

      {question.platformBattery ? (
        <div className="platform-bridge">
          <div><span className="eyebrow">PLATAFORMA DE QUESTÕES</span><h2>Bateria validada para este Qxx</h2><p>{question.platformBattery.materia} · {question.platformBattery.topico}{question.platformBattery.subtopico ? ` · ${question.platformBattery.subtopico}` : ""}</p></div>
          <a className="button primary" href={platformBatteryUrl({
            dxx: day.dxx,
            sxx: day.session,
            materia: question.platformBattery.materia,
            topico: question.platformBattery.topico,
            subtopico: question.platformBattery.subtopico,
            size: question.platformBattery.size,
          })}>Resolver na Plataforma →</a>
        </div>
      ) : null}

      {question.authorialItems?.length ? <AuthorialTrainer question={question} day={day} /> : null}

      {question.contentHtml ? (
        <div className="question-workspace">
          <aside className="lesson-index question-index">
            <div className="index-head"><span>QXX</span><strong>{question.qxx}</strong></div>
            {toc.map((item) => <a key={item.id} className={item.level === 3 ? "level-3" : ""} href={`#${item.id}`}>{item.label}</a>)}
          </aside>
          <article className="question-content-card">
            <div className="study-content question-content" dangerouslySetInnerHTML={{ __html: question.contentHtml }} />
          </article>
        </div>
      ) : (
        <div className="question-fallback">
          <span className="eyebrow">SNAPSHOT ATUAL</span>
          <h2>Conteúdo detalhado ainda não sincronizado.</h2>
          <p>O Qxx está validado editorialmente, mas este snapshot ainda contém somente metadados. O próximo sync V3 publicará apenas o conteúdo seguro do caderno canônico.</p>
        </div>
      )}

      <footer className="question-close">
        <div><span className="eyebrow">DEPOIS DA TENTATIVA</span><h2>Volte à sessão para registrar e executar D0.</h2></div>
        <a className="button primary" href={href(`/dia/${day.dxx.toLowerCase()}/#registro`)}>Fechar {day.dxx} →</a>
      </footer>
    </section>
  );
}

function MissingStudy({ day, snapshot }: { day?: DaySnapshot; snapshot?: Snapshot }) {
  return (
    <section className="missing-study">
      <div className="page-heading">
        <span className="eyebrow">INDISPONÍVEL</span>
        <h1>{day ? `${day.session ?? ""} · ${day.dxx}` : "Conteúdo não encontrado"}</h1>
        <p>{day ? "A sessão existe no planejamento, mas ainda não está integralmente disponível no snapshot público." : "A rota ou conteúdo não existe no snapshot atual."}</p>
      </div>
      <a className="button secondary" href={href(snapshot ? "/dias/" : "/")}>← Voltar</a>
    </section>
  );
}
