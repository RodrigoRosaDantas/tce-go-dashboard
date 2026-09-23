import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  aside,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  aside?: ReactNode;
}) {
  return (
    <div className={aside ? "page-heading split" : "page-heading"}>
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {aside}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: "default" | "accent" | "warning" | "danger";
}) {
  return (
    <article className={`metric-card-v4 tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </article>
  );
}

export function StatusPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "accent";
}) {
  return <span className={`status-pill-v4 ${tone}`}>{children}</span>;
}

export function EmptyState({
  icon = "—",
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state-v4">
      <span className="empty-icon-v4">{icon}</span>
      <div>
        <strong>{title}</strong>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div className="empty-action-v4">{action}</div> : null}
    </div>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  detail,
  action,
}: {
  eyebrow?: string;
  title: string;
  detail?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="section-heading-v4">
      <div>
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h2>{title}</h2>
        {detail ? <p>{detail}</p> : null}
      </div>
      {action}
    </header>
  );
}

export function DataNotice({
  canonical,
  degraded,
  generatedAt,
}: {
  canonical: boolean;
  degraded?: boolean;
  generatedAt?: string;
}) {
  return (
    <div className={`data-notice-v4 ${canonical ? "canonical" : "cached"}`}>
      <span className={canonical ? "live-dot" : "warn-dot"} />
      <div>
        <strong>{canonical ? "Estado canônico carregado" : degraded ? "Modo degradado" : "Cache deste aparelho"}</strong>
        <small>
          {generatedAt ? new Date(generatedAt).toLocaleString("pt-BR") : "Sem resumo cross-device carregado"}
        </small>
      </div>
    </div>
  );
}
