import type { Snapshot } from "../types";
import { conflictCount, hasConnectedAccount, pendingCount } from "../progress";
import { completionStats, formatDate, href } from "./shared";

export function PerformancePage({ snapshot }: { snapshot: Snapshot }) {
  const stats = completionStats(snapshot);
  const pending = pendingCount();
  const conflicts = conflictCount();
  const connected = hasConnectedAccount();

  const rows = stats.withProgress
    .slice()
    .sort((a, b) => a.day.order - b.day.order);

  const maxQuestions = Math.max(1, ...rows.map((item) => item.progress?.questionsDone ?? 0));

  return (
    <section className="performance-page">
      <div className="page-heading split">
        <div>
          <span className="eyebrow">EXECUÇÃO REAL</span>
          <h1>Desempenho</h1>
          <p>Leitura do que foi efetivamente registrado. O painel não converte cobertura editorial em progresso pessoal.</p>
        </div>
        <div className="data-state-card">
          <span className={connected ? "live-dot" : "warn-dot"} />
          <div><strong>{connected ? "Conta conectada" : "Conta não conectada"}</strong><small>{pending} pendente(s) · {conflicts} conflito(s)</small></div>
        </div>
      </div>

      <div className="performance-kpis">
        <article><span>CONCLUÍDAS</span><strong>{stats.completed}</strong><small>de {stats.active.length} sessões ativas</small></article>
        <article><span>TEMPO</span><strong>{Math.floor(stats.minutes / 60)}h <i>{stats.minutes % 60}m</i></strong><small>{stats.studied ? Math.round(stats.minutes / stats.studied) : 0} min/sessão com estudo</small></article>
        <article><span>QUESTÕES</span><strong>{stats.questions}</strong><small>{stats.correct} acertos · {stats.errors} erros</small></article>
        <article><span>APROVEITAMENTO</span><strong>{stats.accuracy === null ? "—" : `${stats.accuracy}%`}</strong><small>{stats.doubts} acertos com dúvida registrados</small></article>
      </div>

      {rows.length ? (
        <>
          <section className="performance-panel">
            <header className="section-heading">
              <div><span className="eyebrow">EVOLUÇÃO</span><h2>Questões por sessão</h2></div>
              <small>Somente sessões com registro local/confirmado.</small>
            </header>
            <div className="session-bars">
              {rows.map(({ day, progress }) => {
                const count = progress?.questionsDone ?? 0;
                const total = (progress?.correct ?? 0) + (progress?.errors ?? 0);
                const accuracy = total ? Math.round(((progress?.correct ?? 0) / total) * 100) : null;
                return (
                  <div className="session-bar-row" key={day.dxx}>
                    <div className="bar-label"><strong>{day.session} · {day.dxx}</strong><span>{count} questões</span></div>
                    <div className="bar-track"><span style={{ width: `${Math.max(2, Math.round((count / maxQuestions) * 100))}%` }} /></div>
                    <div className="bar-value">{accuracy === null ? "—" : `${accuracy}%`}</div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="performance-panel">
            <header className="section-heading">
              <div><span className="eyebrow">HISTÓRICO</span><h2>Sessão por sessão</h2></div>
              <a href={href("/dias/")}>Abrir trilha</a>
            </header>
            <div className="history-table-wrap">
              <table className="history-table">
                <thead><tr><th>Sessão</th><th>Data</th><th>Status</th><th>Tempo</th><th>Questões</th><th>Acertos</th><th>Erros</th><th>Dúvidas</th></tr></thead>
                <tbody>
                  {rows.map(({ day, progress }) => (
                    <tr key={day.dxx}>
                      <td><a href={href(`/dia/${day.dxx.toLowerCase()}/`)}><strong>{day.session}</strong><small>{day.dxx}</small></a></td>
                      <td>{formatDate(day.date)}</td>
                      <td><span className={progress?.completed ? "status-chip success" : "status-chip"}>{progress?.completed ? "Concluída" : progress?.studied ? "Em andamento" : "Registrada"}</span></td>
                      <td>{progress?.timeMinutes ?? 0} min</td>
                      <td>{progress?.questionsDone ?? 0}</td>
                      <td>{progress?.correct ?? 0}</td>
                      <td>{progress?.errors ?? 0}</td>
                      <td>{progress?.doubts ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <div className="empty-performance">
          <span>◔</span>
          <div><strong>Ainda não há execução registrada.</strong><p>Isso é correto. O painel começa vazio e cresce somente com estudo real.</p></div>
          <a className="button primary" href={href("/")}>Ir para Hoje →</a>
        </div>
      )}
    </section>
  );
}
