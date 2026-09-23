import { useEffect, useMemo, useState } from "react";

type Theme = "system" | "light" | "dark" | "sepia";
type TextScale = "small" | "normal" | "large";
type ReaderWidth = "narrow" | "normal" | "wide";

type ReadingPrefs = {
  theme: Theme;
  textScale: TextScale;
  width: ReaderWidth;
  focus: boolean;
  reduceMotion: boolean;
};

const PREFS_KEY = "tce-go.v3.reading-prefs";
const defaultPrefs: ReadingPrefs = {
  theme: "system",
  textScale: "normal",
  width: "normal",
  focus: false,
  reduceMotion: false,
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* local storage indisponível */ }
}

function normalizePrefs(value: Partial<ReadingPrefs> | null | undefined): ReadingPrefs {
  const theme = value?.theme === "light" || value?.theme === "dark" || value?.theme === "sepia" ? value.theme : "system";
  const textScale = value?.textScale === "small" || value?.textScale === "large" ? value.textScale : "normal";
  const width = value?.width === "narrow" || value?.width === "wide" ? value.width : "normal";
  return {
    theme,
    textScale,
    width,
    focus: value?.focus === true,
    reduceMotion: value?.reduceMotion === true,
  };
}

function applyPrefs(prefs: ReadingPrefs) {
  const root = document.documentElement;
  root.dataset.tceTheme = prefs.theme;
  root.dataset.tceText = prefs.textScale;
  root.dataset.tceReaderWidth = prefs.width;
  root.dataset.tceFocus = String(prefs.focus);
  root.dataset.tceReduceMotion = String(prefs.reduceMotion);
}

export function ReadingControls() {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<ReadingPrefs>(defaultPrefs);

  useEffect(() => {
    const stored = normalizePrefs(readJson<ReadingPrefs>(PREFS_KEY, defaultPrefs));
    setPrefs(stored);
    applyPrefs(stored);
    return () => {
      document.documentElement.dataset.tceFocus = "false";
    };
  }, []);

  function update(patch: Partial<ReadingPrefs>) {
    const next = normalizePrefs({ ...prefs, ...patch });
    setPrefs(next);
    writeJson(PREFS_KEY, next);
    applyPrefs(next);
  }

  return (
    <div className="reader-settings">
      <button
        type="button"
        className="tool-button"
        aria-expanded={open}
        aria-controls="reader-settings-panel"
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">Aa</span>
        <span>Leitura</span>
      </button>
      {open ? (
        <div className="reader-settings-panel" id="reader-settings-panel" role="dialog" aria-label="Conforto de leitura">
          <div className="settings-head">
            <div><strong>Conforto de leitura</strong><small>Salvo neste aparelho</small></div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Fechar">×</button>
          </div>
          <label>
            <span>Aparência</span>
            <select value={prefs.theme} onChange={(event) => update({ theme: event.target.value as Theme })}>
              <option value="system">Sistema</option>
              <option value="light">Claro</option>
              <option value="sepia">Conforto</option>
              <option value="dark">Escuro</option>
            </select>
          </label>
          <label>
            <span>Tamanho do texto</span>
            <select value={prefs.textScale} onChange={(event) => update({ textScale: event.target.value as TextScale })}>
              <option value="small">Compacto</option>
              <option value="normal">Normal</option>
              <option value="large">Grande</option>
            </select>
          </label>
          <label>
            <span>Largura da leitura</span>
            <select value={prefs.width} onChange={(event) => update({ width: event.target.value as ReaderWidth })}>
              <option value="narrow">Estreita</option>
              <option value="normal">Normal</option>
              <option value="wide">Ampla</option>
            </select>
          </label>
          <label className="settings-check">
            <input type="checkbox" checked={prefs.focus} onChange={(event) => update({ focus: event.target.checked })} />
            <span>Modo foco<small>Oculta navegação durante a leitura</small></span>
          </label>
          <label className="settings-check">
            <input type="checkbox" checked={prefs.reduceMotion} onChange={(event) => update({ reduceMotion: event.target.checked })} />
            <span>Reduzir movimento<small>Menos transições e animações</small></span>
          </label>
          <button type="button" className="text-action" onClick={() => update(defaultPrefs)}>Restaurar padrão</button>
        </div>
      ) : null}
    </div>
  );
}

