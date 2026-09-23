import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
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
  const connected = hasConnectedAccount();

  const refresh = useCallback(async () => {
    if (!connected) {
      setSummary(cachedOperationalSummary() ?? localFallback(snapshot));
      return;
    }
    setLoading(true);
    const next = await loadOperationalSummary();
    setSummary(next ?? cachedOperationalSummary() ?? localFallback(snapshot));
    setLoading(false);
  }, [connected, snapshot]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const dirty = () => void refresh();
    const storage = (event: StorageEvent) => {
      if (event.key?.startsWith("tce-go.") || event.key === "plataforma.questoes.supabase.session.v1") void refresh();
    };
    window.addEventListener("online", dirty);
    window.addEventListener("tce-operational-dirty", dirty);
    window.addEventListener("tce-progress-confirmed", dirty);
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener("online", dirty);
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
