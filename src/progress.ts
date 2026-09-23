const SUPABASE_URL = "https://fqqkkyusnzhuuizahkww.supabase.co";
const SUPABASE_KEY = "sb_publishable_GfoaAPKtYuSu_UY6wE8jMg_XsVjdWU7";
const SESSION_KEY = "plataforma.questoes.supabase.session.v1";
const QUEUE_KEY = "tce-go.pending-events.v1";
const CACHE_KEY = "tce-go.confirmed-progress.v1";
const SUMMARY_CACHE_KEY = "tce-go.operational-summary.v2";
const ENDPOINT = `${SUPABASE_URL}/functions/v1/tce-progress`;

export type ProgressState = {
  dxx: string;
  sxx?: string | null;
  studied: boolean;
  completed: boolean;
  timeMinutes: number;
  questionsDone: number;
  correct: number;
  errors: number;
  doubts: number;
  status?: string | null;
  confirmedAt?: string | null;
  eventOccurredAt?: string | null;
  canonicalRevision?: string | null;
  canonical: boolean;
  source: "notion" | "cache";
};

export type OperationalDay = {
  id: string;
  dxx: string;
  sxx?: string | null;
  order: number;
  type?: string | null;
  protected: boolean;
  status?: string | null;
  focus?: string | null;
  studied: boolean;
  completed: boolean;
  plannedTime?: string | null;
  metaQuestions: number | null;
  timeMinutes: number | null;
  questionsDone: number | null;
  correct: number | null;
  errors: number | null;
  doubts: number | null;
  d7Triggered: boolean;
  d20Triggered: boolean;
  lastEditedAt?: string | null;
};

export type OperationalSession = {
  id: string;
  title: string;
  dxx?: string | null;
  sxx?: string | null;
  type?: string | null;
  eventType?: string | null;
  origin?: string | null;
  date?: string | null;
  timestamp?: string | null;
  timeMinutes: number | null;
  questions: number | null;
  correct: number | null;
  errors: number | null;
  doubts: number | null;
  sourceUrl?: string | null;
  notes?: string | null;
  lastEditedAt?: string | null;
};

export type OperationalReview = {
  id: string;
  title: string;
  dxx: string;
  type: string;
  status: string;
  reason?: string | null;
  plannedDate?: string | null;
  performedDate?: string | null;
  questions: number | null;
  correct: number | null;
  errors: number | null;
  notes?: string | null;
  lastEditedAt?: string | null;
};

export type OperationalError = {
  id: string;
  errorId?: string | null;
  dxx?: string | null;
  date?: string | null;
  status: string;
  error: string;
  questionId?: string | null;
  subject?: string | null;
  topic?: string | null;
  source?: string | null;
  reason?: string | null;
  severity?: string | null;
  recurrence: number | null;
  doubt: boolean;
  fatal: boolean;
  nextCheck?: string | null;
  action?: string | null;
  lastEditedAt?: string | null;
};

export type OperationalRedaction = {
  id: string;
  dxx: string;
  title: string;
  status: string;
  score: number | null;
  timeMinutes: number | null;
  lines: number | null;
  thematicCut: number | null;
  criticalInterpretation: number | null;
  progression: number | null;
  cohesion: number | null;
  morphosyntax: number | null;
  vocabulary: number | null;
  mainError?: string | null;
  theme?: string | null;
  date?: string | null;
  rewriteNeeded: boolean;
  lastEditedAt?: string | null;
};

export type OperationalSimulation = {
  id: string;
  dxx: string;
  title: string;
  decision?: string | null;
  type?: string | null;
  date?: string | null;
  ipi: number | null;
  generalTotal: number | null;
  generalCorrect: number | null;
  specificTotal: number | null;
  specificCorrect: number | null;
  openErrors: number | null;
  p1Open: number | null;
  recurrent: number | null;
  timeMinutes: number | null;
  coveragePlanned: number | null;
  coverageExecuted: number | null;
  sessionsPlanned: number | null;
  sessionsExecuted: number | null;
  controlExternalPct: number | null;
  caspPct: number | null;
  legislationPct: number | null;
  knownSubjectsPct: number | null;
  writingScore: number | null;
  weakKnownSubjects?: string | null;
  writingLoss?: string | null;
  timePerBlock?: string | null;
  notes?: string | null;
  lastEditedAt?: string | null;
};

export type OperationalSummary = {
  generatedAt: string;
  canonical: boolean;
  source: "notion" | "cache";
  degraded?: boolean;
  progress: ProgressState[];
  dayControl: OperationalDay[];
  sessions: OperationalSession[];
  reviews: OperationalReview[];
  errors: OperationalError[];
  redactions: OperationalRedaction[];
  simulations: OperationalSimulation[];
};

