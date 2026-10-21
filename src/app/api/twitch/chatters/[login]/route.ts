import { NextResponse } from "next/server";
import { getChannelInfo, getChatters, isValidLogin } from "@/lib/twitch-gql";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ login: string }> },
) {
  const { login } = await params;
  const normalized = login.trim().toLowerCase();

  if (!isValidLogin(normalized)) {
    return NextResponse.json(
      { error: "Nome de canal inválido" },
      { status: 400 },
    );
  }

  try {
    const chatters = await getChatters(normalized);

    // Canal inexistente → 404 (distingue de "chat vazio")
    if (chatters.totalCount === 0 && chatters.viewers.length === 0) {
      const info = await getChannelInfo(normalized).catch(() => null);
      if (!info) {
        return NextResponse.json(
          { error: "Canal não encontrado" },
          { status: 404 },
        );
      }
    }

    return NextResponse.json(chatters);
  } catch {
    return NextResponse.json(
      { error: "Falha ao obter chatters da Twitch" },
      { status: 502 },
    );
  }
}
