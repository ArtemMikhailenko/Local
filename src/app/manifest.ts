import type { MetadataRoute } from "next";

/** Makes Locali installable ("Add to Home Screen"): opens full-screen like a native app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Locali · AI concierge",
    short_name: "Locali",
    description: "Find the right place nearby, or tell the concierge what kind of evening you want.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    orientation: "portrait",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Ask the concierge", url: "/concierge", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Saved places", url: "/saved", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
