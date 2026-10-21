import "server-only";

/**
 * Cliente server-side para a API GQL da Twitch.
 *
 * No site original todos os pedidos eram feitos a partir do browser através de
 * proxies CORS públicos (corsproxy.io, allorigins, codetabs) — a principal
 * fonte de erros "CORS_BLOCKED". Aqui corremos no servidor e chamamos a Twitch
 * diretamente: sem proxies, com timeout, retries com backoff e validação do
 * login (evita injeção de GQL, outro bug do original).
 */

const TWITCH_GQL_URL = "https://gql.twitch.tv/gql";
const TWITCH_INTEGRITY_URL = "https://gql.twitch.tv/integrity";

// Client-ID principal (mesmo usado pela app web antiga da Twitch) — não exige
// integrity check no campo "chatters". Configurável por env.
const CLIENT_ID =
  process.env.TWITCH_CLIENT_ID ?? "kd1unb4b3q4t58fwlpcbzcbnm76a8fp";

// Client-ID da webapp atual — exige integrity token, usado como fallback.
const WEB_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";

// Device-Id estável por processo + cache do integrity token (fallback)
const DEVICE_ID =
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
let integrityToken: string | null = null;
let integrityExpiry = 0;

async function getIntegrityToken(force = false): Promise<string | null> {
  if (!force && integrityToken && Date.now() < integrityExpiry) {
    return integrityToken;
  }
  try {
    const res = await fetch(TWITCH_INTEGRITY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-Id": WEB_CLIENT_ID,
        "X-Device-Id": DEVICE_ID,
      },
      body: "{}",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { token?: string; expiration?: number };
    if (!data.token) return null;
    integrityToken = data.token;
    integrityExpiry = (data.expiration ?? Date.now() + 10 * 60 * 1000) - 60_000;
    return integrityToken;
  } catch {
    return null;
  }
}

const LOGIN_RE = /^[a-zA-Z0-9_]{1,25}$/;

export function isValidLogin(login: string): boolean {
  return LOGIN_RE.test(login);
}

export class GqlError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "GqlError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface GqlOptions {
  clientId?: string;
  extraHeaders?: Record<string, string>;
}