type TimerState = {
  elapsedSeconds: number;
  runningSince: number | null;
};

function timerKey(dxx: string) {
  return `tce-go.v3.timer.${dxx}`;
}

function normalizedTimer(value: TimerState | null | undefined): TimerState {
  return {
    elapsedSeconds: Math.max(0, Math.round(Number(value?.elapsedSeconds) || 0)),
    runningSince: typeof value?.runningSince === "number" ? value.runningSince : null,
  };
}

function currentElapsed(timer: TimerState, now = Date.now()) {
  return timer.elapsedSeconds + (timer.runningSince ? Math.max(0, Math.floor((now - timer.runningSince) / 1000)) : 0);
}

function clock(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return [hours, minutes, rest].map((value) => String(value).padStart(2, "0")).join(":");
}

export function StudyTimer({ dxx }: { dxx: string }) {
  const [timer, setTimer] = useState<TimerState>({ elapsedSeconds: 0, runningSince: null });
  const [now, setNow] = useState(Date.now());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = normalizedTimer(readJson<TimerState>(timerKey(dxx), { elapsedSeconds: 0, runningSince: null }));
    setTimer(stored);
    setNow(Date.now());
    setHydrated(true);
  }, [dxx]);

  useEffect(() => {
    if (!timer.runningSince) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [timer.runningSince]);

  useEffect(() => {
    if (!hydrated) return;
    writeJson(timerKey(dxx), timer);
  }, [dxx, hydrated, timer]);

  const seconds = currentElapsed(timer, now);

  function start() {
    if (timer.runningSince) return;
    setTimer((value) => ({ ...value, runningSince: Date.now() }));
  }

  function pause() {
    setTimer((value) => ({
      elapsedSeconds: currentElapsed(value),
      runningSince: null,
    }));
  }

  function reset() {
    setTimer({ elapsedSeconds: 0, runningSince: null });
  }

  function sendToRegister() {
    const minutes = Math.max(1, Math.round(seconds / 60));
    window.dispatchEvent(new CustomEvent("tce-study-time", { detail: { dxx, minutes } }));
    document.getElementById("registro")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="study-timer" aria-label="Cronômetro da sessão">
      <div><span>Tempo da sessão</span><strong>{clock(seconds)}</strong></div>
      <div className="timer-actions">
        {timer.runningSince ? (
          <button type="button" onClick={pause}>Pausar</button>
        ) : (
          <button type="button" onClick={start}>Iniciar</button>
        )}
        <button type="button" onClick={sendToRegister} disabled={seconds < 1}>Usar no fechamento</button>
        <button type="button" className="subtle" onClick={reset} disabled={seconds < 1}>Zerar</button>
      </div>
    </div>
  );
}

function checklistKey(dxx: string) {
  return `tce-go.v3.checklist.${dxx}`;
}

const checklistItems = [
  ["material", "Material", "Entendi o núcleo e consigo explicar sem apoio."],
  ["questoes", "Questões", "Resolvi a bateria prevista sem abrir o gabarito antes."],
  ["d0", "Correção + D0", "Corrigi causa do erro e fiz recuperação ativa."],
] as const;

export function SessionChecklist({ dxx }: { dxx: string }) {
  const [state, setState] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setState(readJson<Record<string, boolean>>(checklistKey(dxx), {}));
  }, [dxx]);

  function toggle(id: string, checked: boolean) {
    const next = { ...state, [id]: checked };
    setState(next);
    writeJson(checklistKey(dxx), next);
  }

  const done = checklistItems.filter(([id]) => state[id]).length;

  return (
    <section className="session-checklist" aria-label="Checklist da sessão">
      <header><div><span>Execução</span><strong>{done}/3 etapas</strong></div><small>Controle local; não conclui o Dxx automaticamente.</small></header>
      <div className="checklist-grid">
        {checklistItems.map(([id, title, detail], index) => (
          <label key={id} className={state[id] ? "done" : ""}>
            <input type="checkbox" checked={Boolean(state[id])} onChange={(event) => toggle(id, event.target.checked)} />
            <b>{index + 1}</b>
            <span><strong>{title}</strong><small>{detail}</small></span>
          </label>
        ))}
      </div>
    </section>
  );
}

