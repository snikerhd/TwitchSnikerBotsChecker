import { NextResponse } from "next/server";
import { getUsersInfo, isValidLogin } from "@/lib/twitch-gql";

export const dynamic = "force-dynamic";

const MAX_LOGINS = 600;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const logins = (body as { logins?: unknown })?.logins;
  if (!Array.isArray(logins)) {
    return NextResponse.json(
      { error: "Esperado { logins: string[] }" },
      { status: 400 },
    );
  }

  const clean = [
    ...new Set(
      logins
        .filter((l): l is string => typeof l === "string")
        .map((l) => l.trim().toLowerCase())
        .filter(isValidLogin),
    ),
  ].slice(0, MAX_LOGINS);

  try {
    const users = await getUsersInfo(clean);
    return NextResponse.json({ users });
  } catch {
    return NextResponse.json(
      { error: "Falha ao obter perfis" },
      { status: 502 },
    );
  }
}
