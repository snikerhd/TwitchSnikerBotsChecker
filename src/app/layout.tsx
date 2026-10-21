import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans-display",
  weight: ["500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sniker Bot Checker — Análise de Viewers e Bots na Twitch",
  description:
    "Analisa qualquer stream Twitch em tempo real: deteta bots, contas falsas e obtém estatísticas detalhadas da audiência. Sem login, sem extensões.",
  openGraph: {
    title: "Sniker Bot Checker",
    description:
      "Deteta bots e analisa a audiência de qualquer canal Twitch em tempo real.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
