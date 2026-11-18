import { describe, expect, it, vi } from "vitest";
import { extractShareImage, fetchSitePhoto, isPrivateAddress } from "@/lib/places/site-photo";

describe("venue website photos", () => {
  it("reads og:image in either attribute order and resolves relative URLs over https", () => {
    expect(extractShareImage('<meta property="og:image" content="/img/hall.jpg">', "http://cafe.ua/menu")).toBe("https://cafe.ua/img/hall.jpg");
    expect(extractShareImage('<meta content="https://cdn.x.com/a.jpg?w=1&amp;h=2" property="og:image" />', "https://x.com")).toBe("https://cdn.x.com/a.jpg?w=1&h=2");
    expect(extractShareImage('<meta name="twitter:image" content="https://x.com/t.png">', "https://x.com")).toBe("https://x.com/t.png");
  });

  it("skips logos and icons, which look bad as cover photos", () => {
    expect(extractShareImage('<meta property="og:image" content="/static/logo.png">', "https://x.com")).toBeNull();
    expect(extractShareImage('<meta property="og:image" content="/a.svg">', "https://x.com")).toBeNull();
    expect(extractShareImage("<html><head></head></html>", "https://x.com")).toBeNull();
  });

  it("recognises private and loopback addresses (SSRF guard)", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "::1", "fd00::1", "::ffff:127.0.0.1"]) expect(isPrivateAddress(ip)).toBe(true);
    for (const ip of ["8.8.8.8", "93.184.216.34", "2606:4700::1111"]) expect(isPrivateAddress(ip)).toBe(false);
  });

  it("refuses to fetch internal hosts, including via redirects", async () => {
    const fetchMock = vi.fn();
    expect(await fetchSitePhoto("http://169.254.169.254/latest/meta-data", fetchMock as unknown as typeof fetch)).toBeNull();
    expect(await fetchSitePhoto("http://127.0.0.1:5432", fetchMock as unknown as typeof fetch)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    const redirecting = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: "http://10.0.0.5/admin" } }));
    expect(await fetchSitePhoto("https://8.8.8.8/", redirecting as unknown as typeof fetch)).toBeNull();
    expect(redirecting).toHaveBeenCalledTimes(1);
  });

  it("returns the share image of a normal page", async () => {
    const page = vi.fn().mockResolvedValue(
      new Response('<html><head><meta property="og:image" content="https://8.8.8.8/hall.jpg"></head><body>…</body></html>', { headers: { "content-type": "text/html" } }),
    );
    expect(await fetchSitePhoto("https://8.8.8.8/", page as unknown as typeof fetch)).toBe("https://8.8.8.8/hall.jpg");
  });
});
