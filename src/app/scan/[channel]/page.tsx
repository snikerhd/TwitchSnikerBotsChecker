import type { Metadata } from "next";
import { notFound } from "next/navigation";
import TrackerApp from "./tracker-app";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ channel: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { channel } = await params;
  return {
    title: `${channel} · Sniker Bot Checker`,
    description: `Análise em tempo real dos viewers de ${channel} na Twitch: deteção de bots, contas suspeitas e estatísticas do chat.`,
  };
}

export default async function ScanPage({ params }: Props) {
  const { channel } = await params;
  const normalized = channel.trim().toLowerCase();

  if (!/^[a-z0-9_]{1,25}$/.test(normalized)) notFound();

  return <TrackerApp channel={normalized} />;
}
