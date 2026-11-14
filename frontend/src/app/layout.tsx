import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import Providers from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "F2A TRAVAUX – Société de Fluides et Travaux", template: "%s | F2A TRAVAUX" },
  description: "Chauffage central, ventilation, climatisation, plomberie et installations sanitaires en Tunisie.",
  icons: { icon: "/logo-mark.png", apple: "/logo-mark.png" },
};

export const viewport: Viewport = { themeColor: "#174B83", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const lang = (await cookies()).get("f2a_lang")?.value === "ar" ? "ar" : "fr";
  return (
    <html lang={lang} dir={lang === "ar" ? "rtl" : "ltr"} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen antialiased">
        <Providers lang={lang}>{children}</Providers>
      </body>
    </html>
  );
}
