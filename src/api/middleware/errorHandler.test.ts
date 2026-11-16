import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { createErrorHandler } from "./errorHandler.js";
import { requestIdMiddleware } from "./requestId.js";
import { sessionKeyParam } from "./sessionKey.js";
import {
  generateSessionKey,
  sessionKeyFingerprint,
} from "../../modules/simulation-runtime/index.js";

function appThrowing(error: () => unknown) {
  const app = new Hono();
  app.use("*", requestIdMiddleware);
  app.use("/sessions/:id/*", sessionKeyParam);
  app.get("/sessions/:id/boom", () => {
    throw error();
  });
  app.onError(createErrorHandler());
  return app;
}

describe("redacting error handler (Req 18.3, 18.5)", () => {
  it("logs no Session_Key, path or message for a thrown error that embeds the key", async () => {
    const key = generateSessionKey();
    const app = appThrowing(() => new Error(`storage failed for session ${key}`));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await app.request(`/sessions/${key}/boom`);
    const text = await res.text();
    const logged = JSON.stringify(errSpy.mock.calls);
    errSpy.mockRestore();

    expect(res.status).toBe(500);
    expect(JSON.parse(text).error.code).toBe("INTERNAL_SERVER_ERROR");
    expect(text).not.toContain(key);
    expect(logged).not.toContain(key);
    expect(logged).not.toContain("/sessions/");
    expect(logged).not.toContain("storage failed");
    expect(logged).toContain(await sessionKeyFingerprint(key));
    expect(logged).toContain(res.headers.get("X-Request-Id") ?? "missing-request-id");
  });

  it("surfaces a 4xx API error body from an error factory", async () => {
    const key = generateSessionKey();
    const app = appThrowing(() =>
      Object.assign(new Error("x"), {
        statusCode: 422,
        body: { error: { code: "NO_ACTIVE_SESSION", message: "There is no active session." } },
      }),
    );
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await app.request(`/sessions/${key}/boom`);
    errSpy.mockRestore();
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      "NO_ACTIVE_SESSION",
    );
  });

  it("fingerprints are 8 hex chars", async () => {
    expect(await sessionKeyFingerprint(generateSessionKey())).toMatch(/^[0-9a-f]{8}$/);
  });
});