async function gqlRequest(
  body: unknown,
  attempt = 0,
  options: GqlOptions = {},
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(TWITCH_GQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-Id": options.clientId ?? CLIENT_ID,
        ...options.extraHeaders,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!res.ok) {
      // 429/5xx → retry com backoff; 401/403 → não vale a pena
      if ((res.status === 429 || res.status >= 500) && attempt < 2) {
        await sleep(400 * 2 ** attempt + Math.random() * 200);
        return gqlRequest(body, attempt + 1, options);
      }
      throw new GqlError(`Twitch respondeu ${res.status}`, res.status);
    }

    const data = (await res.json()) as unknown;
    // A Twitch devolve 200 com { error, message } em alguns casos
    if (
      data &&
      typeof data === "object" &&
      "error" in data &&
      !(data as { data?: unknown }).data
    ) {
      throw new GqlError(
        String((data as { message?: unknown }).message ?? "Twitch GQL error"),
      );
    }
    return data;
  } catch (err) {
    if (err instanceof GqlError) throw err;
    if (attempt < 2) {
      await sleep(400 * 2 ** attempt + Math.random() * 200);
      return gqlRequest(body, attempt + 1, options);
    }
    throw new GqlError(
      err instanceof Error ? err.message : "Falha ao contactar a Twitch",
    );
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Tipos públicos ───────────────────────────

export interface StreamInfo {
  id: string;
  title: string;
  viewersCount: number;
  game: string;
  createdAt: string;
  isLive: boolean;
}

export interface UserInfo {
  id: string;
  login: string;
  displayName: string;
  description: string;
  createdAt: string;
  profileImageURL: string;
  isPartner: boolean;
  isAffiliate: boolean;
  followers: number;
  stream: StreamInfo | null;
}

export interface ChattersData {
  viewers: string[];
  totalCount: number;
  broadcasters: string[];
  moderators: string[];
  vips: string[];
  chatbots: string[];
  regularViewers: string[];
  streamViewers: number;
}

export interface UserBasicInfo {
  login: string;
  displayName: string;
  createdAt: string;
  profileImageURL: string;
  followers: number;
}

export interface FollowedChannel {
  login: string;
  displayName: string;
  profileImageURL: string;
  followedAt: string;
}

export interface ViewerFullProfile {
  login: string;
  displayName: string;
  createdAt: string;
  profileImageURL: string;
  description: string;
  followers: number;
  followingCount: number;
  isPartner: boolean;
  isAffiliate: boolean;
  following: FollowedChannel[];
  followingAvailable: boolean;
}

// ─── Channel info ─────────────────────────────

export async function getChannelInfo(login: string): Promise<UserInfo | null> {
  const data = (await gqlRequest({
    query: `query ChannelInfo($login: String!) {
      user(login: $login) {
        id login displayName description createdAt
        profileImageURL(width: 300)
        roles { isPartner isAffiliate }
        followers { totalCount }
        stream { id title viewersCount createdAt game { name } }
      }
    }`,
    variables: { login },
  })) as { data?: { user?: Record<string, any> | null } };

  const u = data?.data?.user;
  if (!u) return null;

  return {
    id: u.id ?? "",
    login: u.login ?? login,
    displayName: u.displayName ?? login,
    description: u.description ?? "",
    createdAt: u.createdAt ?? "",
    profileImageURL: u.profileImageURL ?? "",
    isPartner: u.roles?.isPartner ?? false,
    isAffiliate: u.roles?.isAffiliate ?? false,
    followers: u.followers?.totalCount ?? 0,
    stream: u.stream
      ? {
          id: u.stream.id ?? "",
          title: u.stream.title ?? "",
          viewersCount: u.stream.viewersCount ?? 0,
          game: u.stream.game?.name ?? "Desconhecido",
          createdAt: u.stream.createdAt ?? "",
          isLive: true,
        }
      : null,
  };
}

// ─── Chatters ─────────────────────────────────
// Melhoria: 1 único pedido por ciclo (o original disparava 5 pedidos
// idênticos em paralelo) e o viewersCount do stream vem na mesma query.

const CHATTERS_QUERY = `query Chatters($login: String!) {
  user(login: $login) {
    stream { viewersCount }
    channel {
      chatters {
        count
        broadcasters { login }
        moderators { login }
        vips { login }
        viewers { login }
        chatbots { login }
      }
    }
  }
}`;

const CHATTERS_PERSISTED_HASH =
  "92168b4434c8f4d32df14510052131c3544b929723d5f8b69bb96c96207e483e"; // CommunityTab

const CHATTERS_PERSISTED_BODY = (login: string) => [
  {
    operationName: "CommunityTab",
    variables: { login },
    extensions: {
      persistedQuery: { version: 1, sha256Hash: CHATTERS_PERSISTED_HASH },
    },
  },
];

const extractUser = (d: any) => (Array.isArray(d) ? d[0]?.data?.user : d?.data?.user);

// A Twitch só devolve ~100 viewers por pedido, mas a amostra RODA:
// pedidos repetidos trazem viewers diferentes. A extensão que inspirou
// este projeto obtém a contagem real acumulando várias amostras — fazemos
// o mesmo aqui, no servidor, com pedidos paralelos e união dos resultados.
const CHATTERS_SAMPLES = 6;

interface ChatterBuckets {
  broadcasters: Set<string>;
  moderators: Set<string>;
  vips: Set<string>;
  chatbots: Set<string>;
  regularViewers: Set<string>;
  count: number;
  streamViewers: number;
}

function mergeChatters(raw: any, acc: ChatterBuckets): void {
  const chatters = raw?.channel?.chatters;
  if (!chatters) return;
  const add = (list: any, set: Set<string>) =>
    (Array.isArray(list) ? list : [])
      .map((c: any) => String(c?.login ?? "").toLowerCase())
      .filter(Boolean)
      .forEach((l: string) => set.add(l));

  add(chatters.broadcasters, acc.broadcasters);
  add(chatters.moderators, acc.moderators);
  add(chatters.vips, acc.vips);
  add(chatters.viewers, acc.regularViewers);
  add(chatters.chatbots, acc.chatbots);
  if (typeof chatters.count === "number" && chatters.count > acc.count) {
    acc.count = chatters.count;
  }
  const sv = raw?.stream?.viewersCount;
  if (typeof sv === "number" && sv > acc.streamViewers) acc.streamViewers = sv;
}

export async function getChatters(channelLogin: string): Promise<ChattersData> {
  const acc: ChatterBuckets = {
    broadcasters: new Set(),
    moderators: new Set(),
    vips: new Set(),
    chatbots: new Set(),
    regularViewers: new Set(),
    count: 0,
    streamViewers: 0,
  };

  // Rodada principal: N amostras paralelas (mistura inline + persisted)
  const calls = Array.from({ length: CHATTERS_SAMPLES }, (_, i) =>
    i % 3 === 2
      ? gqlRequest(CHATTERS_PERSISTED_BODY(channelLogin)).then(extractUser)
      : gqlRequest({
          query: CHATTERS_QUERY,
          variables: { login: channelLogin },
        }).then((d: any) => d?.data?.user),
  );
  const results = await Promise.allSettled(calls);
  for (const r of results) {
    if (r.status === "fulfilled" && r.value?.channel?.chatters) {
      mergeChatters(r.value, acc);
    }
  }

  // Fallback: web client-id + integrity token (contorna o integrity check)
  if (acc.count === 0 && acc.regularViewers.size === 0) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const token = await getIntegrityToken(attempt > 0);
        if (!token) break;
        const user = extractUser(
          await gqlRequest(CHATTERS_PERSISTED_BODY(channelLogin), 0, {
            clientId: WEB_CLIENT_ID,
            extraHeaders: {
              "Client-Integrity": token,
              "X-Device-Id": DEVICE_ID,
            },
          }),
        );
        if (user?.channel?.chatters) {
          mergeChatters(user, acc);
          break;
        }
      } catch {
        /* tenta de novo / desiste */
      }
    }
  }

  const broadcasters = [...acc.broadcasters];
  const moderators = [...acc.moderators];
  const vips = [...acc.vips];
  const chatbots = [...acc.chatbots];
  const regularViewers = [...acc.regularViewers];
  const viewers = [
    ...new Set([
      ...broadcasters,
      ...moderators,
      ...vips,
      ...regularViewers,
      ...chatbots,
    ]),
  ];

  return {
    viewers,
    totalCount: acc.count || viewers.length,
    broadcasters,
    moderators,
    vips,
    chatbots,
    regularViewers,
    streamViewers: acc.streamViewers,
  };
}

