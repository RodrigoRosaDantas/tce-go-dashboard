import type { Snapshot } from "../types";
import { conflictCount, pendingCount } from "../progress";
import { completionStats, currentDateInBrasilia, formatDate, href, nextStudyDay, publishedDays } from "./shared";

export function HomePage({ snapshot }: { snapshot: Snapshot }) {
  const today = currentDateInBrasilia();
  const published = publishedDays(snapshot);
  const next = nextStudyDay(snapshot);
  const stats = completionStats(snapshot);
  const nextIndex = next ? stats.active.findIndex((day) => day.dxx === next.dxx) : -1;
  const after = nextIndex >= 0 ? stats.active[nextIndex + 1] : undefined;
  const latest = [...stats.withProgress].sort((a, b) => b.day.order - a.day.order)[0];
  const pending = pendingCount();
  const conflicts = conflictCount();
  const executionPct = published.length ? Math.round((stats.completed / published.length) * 100) : 0;

  return (
    <section className="home-dashboard">
      <div className="home-command-grid">
        <article className="decision-card">
          <header className="decision-head">
            <div>
              <span className="status-dot" />
              <span>PRÓXIMA DECISÃO</span>
            </div>
            <span className="date-pill">{formatDate(today)}</span>
          </header>

          {next ? (
            <>
              <div className="decision-copy">
                <div className="session-meta">
                  <span className="session-code">{next.session}</span>
                  <span>{next.dxx}</span>
                  <span>{next.type}</span>
                </div>
                <h1>{next.focus}</h1>
                <p>
                  A sequência pedagógica prevalece sobre o calendário.
                  {latest?.day.dxx === next.dxx && latest.progress?.studied
                    ? " Esta sessão já tem execução registrada e pode ser retomada."
                    : " Esta é a primeira sessão publicada ainda não concluída neste dispositivo."}
                </p>
                <div className="decision-actions">
                  <a className="button primary large" href={href(`/dia/${next.dxx.toLowerCase()}/`)}>
                    {latest?.day.dxx === next.dxx && latest.progress?.studied ? "Retomar sessão" : "Começar sessão"} <span>→</span>
                  </a>
                  {next.questionSlug ? <a className="button ghost" href={href(`/questoes/${next.questionSlug}/`)}>Abrir {next.questionSlug.toUpperCase()}</a> : null}
                </div>
              </div>

              <footer className="decision-footer">
                <span><b>1</b> Material</span>
                <i />
                <span><b>2</b> Questões</span>
                <i />
                <span><b>3</b> Correção + D0</span>
              </footer>
            </>
          ) : (
            <div className="decision-copy">
              <span className="eyebrow">Trilha publicada</span>
              <h1>{published.length ? "Tudo concluído por aqui." : "Aguardando publicação."}</h1>
              <p>{published.length ? "Todas as sessões publicadas possuem conclusão registrada neste dispositivo." : "Nenhuma sessão está liberada no snapshot atual."}</p>
            </div>
          )}
        </article>

        <aside className="pulse-card">
          <header><span>PULSO DO PROJETO</span><strong>{executionPct}%</strong></header>
          <div className="ring" style={{ "--progress": `${executionPct * 3.6}deg` } as React.CSSProperties}>
            <div><strong>{stats.completed}</strong><span>de {published.length}</span></div>
          </div>
          <div className="pulse-lines">
            <div><span>Sessões com estudo</span><strong>{stats.studied}</strong></div>
            <div><span>Tempo registrado</span><strong>{Math.floor(stats.minutes / 60)}h {stats.minutes % 60}min</strong></div>
            <div><span>Questões feitas</span><strong>{stats.questions}</strong></div>
            <div><span>Aproveitamento</span><strong>{stats.accuracy === null ? "—" : `${stats.accuracy}%`}</strong></div>
          </div>
          <a href={href("/desempenho/")}>Abrir desempenho <span>→</span></a>
        </aside>
      </div>

      <div className="metric-strip">
        <article><span>SESSÕES PUBLICADAS</span><strong>{published.length}<small>/ {stats.active.length}</small></strong><p>Conteúdo disponível no snapshot.</p></article>
        <article><span>EXECUÇÃO REAL</span><strong>{stats.completed}</strong><p>Somente conclusão registrada.</p></article>
        <article><span>FILA LOCAL</span><strong>{pending}</strong><p>{conflicts ? `${conflicts} conflito(s) preservado(s).` : "Sem conflitos locais."}</p></article>
        <article><span>PRÓXIMA SESSÃO</span><strong>{next?.session ?? "—"}</strong><p>{next ? `${next.dxx} · ${formatDate(next.date)}` : "Nenhuma pendência publicada."}</p></article>
      </div>

      <section className="operational-grid">
        <article className="plan-card">
          <div className="section-heading">
            <div><span className="eyebrow">PLANO DE EXECUÇÃO</span><h2>O que fazer agora</h2></div>
            <a href={href("/dias/")}>Ver S01–S47</a>
          </div>
          <div className="plan-steps">
            <article className="current">
              <b>01</b><span>AGORA</span><h3>{next ? "Aprender o núcleo" : "Trilha em dia"}</h3>
              <p>{next ? "Abra a sessão e use o player: timer, índice, leitura e checklist." : "Use revisão, erros e desempenho para manutenção."}</p>
              {next ? <a href={href(`/dia/${next.dxx.toLowerCase()}/`)}>Abrir material →</a> : <a href={href("/revisoes/")}>Abrir revisões →</a>}
            </article>
            <article>
              <b>02</b><span>DEPOIS</span><h3>Testar sem gabarito</h3>
              <p>O Qxx usa conteúdo público seguro quando disponível e mantém referências FCC por metadados.</p>
              {next?.questionSlug ? <a href={href(`/questoes/${next.questionSlug}/`)}>Abrir {next.questionSlug.toUpperCase()} →</a> : <span />}
            </article>
            <article>
              <b>03</b><span>FECHAMENTO</span><h3>Corrigir a causa</h3>
              <p>Registre tempo, acertos, erros e dúvidas; depois faça D0 e só então conclua.</p>
              <a href={href("/erros/")}>Caderno de erros →</a>
            </article>
          </div>
        </article>

        <aside className="continuity-card">
          <span className="eyebrow">CONTINUIDADE</span>
          <h2>Depois desta</h2>
          {after ? (
            <>
              <strong>{after.session} · {after.dxx}</strong>
              <p>{after.focus}</p>
              <span className="muted">{formatDate(after.date)} · {after.type}</span>
            </>
          ) : <p>Não há próxima sessão ativa na trilha atual.</p>}
          <hr />
          <span className="eyebrow">ÚLTIMO REGISTRO</span>
          {latest ? (
            <>
              <strong>{latest.day.session} · {latest.day.dxx}</strong>
              <p>{latest.progress?.completed ? "Concluída" : "Em andamento"} · {latest.progress?.timeMinutes ?? 0} min · {latest.progress?.questionsDone ?? 0} questões</p>
            </>
          ) : <p>Nenhuma execução real registrada ainda.</p>}
        </aside>
      </section>
    </section>
  );
}
