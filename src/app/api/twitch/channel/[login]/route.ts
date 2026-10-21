import { NextResponse } from "next/server";
import { getChannelInfo, isValidLogin, GqlError } from "@/lib/twitch-gql";

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
    const info = await getChannelInfo(normalized);
    if (!info) {
      return NextResponse.json(
        { error: "Canal não encontrado" },
        { status: 404 },
      );
    }
    return NextResponse.json(info);
  } catch (err) {
    const status = err instanceof GqlError && err.status ? 502 : 502;
    return NextResponse.json(
      { error: "Falha ao contactar a Twitch" },
      { status },
    );
  }
}
