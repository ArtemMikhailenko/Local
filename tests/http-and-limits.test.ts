import { describe, expect, it } from "vitest";
import { HttpError, assertSameOrigin } from "@/lib/http";
import { createRateLimiter } from "@/lib/ratelimit";

const req = (headers: Record<string, string>) => new Request("http://localhost:4400/api/saved", { method: "POST", headers });

describe("assertSameOrigin (CSRF defence)", () => {
  it("allows same-origin and header-less requests", () => {
    expect(() => assertSameOrigin(req({ origin: "http://localhost:4400", host: "localhost:4400" }))).not.toThrow();
    expect(() => assertSameOrigin(req({ host: "localhost:4400" }))).not.toThrow();
  });

  it("blocks a foreign origin with 403", () => {
    try {
      assertSameOrigin(req({ origin: "https://evil.example", host: "localhost:4400" }));
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError);
      expect((e as HttpError).status).toBe(403);
    }
  });

  it("trusts x-forwarded-host behind a proxy (Vercel)", () => {
    expect(() => assertSameOrigin(req({ origin: "https://locali.app", host: "internal:3000", "x-forwarded-host": "locali.app" }))).not.toThrow();
  });
});

describe("rate limiter", () => {
  it("allows N requests per window, then blocks with retry-after, then resets", () => {
    let now = 0;
    const rl = createRateLimiter(3, 60_000, () => now);
    expect([1, 2, 3].map(() => rl.check("ip").ok)).toEqual([true, true, true]);
    const blocked = rl.check("ip");
    expect(blocked).toEqual({ ok: false, retryAfterSec: 60 });
    expect(rl.check("other-ip").ok).toBe(true); // keys are independent
    now = 60_001;
    expect(rl.check("ip").ok).toBe(true);
  });
});
