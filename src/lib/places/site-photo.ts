import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Real venue photos for OpenStreetMap places: the venue's own website usually declares a share
 * image (og:image / twitter:image), the same picture messengers show for its link.
 * Fetching arbitrary URLs is an SSRF risk, so every hop is checked against private networks.
 */

export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::") return true;
    if (v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80")) return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? isPrivateAddress(mapped[1]) : false;
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

async function assertPublicHost(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("bad protocol");
  if (url.username || url.password) throw new Error("credentials in url");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) throw new Error("private address");
}

/** Pulls og:image / twitter:image / image_src out of HTML and resolves it against the page URL. */
export function extractShareImage(html: string, pageUrl: string): string | null {
  const head = html.slice(0, 200_000);
  const patterns = [
    /<meta[^>]+(?:property|name)=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']og:image(?::secure_url)?["']/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]*name=["']twitter:image(?::src)?["']/i,
    /<link[^>]+rel=["']image_src["'][^>]*href=["']([^"']+)["']/i,
  ];
  for (const re of patterns) {
    const m = re.exec(head);
    if (!m) continue;
    try {
      const u = new URL(m[1].replace(/&amp;/g, "&").trim(), pageUrl);
      if (u.protocol === "http:") u.protocol = "https:"; // the app is served over https
      if (u.protocol !== "https:") continue;
      if (/\.(svg|ico)(\?|$)/i.test(u.pathname) || /logo|favicon|icon/i.test(u.pathname)) continue; // logos look bad as cover photos
      return u.toString();
    } catch {}
  }
  return null;
}

export async function fetchSitePhoto(website: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(website);
  } catch {
    return null;
  }
  try {
    for (let hop = 0; hop < 4; hop++) {
      await assertPublicHost(url);
      const res = await fetchImpl(url, {
        redirect: "manual",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; LocaliBot/1.0; +preview)", Accept: "text/html" },
        signal: AbortSignal.timeout(5000),
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        url = new URL(res.headers.get("location")!, url);
        continue;
      }
      if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null;
      // Read at most ~300 KB: the <head> is all we need.
      const reader = res.body?.getReader();
      if (!reader) return null;
      let html = "";
      const decoder = new TextDecoder();
      while (html.length < 300_000) {
        const { value, done } = await reader.read();
        if (done) break;
        html += decoder.decode(value, { stream: true });
        if (/<\/head>/i.test(html)) break;
      }
      reader.cancel().catch(() => {});
      return extractShareImage(html, url.toString());
    }
  } catch {}
  return null;
}
