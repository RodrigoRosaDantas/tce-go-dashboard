import { useEffect, useMemo, useRef, useState } from "react";
import type { Snapshot } from "../types";
import { publicRoute } from "../data";
import { extractStudyToc, href, publishedDays } from "./shared";
import { useOperational } from "../v4/OperationalContext";

const primaryNav = [
  ["/", "Home", "⌂"],
  ["/hoje/", "Hoje", "◎"],
  ["/dias/", "Trilha", "▤"],
  ["/revisoes/", "Revisões", "↻"],
] as const;

const diagnosticNav = [
  ["/mentor/", "Mentor", "◇"],
  ["/erros/", "Caderno de erros", "!"],
  ["/desempenho/", "Desempenho", "◔"],
  ["/riscos/", "Riscos", "△"],
] as const;

const proofNav = [
  ["/redacoes/", "Redações"],
  ["/simulados/", "Simulados"],
  ["/edital/", "Edital verticalizado"],
  ["/legislacao/", "Legislação"],
  ["/reta-final/", "Reta final"],
] as const;

const systemNav = [
  ["/sync/", "Sistema e sincronização"],
] as const;

type SearchItem = {
  label: string;
  detail: string;
  href: string;
  group: string;
  keywords: string;
};

export function Shell({ snapshot, children }: { snapshot: Snapshot; children: React.ReactNode }) {
  const route = publicRoute(window.location.pathname);
  const { summary } = useOperational();
  const isCurrent = (path: string) => {
    if (path === "/") return route === "/";
    if (path === "/dias/") return route === "/dias/" || route.startsWith("/dia/") || route.startsWith("/questoes/");
    return route.startsWith(path);
  };
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const searchItems = useMemo<SearchItem[]>(() => {
    const routes: SearchItem[] = [
      ...primaryNav.map(([path, label]) => ({ label, detail: "Navegação principal", href: path, group: "Navegação", keywords: label })),
      ...diagnosticNav.map(([path, label]) => ({ label, detail: "Diagnóstico", href: path, group: "Diagnóstico", keywords: label })),
      ...proofNav.map(([path, label]) => ({ label, detail: "Prova", href: path, group: "Prova", keywords: label })),
      ...systemNav.map(([path, label]) => ({ label, detail: "Sistema", href: path, group: "Sistema", keywords: label })),
    ];
    const published = publishedDays(snapshot);
    const sessions = published.map((day) => ({
      label: `${day.session ?? "Sessão"} · ${day.dxx}`,
      detail: day.focus,
      href: `/dia/${day.dxx.toLowerCase()}/`,
      group: "Sessões",
      keywords: `${day.session} ${day.dxx} ${day.focus} ${day.type}`,
    }));

    const content: SearchItem[] = [];
    for (const day of published) {
      if (!day.slug) continue;
      const material = snapshot.materials[day.slug];
      if (!material?.contentHtml) continue;
      const toc = extractStudyToc(material.contentHtml);
      const sections = material.sections ?? [];
      for (const item of toc) {
        const section = sections.find((candidate) => candidate.heading.trim().toLocaleLowerCase("pt-BR") === item.label.trim().toLocaleLowerCase("pt-BR"));
        content.push({
          label: item.label,
          detail: `${day.session} · ${day.dxx} · Material`,
          href: `/dia/${day.dxx.toLowerCase()}/#${item.id}`,
          group: "Conteúdo",
          keywords: `${day.focus} ${item.label} ${section?.body || ""}`.slice(0, 12000),
        });
      }

      if (day.questionSlug) {
        const question = snapshot.questions[day.questionSlug];
        if (question?.contentHtml) {
          const qtoc = extractStudyToc(question.contentHtml);
          const qsections = question.sections ?? [];
          for (const item of qtoc) {
            const section = qsections.find((candidate) => candidate.heading.trim().toLocaleLowerCase("pt-BR") === item.label.trim().toLocaleLowerCase("pt-BR"));
            content.push({
              label: item.label,
              detail: `${question.qxx} · ${day.dxx} · Questões`,
              href: `/questoes/${day.questionSlug}/#${item.id}`,
              group: "Questões",
              keywords: `${question.title} ${item.label} ${section?.body || ""}`.slice(0, 12000),
            });
          }
        }
      }
    }

    const edital: SearchItem[] = (snapshot.edital ?? []).map((item) => ({
      label: `${item.code} · ${item.discipline}`,
      detail: `${item.block} · ${item.questions} questão(ões) · peso ${item.weight}`,
      href: "/edital/",
      group: "Edital",
      keywords: `${item.code} ${item.discipline} ${item.block} ${item.normativeSource}`,
    }));

    const legislation: SearchItem[] = (snapshot.legislation ?? []).map((item) => ({
      label: item.title,
      detail: `${item.code} · ${item.category}${item.dxx ? ` · ${item.dxx}` : ""}`,
      href: "/legislacao/",
      group: "Legislação",
      keywords: `${item.code} ${item.title} ${item.category} ${item.cutoff} ${item.use} ${item.dxx}`,
    }));

    const revisions: SearchItem[] = summary.reviews.map((item) => ({
      label: `${item.type} · ${item.dxx}`,
      detail: item.reason || item.status,
      href: "/revisoes/",
      group: "Revisões",
      keywords: `${item.type} ${item.dxx} ${item.status} ${item.reason || ""} ${item.notes || ""}`,
    }));
    const errors: SearchItem[] = summary.errors.map((item) => ({
      label: item.topic ? `${item.subject || "Sem matéria"} · ${item.topic}` : item.error,
      detail: `${item.dxx || "sem Dxx"} · ${item.severity || "sem severidade"} · ${item.status}`,
      href: "/erros/",
      group: "Erros",
      keywords: `${item.error} ${item.subject || ""} ${item.topic || ""} ${item.reason || ""} ${item.action || ""} ${item.dxx || ""}`,
    }));

    return [...routes, ...sessions, ...content, ...edital, ...legislation, ...revisions, ...errors];
  }, [snapshot, summary]);

  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    if (!normalized) return searchItems.slice(0, 10);
    const terms = normalized.split(/\s+/).filter(Boolean);
    return searchItems
      .map((item) => {
        const label = item.label.toLocaleLowerCase("pt-BR");
        const detail = item.detail.toLocaleLowerCase("pt-BR");
        const keywords = item.keywords.toLocaleLowerCase("pt-BR");
        const matched = terms.every((term) => label.includes(term) || detail.includes(term) || keywords.includes(term));
        const score = matched ? terms.reduce((sum, term) => (
          sum + (label.includes(term) ? 8 : 0) + (detail.includes(term) ? 4 : 0) + (keywords.includes(term) ? 1 : 0)
        ), 0) : -1;
        return { item, score };
      })
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label, "pt-BR"))
      .slice(0, 18)
      .map((entry) => entry.item);
  }, [query, searchItems]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing = target?.matches("input, textarea, select, [contenteditable='true']");
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      } else if (!editing && event.key === "/") {
        event.preventDefault();
        setSearchOpen(true);
      } else if (event.key === "Escape") {
        setSearchOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(timer);
  }, [searchOpen]);

  return (
    <div className="app-v3">
      <header className="topbar-v3">
        <a className="brand-v3" href={href("/")}>
          <span className="brand-seal">TC</span>
          <span><strong>TCE-GO</strong><small>Técnico de Controle Externo</small></span>
        </a>
        <div className="topbar-context">
          <span className="context-kicker">EDITAL ABERTO · FCC</span>
          <strong>Prova 17/01/2027 · S01–S47</strong>
        </div>
        <div className="topbar-actions">
          <button className="search-trigger" type="button" onClick={() => setSearchOpen(true)}>
            <span>⌕</span><b>Buscar</b><kbd>Ctrl K</kbd>
          </button>
          <a className="sync-trigger" href={href("/sync/")} aria-label="Status de sincronização">
            <span className="live-dot" /> <small>Snapshot</small>
          </a>
        </div>
      </header>

      <div className="shell-v3">
        <aside className="sidebar-v3">
          <nav>
            <div className="nav-group">
              <span className="nav-label">Executar</span>
              {primaryNav.map(([path, label, icon]) => (
                <a key={path} href={href(path)} className={isCurrent(path) ? "active" : ""} aria-current={isCurrent(path) ? "page" : undefined}>
                  <span className="nav-icon">{icon}</span><span>{label}</span>
                </a>
              ))}
            </div>
            <div className="nav-group">
              <span className="nav-label">Diagnosticar</span>
              {diagnosticNav.map(([path, label, icon]) => (
                <a key={path} href={href(path)} className={isCurrent(path) ? "active compact" : "compact"} aria-current={isCurrent(path) ? "page" : undefined}>
                  <span className="nav-icon">{icon}</span><span>{label}</span>
                </a>
              ))}
            </div>
            <div className="nav-group">
              <span className="nav-label">Prova</span>
              {proofNav.map(([path, label]) => (
                <a key={path} href={href(path)} className={isCurrent(path) ? "active compact" : "compact"} aria-current={isCurrent(path) ? "page" : undefined}>{label}</a>
              ))}
            </div>
            <div className="nav-group">
              <span className="nav-label">Sistema</span>
              {systemNav.map(([path, label]) => (
                <a key={path} href={href(path)} className={isCurrent(path) ? "active compact" : "compact"} aria-current={isCurrent(path) ? "page" : undefined}>{label}</a>
              ))}
            </div>
          </nav>
          <div className="sidebar-status">
            <span className="live-dot" />
            <div><strong>Notion → snapshot</strong><small>{new Date(snapshot.generatedAt).toLocaleString("pt-BR")}</small></div>
          </div>
        </aside>

        <main className="main-v3">{children}</main>
      </div>

      <nav className="bottom-nav-v3" aria-label="Navegação móvel">
        {primaryNav.map(([path, label, icon]) => (
          <a key={path} href={href(path)} className={isCurrent(path) ? "active" : ""} aria-current={isCurrent(path) ? "page" : undefined}>
            <span>{icon}</span><small>{label}</small>
          </a>
        ))}
        <details className="bottom-more">
          <summary><span>•••</span><small>Mais</small></summary>
          <div className="bottom-more-sheet">
            <div className="sheet-handle" />
            <strong>Mais áreas</strong>
            {[...diagnosticNav, ...proofNav, ...systemNav].map(([path, label]) => <a key={path} href={href(path)}>{label}</a>)}
          </div>
        </details>
      </nav>

      {searchOpen ? (
        <div className="command-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) setSearchOpen(false);
        }}>
          <section className="command-palette" role="dialog" aria-modal="true" aria-label="Busca e navegação">
            <header>
              <span>⌕</span>
              <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Busque art. 71, apreciar × julgar, D001, revisão…" />
              <button type="button" onClick={() => setSearchOpen(false)}>Esc</button>
            </header>
            <div className="command-results">
              {results.length ? results.map((item) => (
                <a key={`${item.group}-${item.href}`} href={href(item.href)}>
                  <span className="result-group">{item.group}</span>
                  <div><strong>{item.label}</strong><small>{item.detail}</small></div>
                  <span>→</span>
                </a>
              )) : <div className="command-empty">Nenhum resultado para “{query}”.</div>}
            </div>
            <footer><span><kbd>Ctrl K</kbd> abrir</span><span><kbd>Esc</kbd> fechar</span><span>Busca local em aulas, Qxx, edital e legislação</span></footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}
