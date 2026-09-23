import { useEffect, useMemo, useRef, useState } from "react";
import type { Snapshot } from "../types";
import { publicRoute } from "../data";
import { href, publishedDays } from "./shared";

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

type SearchItem = {
  label: string;
  detail: string;
  href: string;
  group: string;
  keywords: string;
};

export function Shell({ snapshot, children }: { snapshot: Snapshot; children: React.ReactNode }) {
  const route = publicRoute(window.location.pathname);
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
      ...studyNav.map(([path, label]) => ({ label, detail: "Treino", href: path, group: "Treino", keywords: label })),
      ...referenceNav.map(([path, label]) => ({ label, detail: "Referência", href: path, group: "Referência", keywords: label })),
    ];
    const sessions = publishedDays(snapshot).map((day) => ({
      label: `${day.session ?? "Sessão"} · ${day.dxx}`,
      detail: day.focus,
      href: `/dia/${day.dxx.toLowerCase()}/`,
      group: "Sessões",
      keywords: `${day.session} ${day.dxx} ${day.focus} ${day.type}`,
    }));
    return [...routes, ...sessions];
  }, [snapshot]);

  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    if (!normalized) return searchItems.slice(0, 10);
    const terms = normalized.split(/\s+/).filter(Boolean);
    return searchItems
      .map((item) => {
        const haystack = `${item.label} ${item.detail} ${item.keywords}`.toLocaleLowerCase("pt-BR");
        const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : -10), 0);
        return { item, score };
      })
      .filter((entry) => entry.score >= terms.length)
      .sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label, "pt-BR"))
      .slice(0, 14)
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
          <span className="context-kicker">Projeto 100 Dias</span>
          <strong>S01–S47 · execução pedagógica</strong>
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
              <span className="nav-label">Execução</span>
              {primaryNav.map(([path, label, icon]) => (
                <a key={path} href={href(path)} className={isCurrent(path) ? "active" : ""} aria-current={isCurrent(path) ? "page" : undefined}>
                  <span className="nav-icon">{icon}</span><span>{label}</span>
                </a>
              ))}
            </div>
            <div className="nav-group">
              <span className="nav-label">Treino</span>
              {studyNav.map(([path, label]) => (
                <a key={path} href={href(path)} className={isCurrent(path) ? "active compact" : "compact"} aria-current={isCurrent(path) ? "page" : undefined}>{label}</a>
              ))}
            </div>
            <div className="nav-group">
              <span className="nav-label">Referência</span>
              {referenceNav.map(([path, label]) => (
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
            {[...studyNav, ...referenceNav].map(([path, label]) => <a key={path} href={href(path)}>{label}</a>)}
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
              <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Busque D001, Controle Externo, revisão…" />
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
            <footer><span><kbd>Ctrl K</kbd> abrir</span><span><kbd>Esc</kbd> fechar</span><span>Busca local no snapshot publicado</span></footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}
