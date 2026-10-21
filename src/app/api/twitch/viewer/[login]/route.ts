import { NextResponse } from "next/server";
import { getViewerProfile, isValidLogin } from "@/lib/twitch-gql";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ login: string }> },
) {
  const { login } = await params;
  const normalized = login.trim().toLowerCase();

  if (!isValidLogin(normalized)) {
    return NextResponse.json(
      { error: "Nome de utilizador inválido" },
      { status: 400 },
    );
  }

  try {
    const profile = await getViewerProfile(normalized);
    if (!profile) {
      return NextResponse.json(
        { error: "Utilizador não encontrado" },
        { status: 404 },
      );
    }
    return NextResponse.json(profile);
  } catch {
    return NextResponse.json(
      { error: "Falha ao obter perfil" },
      { status: 502 },
    );
  }
}