function readerKey(dxx: string) {
  return `tce-go.v3.reader.${dxx}`;
}

type ReaderState = { scrollY: number; progress: number };

export function ReadingProgress({ dxx, targetId = "aula" }: { dxx: string; targetId?: string }) {
  const [progress, setProgress] = useState(0);
  const saved = useMemo(() => readJson<ReaderState>(readerKey(dxx), { scrollY: 0, progress: 0 }), [dxx]);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const target = document.getElementById(targetId);
        if (!target) return;
        const top = window.scrollY + target.getBoundingClientRect().top;
        const end = top + target.offsetHeight - window.innerHeight * 0.7;
        const value = end <= top ? 100 : Math.max(0, Math.min(100, Math.round(((window.scrollY - top + 140) / (end - top)) * 100)));
        setProgress(value);
        writeJson(readerKey(dxx), { scrollY: window.scrollY, progress: value });
      });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [dxx, targetId]);

  function resume() {
    const state = readJson<ReaderState>(readerKey(dxx), saved);
    if (state.scrollY > 0) window.scrollTo({ top: state.scrollY, behavior: "smooth" });
  }

  return (
    <div className="reading-progress-widget">
      <div className="reading-progress-copy">
        <span>Leitura</span>
        <strong>{progress}%</strong>
        {saved.scrollY > 0 ? <button type="button" onClick={resume}>Retomar</button> : null}
      </div>
      <div className="reading-progress-track"><span style={{ width: `${progress}%` }} /></div>
    </div>
  );
}


export type StudyTocItem = { id: string; label: string; level: number };

type SectionState = {
  completed: string[];
  bookmark: string | null;
};

function sectionKey(dxx: string) {
  return `tce-go.v4.sections.${dxx}`;
}

export function SessionIndex({ dxx, toc }: { dxx: string; toc: StudyTocItem[] }) {
  const [state, setState] = useState<SectionState>({ completed: [], bookmark: null });
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    setState(readJson<SectionState>(sectionKey(dxx), { completed: [], bookmark: null }));
  }, [dxx]);

  useEffect(() => {
    if (!toc.length) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a,b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]?.target?.id) setActiveId(visible[0].target.id);
    }, { rootMargin: "-22% 0px -66% 0px", threshold: [0, 1] });
    for (const item of toc) {
      const node = document.getElementById(item.id);
      if (node) observer.observe(node);
    }
    return () => observer.disconnect();
  }, [toc]);

  function update(next: SectionState) {
    setState(next);
    writeJson(sectionKey(dxx), next);
  }

  function toggleCompleted(id: string) {
    const completed = state.completed.includes(id)
      ? state.completed.filter((value) => value !== id)
      : [...state.completed, id];
    update({ ...state, completed });
  }

  function toggleBookmark(id: string) {
    update({ ...state, bookmark: state.bookmark === id ? null : id });
  }

  const done = toc.filter((item) => state.completed.includes(item.id)).length;

  return (
    <aside className="lesson-index lesson-index-v4">
      <div className="index-head"><span>ÍNDICE</span><strong>{done}/{toc.length}</strong></div>
      <a href="#visao-geral">Visão geral</a>
      {toc.map((item) => {
        const completed = state.completed.includes(item.id);
        const bookmarked = state.bookmark === item.id;
        return (
          <div className={`index-item-v4 ${activeId === item.id ? "active" : ""} ${completed ? "completed" : ""}`} key={item.id}>
            <a className={item.level === 3 ? "level-3" : ""} href={`#${item.id}`}>{item.label}</a>
            <div>
              <button type="button" title={completed ? "Desmarcar seção" : "Marcar seção lida"} onClick={() => toggleCompleted(item.id)}>{completed ? "✓" : "○"}</button>
              <button type="button" title={bookmarked ? "Remover bookmark" : "Salvar bookmark"} onClick={() => toggleBookmark(item.id)}>{bookmarked ? "★" : "☆"}</button>
            </div>
          </div>
        );
      })}
      {state.bookmark ? <button type="button" className="index-resume-v4" onClick={() => document.getElementById(state.bookmark || "")?.scrollIntoView({ behavior: "smooth", block: "start" })}>Ir ao bookmark ★</button> : null}
      <a href="#questoes">Questões</a>
      <a href="#registro">Fechamento + D0</a>
      <small className="index-local-note-v4">✓/★ ficam somente neste aparelho.</small>
    </aside>
  );
}