export type ProgressEvent = {
  dxx: string;
  sxx?: string | null;
  eventType: "progress.snapshot" | "questions.result" | "day.completed" | "day.reopened" | "review.snapshot" | "simulation.result" | "essay.result" | "error.capture";
  timestamp: string;
  origin: "tce-go-dashboard";
  idempotencyKey: string;
  baseCanonicalRevision?: string | null;
  payload: {
    studied?: boolean;
    completed?: boolean;
    timeMinutes?: number;
    questionsDone?: number;
    correct?: number;
    errors?: number;
    doubts?: number;
    notes?: string;
    sourceUrl?: string;
    [key: string]: unknown;
  };
  localStatus?: "pending" | "conflict";
  lastError?: string;
};

type StoredSession = { access_token: string; refresh_token: string; expires_at?: number };

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage indisponível */ }
}

function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function storedSession(): StoredSession | null {
  const session = readJson<StoredSession | null>(SESSION_KEY, null);
  return session?.access_token && session?.refresh_token ? session : null;
}

async function accessToken() {
  let session = storedSession();
  if (!session) return null;
  if (!session.expires_at || session.expires_at * 1000 > Date.now() + 60_000) return session.access_token;

  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  if (!response.ok) {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
  const data = await response.json();
  session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || session.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600),
  };
  writeJson(SESSION_KEY, session);
  return session.access_token;
}

export function hasConnectedAccount() {
  return Boolean(storedSession());
}

function cacheMap() {
  return readJson<Record<string, ProgressState>>(CACHE_KEY, {});
}

function saveCache(state: ProgressState) {
  const cache = cacheMap();
  cache[state.dxx] = state;
  writeJson(CACHE_KEY, cache);
}

export function cachedProgress(dxx: string) {
  return cacheMap()[dxx] ?? null;
}

export function cachedOperationalSummary() {
  return readJson<OperationalSummary | null>(SUMMARY_CACHE_KEY, null);
}

function saveOperationalSummary(summary: OperationalSummary) {
  writeJson(SUMMARY_CACHE_KEY, summary);
  for (const state of summary.progress || []) {
    if (state?.dxx) saveCache(state);
  }
  window.dispatchEvent(new CustomEvent("tce-operational-summary", { detail: summary }));
}

function invalidateOperationalSummary() {
  try { localStorage.removeItem(SUMMARY_CACHE_KEY); } catch { /* storage indisponível */ }
  window.dispatchEvent(new CustomEvent("tce-operational-dirty"));
}

export async function loadOperationalSummary() {
  const fallback = cachedOperationalSummary();
  if (!navigator.onLine) return fallback;

  try {
    const { response, data, authenticated } = await endpoint("?mode=summary");
    if (!authenticated || !response) return fallback;
    if (!response.ok || !data || !Array.isArray(data.progress)) return fallback;
    const summary: OperationalSummary = {
      generatedAt: String(data.generatedAt || new Date().toISOString()),
      canonical: data.canonical === true,
      source: data.source === "notion" ? "notion" : "cache",
      degraded: data.degraded === true,
      progress: Array.isArray(data.progress) ? data.progress as ProgressState[] : [],
      dayControl: Array.isArray(data.dayControl) ? data.dayControl as OperationalDay[] : [],
      sessions: Array.isArray(data.sessions) ? data.sessions as OperationalSession[] : [],
      reviews: Array.isArray(data.reviews) ? data.reviews as OperationalReview[] : [],
      errors: Array.isArray(data.errors) ? data.errors as OperationalError[] : [],
      redactions: Array.isArray(data.redactions) ? data.redactions as OperationalRedaction[] : [],
      simulations: Array.isArray(data.simulations) ? data.simulations as OperationalSimulation[] : [],
    };
    saveOperationalSummary(summary);
    return summary;
  } catch {
    return fallback;
  }
}

export function operationalProgress(summary: OperationalSummary | null | undefined, dxx: string) {
  return summary?.progress?.find((state) => state.dxx === dxx) ?? cachedProgress(dxx);
}

export function queuedEvents() {
  return readJson<ProgressEvent[]>(QUEUE_KEY, []);
}

function saveQueue(queue: ProgressEvent[]) {
  writeJson(QUEUE_KEY, queue);
  window.dispatchEvent(new CustomEvent("tce-progress-queue"));
}

function replaceQueued(event: ProgressEvent) {
  const queue = queuedEvents();
  const index = queue.findIndex((item) => item.idempotencyKey === event.idempotencyKey);
  if (index >= 0) queue[index] = event;
  else queue.push(event);
  saveQueue(queue);
}

