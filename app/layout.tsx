// app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "RISE 2026",
  description: "Real World IoT System Explorations",

  openGraph: {
    title: "RISE 2026",
    description: "Real World IoT System Explorations",
    url: "https://rise-iot.vercel.app",
    siteName: "RISE 2026",
    type: "website",
    images: [
      {
        url: "https://rise-iot.vercel.app/og.png",
        width: 1200,
        height: 630,
        alt: "RISE 2026 — Real World IoT System Explorations",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",   // ← changed from "summary" to show big image
    title: "RISE 2026",
    description: "Real World IoT System Explorations",
    images: ["https://rise-black.vercel.app/og-image.png"],
  },

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