// ─── Info em massa (batches de aliases) ───────
// Nota: a Twitch limita aliases de root field a 15 por query.
// O original usava batches de 50 → TODOS falhavam com HTTP 400
// ("root field aliases limit exceeded") e a análise ficava sem datas.
// Usamos 10 para margem de segurança.

const BATCH_SIZE = 10;
const PARALLELISM = 6;

export async function getUsersInfo(
  logins: string[],
): Promise<UserBasicInfo[]> {
  const unique = [...new Set(logins.filter(isValidLogin))];
  if (unique.length === 0) return [];

  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    batches.push(unique.slice(i, i + BATCH_SIZE));
  }

  const out: UserBasicInfo[] = [];

  for (let i = 0; i < batches.length; i += PARALLELISM) {
    const group = batches.slice(i, i + PARALLELISM);
    const results = await Promise.allSettled(
      group.map((batch) =>
        gqlRequest({
          query:
            "query Users {" +
            batch
              .map(
                (login, idx) =>
                  // logins validados por isValidLogin → seguro interpolar
                  `u${idx}: user(login: "${login}") { login displayName createdAt profileImageURL(width: 70) followers { totalCount } }`,
              )
              .join("\n") +
            "}",
          variables: {},
        }),
      ),
    );

    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      const data = (r.value as any)?.data;
      if (!data) continue;
      for (const key of Object.keys(data)) {
        const user = data[key];
        if (!user) continue;
        out.push({
          login: String(user.login ?? "").toLowerCase(),
          displayName: user.displayName ?? "",
          createdAt: user.createdAt ?? "",
          profileImageURL: user.profileImageURL ?? "",
          followers: user.followers?.totalCount ?? 0,
        });
      }
    }
  }

  return out;
}

