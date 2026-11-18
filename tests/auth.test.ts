import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { hashToken, newSessionToken, sessionCookieOptions } from "@/lib/auth/tokens";

describe("password hashing", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const stored = await hashPassword("correct horse battery");
    expect(stored).toMatch(/^scrypt\$[\w-]+\$[\w-]+$/);
    expect(await verifyPassword("correct horse battery", stored)).toBe(true);
    expect(await verifyPassword("correct horse batterY", stored)).toBe(false);
  });

  it("salts every hash, so equal passwords do not produce equal hashes", async () => {
    expect(await hashPassword("same-password")).not.toBe(await hashPassword("same-password"));
  });

  it("never throws on malformed stored values", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$abc$def")).toBe(false);
    expect(await verifyPassword("x", "scrypt$onlysalt")).toBe(false);
  });
});

describe("session tokens", () => {
  it("are long, random and stored only as a hash", () => {
    const a = newSessionToken();
    const b = newSessionToken();
    expect(a).not.toBe(b);
    expect(Buffer.from(a, "base64url")).toHaveLength(32);
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(a)).not.toContain(a);
  });

  it("cookie is httpOnly + SameSite=Lax, and Secure in production", () => {
    const exp = new Date();
    expect(sessionCookieOptions(true, exp)).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    expect(sessionCookieOptions(false, exp).secure).toBe(false);
  });
});
