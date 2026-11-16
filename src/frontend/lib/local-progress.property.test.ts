import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  LOCAL_PROGRESS_KEY,
  MAX_ENTRIES,
  addProgress,
  clearProgress,
  isSessionKey,
  readProgress,
  type LocalProgressEntry,
  type ProgressStore,
} from "./local-progress";

class MapStore implements ProgressStore {
  readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".split("");
const sessionKey = fc
  .array(fc.constantFrom(...ALPHABET), { minLength: 43, maxLength: 43 })
  .map((cs) => cs.join(""));
const startedAt = fc
  .integer({ min: Date.UTC(2020, 0, 1), max: Date.UTC(2035, 0, 1) })
  .map((ms) => new Date(ms).toISOString());
const entry: fc.Arbitrary<LocalProgressEntry> = fc.record({
  sessionKey,
  scenarioId: fc.stringMatching(/^[a-z][a-z0-9-]{0,20}$/),
  scenarioTitle: fc.string({ maxLength: 40 }),
  startedAt,
});

/** Reference model: first entry per key wins, newest first, capped. */
function expected(entries: readonly LocalProgressEntry[]): LocalProgressEntry[] {
  const byKey = new Map<string, LocalProgressEntry>();
  for (const e of entries) if (!byKey.has(e.sessionKey)) byKey.set(e.sessionKey, e);
  return [...byKey.values()]
    .sort((a, b) => {
      const d = Date.parse(b.startedAt) - Date.parse(a.startedAt);
      return d !== 0 ? d : a.sessionKey < b.sessionKey ? -1 : 1;
    })
    .slice(0, MAX_ENTRIES);
}

// Feature: opsatlas-platform, Property 14: Local_Progress Round Trip
describe("Property 14: Local_Progress Round Trip", () => {
  it("reading returns the distinct entries, newest first, fields preserved", () => {
    fc.assert(
      fc.property(fc.array(entry, { maxLength: 40 }), (entries) => {
        const store = new MapStore();
        for (const e of entries) addProgress(store, e);
        expect(readProgress(store)).toEqual(expected(entries));
      }),
      { numRuns: 100 },
    );
  });

  it("caps at MAX_ENTRIES keeping the newest", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(entry, {
          minLength: MAX_ENTRIES + 1,
          maxLength: MAX_ENTRIES + 6,
          selector: (e) => e.sessionKey,
        }),
        (entries) => {
          const store = new MapStore();
          // Preload the first MAX_ENTRIES in one write, then add the rest through the API.
          store.setItem(
            LOCAL_PROGRESS_KEY,
            JSON.stringify({ version: 1, entries: entries.slice(0, MAX_ENTRIES) }),
          );
          for (const e of entries.slice(MAX_ENTRIES)) addProgress(store, e);
          const read = readProgress(store);
          expect(read).toHaveLength(MAX_ENTRIES);
          expect(read).toEqual(expected(entries));
        },
      ),
      { numRuns: 100 },
    );
  });

  it("adding an existing entry leaves the stored list unchanged", () => {
    fc.assert(
      fc.property(fc.array(entry, { minLength: 1, maxLength: 20 }), fc.nat(), (entries, i) => {
        const store = new MapStore();
        for (const e of entries) addProgress(store, e);
        const before = store.getItem(LOCAL_PROGRESS_KEY);
        const again = entries[i % entries.length] as LocalProgressEntry;
        addProgress(store, { ...again, scenarioTitle: "changed", startedAt: new Date(0).toISOString() });
        expect(store.getItem(LOCAL_PROGRESS_KEY)).toBe(before);
      }),
      { numRuns: 100 },
    );
  });

  it("never throws on arbitrary stored values and returns only well-formed entries", () => {
    const stored = fc.oneof(
      fc.string(),
      fc.json(),
      fc.anything().map((v) => JSON.stringify({ version: 1, entries: v })),
      fc.array(fc.oneof(entry, fc.anything()), { maxLength: 30 }).map((entries) =>
        JSON.stringify({ version: 1, entries }),
      ),
      fc.array(entry, { maxLength: 5 }).map((entries) => JSON.stringify({ version: 2, entries })),
    );
    fc.assert(
      fc.property(stored, (value) => {
        const store = new MapStore();
        store.setItem(LOCAL_PROGRESS_KEY, value);
        const read = readProgress(store);
        expect(read.length).toBeLessThanOrEqual(MAX_ENTRIES);
        expect(new Set(read.map((e) => e.sessionKey)).size).toBe(read.length);
        for (const e of read) {
          expect(isSessionKey(e.sessionKey)).toBe(true);
          expect(typeof e.scenarioId).toBe("string");
          expect(typeof e.scenarioTitle).toBe("string");
          expect(Number.isNaN(Date.parse(e.startedAt))).toBe(false);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("returns [] when the store throws", () => {
    const throwing: ProgressStore = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    expect(readProgress(throwing)).toEqual([]);
  });

  it("returns an empty list after clearing", () => {
    fc.assert(
      fc.property(fc.array(entry, { maxLength: 20 }), (entries) => {
        const store = new MapStore();
        for (const e of entries) addProgress(store, e);
        clearProgress(store);
        expect(readProgress(store)).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });
});
