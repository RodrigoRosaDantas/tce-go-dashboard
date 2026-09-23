import type { Snapshot } from "./types";

let cache: Promise<Snapshot> | null = null;

export function loadSnapshot(): Promise<Snapshot> {
  if (!cache) {
    const url = `${import.meta.env.BASE_URL}data/tce-go-snapshot.json`;
    cache = fetch(url, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error(`Falha ao carregar snapshot: ${response.status}`);
      return response.json() as Promise<Snapshot>;
    });
  }
  return cache;
}

export function publicRoute(pathname: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  if (base && pathname.startsWith(base)) {
    return pathname.slice(base.length) || "/";
  }
  return pathname || "/";
}
