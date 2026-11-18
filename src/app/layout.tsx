import type { Metadata, Viewport } from "next";
import { Geist, Instrument_Serif } from "next/font/google";
import { AppProvider } from "@/components/app-provider";
import { TabBar } from "@/components/tab-bar";
import { AuthSheet } from "@/components/auth-sheet";
import "./globals.css";

const geist = Geist({ subsets: ["latin", "cyrillic"], variable: "--font-geist" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-serif" });

export const metadata: Metadata = {
  title: "Locali · your AI concierge",
  description: "Find the right place nearby, or just tell the concierge what kind of evening you want.",
  appleWebApp: { capable: true, title: "Locali", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#0b0b0f", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${serif.variable}`}>
      <body>
        <AppProvider>
          <div className="mx-auto min-h-dvh max-w-[480px] pb-32 sm:border-x sm:border-line">{children}</div>
          <TabBar />
          <AuthSheet />
        </AppProvider>
      </body>
    </html>
  );
}