// ─── Perfil completo de um viewer ─────────────

const FOLLOWS_PERSISTED_HASH =
  "eecf815273d3d949e5cf0085cc5084cd8a1b5b7b6f7990cf43cb0beadf546907";

export async function getViewerProfile(
  login: string,
): Promise<ViewerFullProfile | null> {
  const userQuery = `query Viewer($login: String!) {
    user(login: $login) {
      login displayName description createdAt
      profileImageURL(width: 300)
      followers { totalCount }
      roles { isPartner isAffiliate }
    }
  }`;

  // Nota: desde 2024/2025 a Twitch tornou as listas "a seguir" privadas.
  // Tentamos na mesma (persisted + inline) — funciona para algumas contas.
  const [userRes, persistedRes, inlineRes] = await Promise.allSettled([
    gqlRequest({ query: userQuery, variables: { login } }),
    gqlRequest([
      {
        operationName: "ChannelFollows",
        variables: { limit: 100, login, order: "DESC" },
        extensions: {
          persistedQuery: { version: 1, sha256Hash: FOLLOWS_PERSISTED_HASH },
        },
      },
    ]),
    gqlRequest({
      query: `query Follows($login: String!) {
        user(login: $login) {
          follows(first: 100, order: DESC) {
            totalCount
            edges { followedAt node { login displayName profileImageURL(width: 70) } }
          }
        }
      }`,
      variables: { login },
    }),
  ]);

  const u =
    userRes.status === "fulfilled"
      ? ((userRes.value as any)?.data?.user ?? null)
      : null;
  if (!u) return null;

  const following: FollowedChannel[] = [];
  let followingCount: number | null = null;

  const harvest = (conn: any) => {
    if (!conn) return;
    if (typeof conn.totalCount === "number") followingCount = conn.totalCount;
    const edges = conn.edges;
    if (!Array.isArray(edges)) return;
    for (const edge of edges) {
      const node = edge?.node;
      if (node?.login && !following.some((f) => f.login === node.login)) {
        following.push({
          login: node.login,
          displayName: node.displayName ?? node.login,
          profileImageURL: node.profileImageURL ?? "",
          followedAt: edge.followedAt ?? "",
        });
      }
    }
  };

  if (persistedRes.status === "fulfilled") {
    const v = persistedRes.value as any;
    harvest(Array.isArray(v) ? v[0]?.data?.user?.follows : v?.data?.user?.follows);
  }
  if (inlineRes.status === "fulfilled") {
    harvest((inlineRes.value as any)?.data?.user?.follows);
  }

  const followingAvailable = following.length > 0 || followingCount !== null;

  return {
    login: u.login ?? login,
    displayName: u.displayName ?? login,
    description: u.description ?? "",
    createdAt: u.createdAt ?? "",
    profileImageURL: u.profileImageURL ?? "",
    followers: u.followers?.totalCount ?? 0,
    followingCount: followingAvailable
      ? (followingCount ?? following.length)
      : 0,
    isPartner: u.roles?.isPartner ?? false,
    isAffiliate: u.roles?.isAffiliate ?? false,
    following,
    followingAvailable,
  };
}
