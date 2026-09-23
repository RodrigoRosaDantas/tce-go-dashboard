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
