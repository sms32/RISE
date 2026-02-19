// app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "RISE 2026",
  description: "Real World IoT System Explorations",

  // ── Open Graph (WhatsApp, Facebook, Telegram link previews) ──────────────
  openGraph: {
    title: "RISE 2026",
    description: "Real World IoT System Explorations",
    url: "https://rise-black.vercel.app",
    siteName: "RISE 2026",
    type: "website",
  },

  // ── Twitter / X card ──────────────────────────────────────────────────────
  twitter: {
    card: "summary",
    title: "RISE 2026",
    description: "Real World IoT System Explorations",
  },

  // ── Extra meta ────────────────────────────────────────────────────────────
  keywords: ["RISE", "IoT", "Workshop", "2026", "Embedded Systems"],
  authors: [{ name: "RISE 2026" }],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
