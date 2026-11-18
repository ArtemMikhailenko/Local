import { createHash, randomBytes } from "node:crypto";

export const SESSION_COOKIE = "locali_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** 256-bit random token handed to the browser; only its hash is persisted. */
export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionCookieOptions(isProd: boolean, expires: Date) {
  return {
    httpOnly: true, // not readable from JS, so XSS cannot steal the session
    secure: isProd,
    sameSite: "lax" as const, // blocks cross-site POSTs carrying the cookie
    path: "/",
    expires,
  };
}
