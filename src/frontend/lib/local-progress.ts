/**
 * Local_Progress: the Visitor's session history, kept only in this browser's
 * localStorage. It is never sent to the API; only an individual Session_Key
 * appears in the path of the request that needs it.
 */
export const LOCAL_PROGRESS_KEY = "opsatlas.localProgress.v1";
export const MAX_ENTRIES = 200;
const STORAGE_VERSION = 1;
const SESSION_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface LocalProgressEntry {
  /** 43-char base64url Session_Key. */
  sessionKey: string;
  scenarioId: string;
  scenarioTitle: string;
  /** ISO 8601. */
  startedAt: string;
}

/** window.localStorage in the browser, a Map-backed object in tests. */
export interface ProgressStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function isSessionKey(value: unknown): value is string {
  return typeof value === "string" && SESSION_KEY_PATTERN.test(value);
}

function isEntry(value: unknown): value is LocalProgressEntry {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    isSessionKey(v["sessionKey"]) &&
    typeof v["scenarioId"] === "string" &&
    v["scenarioId"] !== "" &&
    typeof v["scenarioTitle"] === "string" &&
    typeof v["startedAt"] === "string" &&
    !Number.isNaN(Date.parse(v["startedAt"]))
  );
}

/** Newest first by startedAt; ties broken by sessionKey so the order is total. */
export function compareEntries(a: LocalProgressEntry, b: LocalProgressEntry): number {
  const diff = Date.parse(b.startedAt) - Date.parse(a.startedAt);
  if (diff !== 0) return diff;
  return a.sessionKey < b.sessionKey ? -1 : a.sessionKey > b.sessionKey ? 1 : 0;
}

function normalise(candidates: readonly unknown[]): LocalProgressEntry[] {
  const seen = new Set<string>();
  const out: LocalProgressEntry[] = [];
  for (const c of candidates) {
    if (!isEntry(c) || seen.has(c.sessionKey)) continue;
    seen.add(c.sessionKey);
    out.push({
      sessionKey: c.sessionKey,
      scenarioId: c.scenarioId,
      scenarioTitle: c.scenarioTitle,
      startedAt: c.startedAt,
    });
  }
  return out.sort(compareEntries).slice(0, MAX_ENTRIES);
}

/** Never throws. Missing, unparsable or wrong-version data yields []. */
export function readProgress(store: ProgressStore): LocalProgressEntry[] {
  try {
    const raw = store.getItem(LOCAL_PROGRESS_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return [];
    const p = parsed as Record<string, unknown>;
    if (p["version"] !== STORAGE_VERSION || !Array.isArray(p["entries"])) return [];
    return normalise(p["entries"] as unknown[]);
  } catch {
    return [];
  }
}

/** Idempotent per sessionKey; keeps newest first and at most MAX_ENTRIES. */
export function addProgress(
  store: ProgressStore,
  entry: LocalProgressEntry,
): LocalProgressEntry[] {
  const current = readProgress(store);
  if (!isEntry(entry) || current.some((e) => e.sessionKey === entry.sessionKey)) return current;
  const next = normalise([...current, entry]);
  store.setItem(LOCAL_PROGRESS_KEY, JSON.stringify({ version: STORAGE_VERSION, entries: next }));
  return next;
}

export function clearProgress(store: ProgressStore): void {
  store.removeItem(LOCAL_PROGRESS_KEY);
}

/**
 * Browser store that uses localStorage and falls back to an in-memory map for
 * the tab when localStorage throws (disabled storage, quota, private mode).
 */
export class BrowserProgressStore implements ProgressStore {
  private readonly memory = new Map<string, string>();
  private fellBack = false;

  /** True once localStorage failed; progress then lasts only for this tab. */
  get degraded(): boolean {
    return this.fellBack;
  }

  private local(): Storage | null {
    try {
      return typeof window === "undefined" ? null : window.localStorage;
    } catch {
      return null;
    }
  }

  getItem(key: string): string | null {
    if (!this.fellBack) {
      try {
        const s = this.local();
        if (s !== null) return s.getItem(key);
      } catch {
        // fall through
      }
      this.fellBack = true;
    }
    return this.memory.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (!this.fellBack) {
      try {
        const s = this.local();
        if (s !== null) {
          s.setItem(key, value);
          return;
        }
      } catch {
        // fall through
      }
      this.fellBack = true;
    }
    this.memory.set(key, value);
  }

  removeItem(key: string): void {
    this.memory.delete(key);
    try {
      this.local()?.removeItem(key);
    } catch {
      this.fellBack = true;
    }
  }
}

let shared: BrowserProgressStore | null = null;

/** Tab-wide store so the in-memory fallback survives across components. */
export function getBrowserStore(): BrowserProgressStore {
  shared ??= new BrowserProgressStore();
  return shared;
}
