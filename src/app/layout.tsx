import type { Metadata, Viewport } from "next";
import { Onest } from "next/font/google";
import { AppProvider } from "@/components/app-provider";
import { TabBar } from "@/components/tab-bar";
import { AuthSheet } from "@/components/auth-sheet";
import "./globals.css";

// Onest: friendly, very readable, with Cyrillic (many venue names are Ukrainian).
const onest = Onest({ subsets: ["latin", "cyrillic"], variable: "--font-onest" });

export const metadata: Metadata = {
  title: "Locali · your AI concierge",
  description: "Find the right place nearby, or just tell the concierge what kind of evening you want.",
  appleWebApp: { capable: true, title: "Locali", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#ffffff", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${onest.variable}`}>
      <body>
        <AppProvider>
          <div className="mx-auto min-h-dvh max-w-[480px] pb-28 sm:border-x sm:border-line">{children}</div>
          <TabBar />
          <AuthSheet />
        </AppProvider>
      </body>
    </html>
  );
}
