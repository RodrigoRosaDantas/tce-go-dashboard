import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Snapshot } from "../types";
import {
  cachedOperationalSummary,
  cachedProgress,
  hasConnectedAccount,
  loadOperationalSummary,
  type OperationalSummary,
  type ProgressState,
} from "../progress";

type OperationalContextValue = {
  summary: OperationalSummary;
  loading: boolean;
  connected: boolean;
  refresh: () => Promise<void>;
  progressFor: (dxx: string) => ProgressState | null;
};

const OperationalContext = createContext<OperationalContextValue | null>(null);

function localFallback(snapshot: Snapshot): OperationalSummary {
  const progress = snapshot.days
    .filter((day) => !day.protected)
    .map((day) => cachedProgress(day.dxx))
    .filter((state): state is ProgressState => Boolean(state));

  return {
    generatedAt: new Date().toISOString(),
    canonical: false,
    source: "cache",
    degraded: true,
    progress,
    dayControl: [],
    sessions: [],
    reviews: [],
    errors: [],
    redactions: [],
    simulations: [],
  };
}

export function OperationalProvider({
  snapshot,
  children,
}: {
  snapshot: Snapshot;
  children: React.ReactNode;
}) {
  const [summary, setSummary] = useState<OperationalSummary>(() => cachedOperationalSummary() ?? localFallback(snapshot));
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(() => hasConnectedAccount());
  const refreshInFlight = useRef<Promise<void> | null>(null);
  const lastRefreshAt = useRef(0);

  const refresh = useCallback(async () => {
    if (!connected) {
      setSummary(cachedOperationalSummary() ?? localFallback(snapshot));
      return;
    }
    if (refreshInFlight.current) return refreshInFlight.current;
    const task = (async () => {
      setLoading(true);
      try {
        const next = await loadOperationalSummary();
        setSummary(next ?? cachedOperationalSummary() ?? localFallback(snapshot));
        lastRefreshAt.current = Date.now();
      } finally {
        setLoading(false);
        refreshInFlight.current = null;
      }
    })();
    refreshInFlight.current = task;
    return task;
  }, [connected, snapshot]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const dirty = () => void refresh();
    const visible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastRefreshAt.current > 60_000) void refresh();
    };
    const storage = (event: StorageEvent) => {
      if (event.key === "plataforma.questoes.supabase.session.v1") {
        setConnected(hasConnectedAccount());
        return;
      }
      if (event.key?.startsWith("tce-go.")) void refresh();
    };
    window.addEventListener("online", dirty);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("tce-operational-dirty", dirty);
    window.addEventListener("tce-progress-confirmed", dirty);
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener("online", dirty);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("tce-operational-dirty", dirty);
      window.removeEventListener("tce-progress-confirmed", dirty);
      window.removeEventListener("storage", storage);
    };
  }, [refresh]);

  const progressMap = useMemo(
    () => new Map(summary.progress.map((state) => [state.dxx, state])),
    [summary.progress],
  );

  const value = useMemo<OperationalContextValue>(() => ({
    summary,
    loading,
    connected,
    refresh,
    progressFor: (dxx) => progressMap.get(dxx) ?? cachedProgress(dxx),
  }), [summary, loading, connected, refresh, progressMap]);

  return <OperationalContext.Provider value={value}>{children}</OperationalContext.Provider>;
}

export function useOperational() {
  const value = useContext(OperationalContext);
  if (!value) throw new Error("useOperational exige OperationalProvider");
  return value;
}
