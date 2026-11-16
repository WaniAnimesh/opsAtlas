import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { corsAllowlist, parseOrigins } from "./cors.js";

function makeApp(): Hono {
  const app = new Hono();
  app.use("*", corsAllowlist(["https://opsatlas.pages.dev", "http://localhost:3000"]));
  app.get("/x", (c) => c.json({ ok: true }));
  app.post("/x", (c) => c.json({ ok: true }));
  return app;
}

describe("corsAllowlist", () => {
  it("echoes an allowlisted origin without a credentials header", async () => {
    const res = await makeApp().request("/x", {
      headers: { Origin: "https://opsatlas.pages.dev" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://opsatlas.pages.dev");
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBeNull();
    expect(res.headers.get("Access-Control-Expose-Headers")).toContain("Retry-After");
    expect(res.headers.get("Access-Control-Expose-Headers")).toContain("X-Request-Id");
  });

  it("sends no CORS headers to other origins", async () => {
    const res = await makeApp().request("/x", { headers: { Origin: "https://evil.example" } });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBeNull();
  });

  it("answers an allowlisted preflight with 204 and the method/header allowlist", async () => {
    const res = await makeApp().request("/x", {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:3000",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3000");
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET,POST,OPTIONS");
    expect(res.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type");
    expect(res.headers.get("Access-Control-Max-Age")).toBe("600");
  });

  it("gives a preflight from another origin no allow-origin header", async () => {
    const res = await makeApp().request("/x", {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "POST" },
    });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});

describe("parseOrigins", () => {
  it("splits, trims and drops blanks and trailing slashes", () => {
    expect(parseOrigins(" https://a.dev/ , ,http://localhost:3000")).toEqual([
      "https://a.dev",
      "http://localhost:3000",
    ]);
    expect(parseOrigins(undefined)).toEqual([]);
  });
});
