import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import {
  InMemorySimulationRuntimeRepository,
  SESSION_KEY_BYTES,
  SESSION_KEY_PATTERN,
  SimulationRuntimeService,
  isWellFormedSessionKey,
} from "./index.js";
import { base64UrlDecode, base64UrlEncode } from "./session-key.js";
import type { ScenarioContentFile } from "../../types/index.js";

function scenario(): ScenarioContentFile {
  return {
    id: "sc-key",
    incident_slug: "inc",
    title: "T",
    objective: "O",
    difficulty: "beginner",
    est_duration_min: 5,
    rubric_version: "r1",
    skill_tags: ["x"],
    version: "1.0.0",
    definition: {
      initial_state_id: "start",
      states: {
        start: {
          id: "start",
          is_terminal: false,
          service_health: { api: "healthy" },
          metrics: {},
          dependencies: {},
          customer_impact: "none",
          evidence_available: [],
          active_alerts: [],
        },
      },
      actions: {},
      transitions: [],
      evidence: {},
    },
  };
}

/** Independent decoder (Node Buffer) to cross-check the 32-byte claim. */
function decodedLength(key: string): number {
  return Buffer.from(key, "base64url").length;
}

const keyArb = fc
  .uint8Array({ minLength: SESSION_KEY_BYTES, maxLength: SESSION_KEY_BYTES })
  .map(base64UrlEncode);
const badCharArb = fc.constantFrom("+", "/", "=", " ", ".", "%", "~");

describe("Property 12: Session_Key Format and Uniqueness", () => {
  // Feature: opsatlas-platform, Property 12: Session_Key Format and Uniqueness
  // **Validates: Requirements 18.2**
  it("keys from repeated createSession match the format, decode to 32 bytes and are distinct", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 40 }), async (count) => {
        const sc = scenario();
        const service = new SimulationRuntimeService({
          repository: new InMemorySimulationRuntimeRepository(),
          scenarioSource: {
            getById: async (id) => (id === sc.id ? sc : null),
            getVersion: async (id, v) => (id === sc.id && v === sc.version ? sc : null),
          },
        });
        const keys: string[] = [];
        for (let i = 0; i < count; i++) {
          const handle = await service.createSession(sc.id);
          expect(handle.id).toBe(handle.sessionId);
          keys.push(handle.id);
        }
        for (const key of keys) {
          expect(key).toMatch(SESSION_KEY_PATTERN);
          expect(key).toHaveLength(43);
          expect(decodedLength(key)).toBe(SESSION_KEY_BYTES);
          expect(base64UrlDecode(key)?.length).toBe(SESSION_KEY_BYTES);
          expect(isWellFormedSessionKey(key)).toBe(true);
        }
        expect(new Set(keys).size).toBe(keys.length);
      }),
      { numRuns: 50 },
    );
  });

  it("encodes any 32 bytes to a well-formed key that round-trips", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 32, maxLength: 32 }), (bytes) => {
        const key = base64UrlEncode(bytes);
        expect(isWellFormedSessionKey(key)).toBe(true);
        expect(Buffer.from(key, "base64url").equals(Buffer.from(bytes))).toBe(true);
        expect([...(base64UrlDecode(key) ?? [])]).toEqual([...bytes]);
      }),
      { numRuns: 200 },
    );
  });

  it("rejects arbitrary strings that do not match the format", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), (value) => {
        fc.pre(!SESSION_KEY_PATTERN.test(value));
        expect(isWellFormedSessionKey(value)).toBe(false);
      }),
      { numRuns: 500 },
    );
  });

  it("rejects near-miss keys: 42 or 44 characters, or containing +, / or =", () => {
    fc.assert(
      fc.property(
        keyArb,
        fc.nat({ max: 42 }),
        badCharArb,
        fc.constantFrom("A", "b", "0", "-", "_"),
        (key, position, bad, extra) => {
          expect(isWellFormedSessionKey(key.slice(0, 42))).toBe(false);
          expect(isWellFormedSessionKey(`${key}${extra}`)).toBe(false);
          expect(isWellFormedSessionKey(`${key}=`)).toBe(false);
          const replaced = `${key.slice(0, position)}${bad}${key.slice(position + 1)}`;
          expect(replaced).toHaveLength(43);
          expect(isWellFormedSessionKey(replaced)).toBe(false);
        },
      ),
      { numRuns: 300 },
    );
  });
});