function noteKey(dxx: string) {
  return `tce-go.v4.notes.${dxx}`;
}

export function StudyNotebook({ dxx }: { dxx: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    setNote(readJson<string>(noteKey(dxx), ""));
  }, [dxx]);

  function change(value: string) {
    setNote(value);
    writeJson(noteKey(dxx), value);
  }

  return (
    <div className="study-notebook-v4">
      <button type="button" className="tool-button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span aria-hidden="true">✎</span><span>Notas</span>
      </button>
      {open ? (
        <div className="notebook-panel-v4">
          <div className="settings-head"><div><strong>Notas privadas da sessão</strong><small>Salvas somente neste aparelho; não são enviadas ao Notion.</small></div><button type="button" onClick={() => setOpen(false)}>×</button></div>
          <textarea value={note} onChange={(event) => change(event.target.value)} placeholder="Anote contraste, dúvida, referência ou lembrete…" />
          <small>{note.length} caracteres</small>
        </div>
      ) : null}
    </div>
  );
}

type RevisionPoint = { kind: "heading" | "callout" | "table"; label: string };

function revisionPoints(html?: string) {
  if (!html || typeof DOMParser === "undefined") return [] as RevisionPoint[];
  const doc = new DOMParser().parseFromString(html, "text/html");
  const nodes = Array.from(doc.querySelectorAll("h2, h3, .study-callout, blockquote, table"));
  return nodes.slice(0, 40).map((node) => {
    const tag = node.tagName.toLowerCase();
    const kind: RevisionPoint["kind"] = tag === "table" ? "table" : tag.startsWith("h") ? "heading" : "callout";
    const text = (node.textContent || "").replace(/\s+/g, " ").trim();
    return { kind, label: text.slice(0, kind === "table" ? 420 : 520) };
  }).filter((item) => item.label);
}

export function RevisionLens({ html }: { html?: string }) {
  const [open, setOpen] = useState(false);
  const points = useMemo(() => revisionPoints(html), [html]);

  if (!points.length) return null;

  return (
    <section className={`revision-lens-v4 ${open ? "open" : ""}`}>
      <button type="button" className="revision-lens-trigger-v4" onClick={() => setOpen((value) => !value)}>
        <span>↻</span><div><strong>Modo revisão</strong><small>Somente estrutura, contrastes, callouts e tabelas do material publicado.</small></div><b>{open ? "Fechar" : "Abrir"}</b>
      </button>
      {open ? <div className="revision-lens-body-v4">
        {points.map((point,index) => <article className={`revision-point-v4 ${point.kind}`} key={`${point.kind}-${index}`}>
          <b>{String(index + 1).padStart(2,"0")}</b><p>{point.label}</p>
        </article>)}
      </div> : null}
    </section>
  );
}

export function SectionNavigator({ toc }: { toc: StudyTocItem[] }) {
  const [activeId,setActiveId] = useState<string | null>(toc[0]?.id ?? null);

  useEffect(() => {
    if (!toc.length) return;
    const onScroll = () => {
      const y = window.scrollY + 190;
      let current = toc[0]?.id ?? null;
      for (const item of toc) {
        const node = document.getElementById(item.id);
        if (node && node.offsetTop <= y) current = item.id;
      }
      setActiveId(current);
    };
    onScroll();
    window.addEventListener("scroll",onScroll,{passive:true});
    return () => window.removeEventListener("scroll",onScroll);
  }, [toc]);

  if (!toc.length) return null;
  const index = Math.max(0,toc.findIndex((item)=>item.id===activeId));
  const prev=toc[index-1], next=toc[index+1];

  return (
    <nav className="section-nav-v4" aria-label="Navegação entre seções do material">
      <button type="button" disabled={!prev} onClick={() => prev && document.getElementById(prev.id)?.scrollIntoView({behavior:"smooth",block:"start"})}>← {prev?.label || "Início"}</button>
      <span>{index+1}/{toc.length}</span>
      <button type="button" disabled={!next} onClick={() => next && document.getElementById(next.id)?.scrollIntoView({behavior:"smooth",block:"start"})}>{next?.label || "Fim"} →</button>
    </nav>
  );
}
