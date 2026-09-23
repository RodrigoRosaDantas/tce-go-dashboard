import { useMemo, useState } from "react";
import type { Snapshot } from "../types";
import { ErrorWriteback } from "../ExecutionForms";
import { useOperational } from "./OperationalContext";
import { isOpenError } from "./operations";
import { DataNotice, EmptyState, MetricCard, PageHeader, StatusPill } from "./ui";
import { href } from "../v3/shared";

type ErrorFilter = "open" | "critical" | "recurrent" | "all";

export function ErrorsPageV4({ snapshot }: { snapshot: Snapshot }) {
  const { summary } = useOperational();
  const [filter, setFilter] = useState<ErrorFilter>("open");
  const open = summary.errors.filter(isOpenError);
  const critical = open.filter((item) => item.fatal || item.severity === "P1");
  const recurrent = open.filter((item) => (item.recurrence ?? 0) > 0);

  const visible = useMemo(() => {
    if (filter === "critical") return critical;
    if (filter === "recurrent") return recurrent;
    if (filter === "all") return summary.errors;
    return open;
  }, [critical, filter, open, recurrent, summary.errors]);

  return (
    <section className="aux-page errors-v4">
      <PageHeader
        eyebrow="CLÍNICA DE ERROS"
        title="Caderno de erros"
        description="O erro volta para a sessão de origem, ganha severidade/reincidência e pode gerar revisão. Nada é criado automaticamente."
        aside={<DataNotice canonical={summary.canonical} degraded={summary.degraded} generatedAt={summary.generatedAt} />}
      />

      <div className="metric-strip metric-strip-v4">
        <MetricCard label="ABERTOS" value={open.length} />
        <MetricCard label="P1 / FATAL" value={critical.length} tone={critical.length ? "danger" : "default"} />
        <MetricCard label="REINCIDENTES" value={recurrent.length} tone={recurrent.length ? "warning" : "default"} />
        <MetricCard label="TOTAL REGISTRADO" value={summary.errors.length} tone="accent" />
      </div>

      <div className="trail-toolbar-v4">
        <div className="segmented-v4">
          {([["open","Abertos"],["critical","P1/Fatal"],["recurrent","Reincidentes"],["all","Todos"]] as Array<[ErrorFilter,string]>).map(([value,label]) => (
            <button key={value} type="button" className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label}</button>
          ))}
        </div>
        <span>{visible.length} erro(s)</span>
      </div>

      {visible.length ? (
        <div className="errors-list-v4">
          {visible.map((item) => (
            <article className={`error-card-v4 ${item.fatal || item.severity === "P1" ? "critical" : ""}`} key={item.id}>
              <div className="error-card-head">
                <div>
                  <span className="eyebrow">{item.errorId || "ERRO"} · {item.dxx || "sem Dxx"}</span>
                  <h2>{item.topic || item.error || "Erro registrado"}</h2>
                  {item.subject ? <p>{item.subject}</p> : null}
                </div>
                <div className="error-badges-v4">
                  {item.fatal ? <StatusPill tone="danger">Fatal Error</StatusPill> : null}
                  {item.severity ? <StatusPill tone={item.severity === "P1" ? "danger" : item.severity === "P2" ? "warning" : "neutral"}>{item.severity}</StatusPill> : null}
                  <StatusPill tone={isOpenError(item) ? "accent" : "success"}>{item.status}</StatusPill>
                </div>
              </div>
              <div className="error-facts-v4">
                <span><b>Motivo</b>{item.reason || "—"}</span>
                <span><b>Reincidência</b>{item.recurrence}</span>
                <span><b>Próxima checagem</b>{item.nextCheck || "—"}</span>
                <span><b>Questão</b>{item.questionId || "—"}</span>
              </div>
              {item.action ? <div className="error-action-v4"><b>Ação</b><p>{item.action}</p></div> : null}
              <div className="error-links-v4">
                {item.dxx ? <a href={href(`/dia/${item.dxx.toLowerCase()}/`)}>Voltar à sessão →</a> : null}
                {item.dxx ? <a href={href(`/revisoes/?dxx=${item.dxx}&type=${encodeURIComponent(item.fatal ? "Fatal Error" : "D7")}&reason=${encodeURIComponent(item.recurrence ? "Reincidência" : "Erro relevante")}&status=${encodeURIComponent("Próxima")}#review-form`)}>Criar/atualizar revisão →</a> : null}
              </div>
            </article>
          ))}
        </div>
      ) : <EmptyState icon="✓" title="Nenhum erro neste filtro." description="O caderno cresce somente a partir de execução real." />}

      <div id="error-form"><ErrorWriteback snapshot={snapshot} /></div>
    </section>
  );
}