function removeQueued(key: string) {
  saveQueue(queuedEvents().filter((item) => item.idempotencyKey !== key));
}

export function pendingCount(dxx?: string) {
  return queuedEvents().filter((event) => event.localStatus !== "conflict" && (!dxx || event.dxx === dxx)).length;
}

export function conflictCount(dxx?: string) {
  return queuedEvents().filter((event) => event.localStatus === "conflict" && (!dxx || event.dxx === dxx)).length;
}

async function endpoint(path = "", init: RequestInit = {}) {
  const token = await accessToken();
  if (!token) return { response: null, data: null, authenticated: false };
  const headers = new Headers(init.headers);
  headers.set("apikey", SUPABASE_KEY);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(`${ENDPOINT}${path}`, { ...init, headers });
  const data = await response.json().catch(() => null);
  return { response, data, authenticated: true };
}

export async function loadProgress(dxx: string) {
  if (!navigator.onLine) return cachedProgress(dxx);
  try {
    const { response, data, authenticated } = await endpoint(`?dxx=${encodeURIComponent(dxx)}`);
    if (!authenticated || !response) return cachedProgress(dxx);
    if (!response.ok || !data) return cachedProgress(dxx);
    if (data.dxx && typeof data.studied === "boolean") {
      const state = data as ProgressState;
      saveCache(state);
      return state;
    }
  } catch { /* cache abaixo */ }
  return cachedProgress(dxx);
}

export function createProgressEvent(input: Omit<ProgressEvent, "timestamp" | "origin" | "idempotencyKey" | "localStatus">): ProgressEvent {
  return {
    ...input,
    timestamp: new Date().toISOString(),
    origin: "tce-go-dashboard",
    idempotencyKey: uuid(),
    localStatus: "pending",
  };
}

export async function queueAndSync(event: ProgressEvent) {
  replaceQueued(event);
  return syncEvent(event);
}

async function syncEvent(event: ProgressEvent) {
  if (!navigator.onLine) return { status: "pending" as const, reason: "offline" };
  try {
    const { response, data, authenticated } = await endpoint("", { method: "POST", body: JSON.stringify(event) });
    if (!authenticated) return { status: "pending" as const, reason: "auth" };
    if (!response) return { status: "pending" as const, reason: "network" };

    if (response.ok && data?.status === "confirmed") {
      removeQueued(event.idempotencyKey);
      invalidateOperationalSummary();
      if (data.state) {
        saveCache({
          dxx: data.dxx,
          sxx: data.sxx,
          ...data.state,
          canonical: true,
          source: "notion",
          confirmedAt: data.confirmation?.confirmedAt ?? new Date().toISOString(),
          eventOccurredAt: data.confirmation?.occurredAt ?? event.timestamp,
          canonicalRevision: data.confirmation?.canonicalRevision ?? null,
        });
      }
      return { status: "confirmed" as const, data };
    }

    if (response.status === 409 || data?.status === "conflict") {
      replaceQueued({ ...event, localStatus: "conflict", lastError: data?.error || "Conflito com o estado canônico." });
      return { status: "conflict" as const, data };
    }

    replaceQueued({ ...event, localStatus: "pending", lastError: data?.message || data?.error || "Pendente de sincronização." });
    return { status: "pending" as const, reason: data?.reason || "server", data };
  } catch (error) {
    replaceQueued({ ...event, localStatus: "pending", lastError: error instanceof Error ? error.message : "Falha de rede." });
    return { status: "pending" as const, reason: "network" };
  }
}

export async function flushPending() {
  const queue = queuedEvents().filter((event) => event.localStatus !== "conflict");
  const results = [];
  for (const event of queue) results.push(await syncEvent(event));
  return results;
}

export function platformAccountUrl() {
  return "https://rodrigorosadantas.github.io/plataforma-questoes/?view=settings";
}

export function platformBatteryUrl(input: { dxx: string; sxx?: string | null; materia: string; topico: string; subtopico?: string | null; size?: number }) {
  const url = new URL("https://rodrigorosadantas.github.io/plataforma-questoes/");
  url.searchParams.set("view", "questions");
  url.searchParams.set("dxx", input.dxx);
  if (input.sxx) url.searchParams.set("sxx", input.sxx);
  url.searchParams.set("disciplina", input.materia);
  url.searchParams.set("assunto", input.topico);
  if (input.subtopico) url.searchParams.set("subassunto", input.subtopico);
  if (input.size && input.size > 0) url.searchParams.set("size", String(Math.round(input.size)));
  url.searchParams.set("autostart", "1");
  return url.href;
}
