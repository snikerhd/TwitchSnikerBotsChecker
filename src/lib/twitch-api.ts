// Twitch GQL API — fast parallel client
// Uses public Client-IDs, no OAuth needed

const TWITCH_GQL_URL = 'https://gql.twitch.tv/gql';
const CLIENT_ID = 'kd1unb4b3q4t58fwlpcbzcbnm76a8fp';

const CORS_PROXIES = [
  (url: string) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];

let workingProxyIndex: number | null = null;

// ─── Core request function ────────────────────

async function gqlRequest(body: unknown): Promise<unknown> {
  const bodyStr = JSON.stringify(body);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Client-Id': CLIENT_ID,
  };

  // Fast path — use cached working proxy
  if (workingProxyIndex !== null) {
    try {
      const url = CORS_PROXIES[workingProxyIndex](TWITCH_GQL_URL);
      const r = await fetch(url, { method: 'POST', headers, body: bodyStr });
      if (r.ok) {
        const d = await r.json();
        if (d && !d.error) return d;
      }
    } catch {
      workingProxyIndex = null;
    }
  }

  // Try direct
  try {
    const r = await fetch(TWITCH_GQL_URL, { method: 'POST', headers, body: bodyStr });
    if (r.ok) return await r.json();
  } catch { /* CORS expected */ }

  // Try each proxy
  for (let i = 0; i < CORS_PROXIES.length; i++) {
    try {
      const url = CORS_PROXIES[i](TWITCH_GQL_URL);
      const r = await fetch(url, { method: 'POST', headers, body: bodyStr });
      if (r.ok) {
        const d = await r.json();
        if (d && typeof d === 'object') {
          workingProxyIndex = i;
          return d;
        }
      }
    } catch { continue; }
  }

  throw new Error('CORS_BLOCKED');
}

// ─── Parallel request helper ──────────────────

async function gqlParallel(bodies: unknown[]): Promise<unknown[]> {
  return Promise.all(bodies.map(b => gqlRequest(b)));
}

// ─── Types ────────────────────────────────────

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
  /** false = a Twitch já não devolve a lista "a seguir" (listas privadas) */
  followingAvailable: boolean;
}

export interface FollowedChannel {
  login: string;
  displayName: string;
  profileImageURL: string;
  followedAt: string;
}

// ─── Channel Info ─────────────────────────────

export async function getChannelInfo(login: string): Promise<UserInfo | null> {
  const query = `query {
    user(login: "${login}") {
      id login displayName description createdAt
      profileImageURL(width: 300)
      roles { isPartner isAffiliate }
      followers { totalCount }
      stream {
        id title viewersCount createdAt
        game { name }
      }
    }
  }`;

  const data = await gqlRequest({ query, variables: {} }) as any;
  const u = data?.data?.user;
  if (!u) return null;

  return {
    id: u.id, login: u.login, displayName: u.displayName,
    description: u.description, createdAt: u.createdAt,
    profileImageURL: u.profileImageURL,
    isPartner: u.roles?.isPartner ?? false,
    isAffiliate: u.roles?.isAffiliate ?? false,
    followers: u.followers?.totalCount ?? 0,
    stream: u.stream ? {
      id: u.stream.id, title: u.stream.title,
      viewersCount: u.stream.viewersCount,
      game: u.stream.game?.name ?? 'Unknown',
      createdAt: u.stream.createdAt, isLive: true,
    } : null,
  };
}

// ─── Chatters (parallel grab for max coverage) ─

export async function getChattersParallel(
  channelLogin: string,
  concurrentCalls = 5
): Promise<ChattersData> {
  const payload = [{
    operationName: 'CommunityTab',
    variables: { login: channelLogin },
    extensions: {
      persistedQuery: {
        version: 1,
        sha256Hash: '92168b4434c8f4d32df14510052131c3544b929723d5f8b69bb96c96207e483e',
      },
    },
  }];

  // Fire multiple parallel requests to catch more chatters
  const bodies = Array(concurrentCalls).fill(payload);
  const results = await Promise.allSettled(bodies.map((b: unknown) => gqlRequest(b)));

  const allBroadcasters = new Set<string>();
  const allModerators = new Set<string>();
  const allVips = new Set<string>();
  const allRegular = new Set<string>();
  const allChatbots = new Set<string>();
  let maxCount = 0;

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    const chatters = (result.value as any)?.[0]?.data?.user?.channel?.chatters;
    if (!chatters) continue;
    if (chatters.count > maxCount) maxCount = chatters.count;
    (chatters.broadcasters || []).forEach((v: any) => allBroadcasters.add(v.login));
    (chatters.moderators || []).forEach((v: any) => allModerators.add(v.login));
    (chatters.vips || []).forEach((v: any) => allVips.add(v.login));
    (chatters.viewers || []).forEach((v: any) => allRegular.add(v.login));
    (chatters.chatbots || []).forEach((v: any) => allChatbots.add(v.login));
  }

  const broadcasters = [...allBroadcasters];
  const moderators = [...allModerators];
  const vips = [...allVips];
  const regularViewers = [...allRegular];
  const chatbots = [...allChatbots];
  const viewers = [...broadcasters, ...moderators, ...vips, ...regularViewers, ...chatbots];

  return {
    viewers, totalCount: maxCount || viewers.length,
    broadcasters, moderators, vips, chatbots, regularViewers,
  };
}

// ─── Bulk user info (fast parallel batches) ───

export interface UserBasicInfo {
  login: string;
  displayName: string;
  createdAt: string;
  profileImageURL: string;
  followers: number;
}

export async function getUsersInfoFast(
  logins: string[],
  onProgress?: (done: number, total: number) => void
): Promise<Map<string, UserBasicInfo>> {
  const result = new Map<string, UserBasicInfo>();
  if (logins.length === 0) return result;

  // Build batches of 50 users each (GQL handles many aliases)
  const batchSize = 50;
  const batches: string[][] = [];
  for (let i = 0; i < logins.length; i += batchSize) {
    batches.push(logins.slice(i, i + batchSize));
  }

  // Process batches in parallel groups of 5
  const parallelism = 5;
  let done = 0;

  for (let i = 0; i < batches.length; i += parallelism) {
    const group = batches.slice(i, i + parallelism);

    const queries = group.map(batch => {
      const fields = batch.map((login, idx) =>
        `u${idx}: user(login: "${login}") { login displayName createdAt profileImageURL(width: 50) followers { totalCount } }`
      ).join('\n');
      return { query: `query { ${fields} }`, variables: {} };
    });

    const results = await Promise.allSettled(queries.map(q => gqlRequest(q)));

    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      const data = (r.value as any)?.data;
      if (!data) continue;
      for (const key of Object.keys(data)) {
        const user = data[key];
        if (user) result.set(user.login.toLowerCase(), {
          login: user.login,
          displayName: user.displayName,
          createdAt: user.createdAt ?? '',
          profileImageURL: user.profileImageURL ?? '',
          followers: user.followers?.totalCount ?? 0,
        });
      }
    }

    done += group.reduce((a, b) => a + b.length, 0);
    onProgress?.(Math.min(done, logins.length), logins.length);
  }

  return result;
}

// ─── Viewer Profile with Following ────────────

export async function getViewerProfile(login: string): Promise<ViewerFullProfile | null> {
  // Nota: desde 2024/2025 a Twitch tornou as listas de "a seguir" privadas.
  // O GQL devolve edges vazias para qualquer utilizador, mesmo que siga canais.
  const userQuery = `query {
    user(login: "${login}") {
      login displayName description createdAt
      profileImageURL(width: 300)
      followers { totalCount }
      roles { isPartner isAffiliate }
    }
  }`;

  // Tentativa 1: persisted query usada pelo próprio site da Twitch
  const followingPayload = [{
    operationName: 'ChannelFollows',
    variables: { limit: 100, login: login, order: 'DESC' },
    extensions: {
      persistedQuery: {
        version: 1,
        sha256Hash: 'eecf815273d3d949e5cf0085cc5084cd8a1b5b7b6f7990cf43cb0beadf546907',
      },
    },
  }];

  // Tentativa 2: query inline com totalCount (fallback)
  const inlineFollowingQuery = `query {
    user(login: "${login}") {
      follows(first: 100, order: DESC) {
        totalCount
        edges { followedAt node { login displayName profileImageURL(width: 50) } }
      }
    }
  }`;

  try {
    const [userData, followData] = await Promise.allSettled([
      gqlRequest({ query: userQuery, variables: {} }),
      gqlRequest(followingPayload),
    ]);

    const u = userData.status === 'fulfilled'
      ? (userData.value as any)?.data?.user
      : null;
    if (!u) return null;

    // Parse da lista "a seguir" — tentar persisted query primeiro
    const following: FollowedChannel[] = [];
    let gotEdgesFromApi = false;
    let followingCount: number | null = null;

    if (followData.status === 'fulfilled') {
      const followConn = (followData.value as any)?.[0]?.data?.user?.follows;
      const edges = followConn?.edges;
      if (Array.isArray(edges)) {
        gotEdgesFromApi = true;
        for (const edge of edges) {
          const node = edge?.node;
          if (node) {
            following.push({
              login: node.login,
              displayName: node.displayName,
              profileImageURL: node.profileImageURL || '',
              followedAt: edge.followedAt || '',
            });
          }
        }
      }
    }

    // Fallback: query inline (pode dar totalCount mesmo sem edges, ou vice-versa)
    try {
      const inlineData = await gqlRequest({ query: inlineFollowingQuery, variables: {} });
      const conn = (inlineData as any)?.data?.user?.follows;
      if (conn) {
        if (typeof conn.totalCount === 'number') followingCount = conn.totalCount;
        const edges = conn.edges;
        if (Array.isArray(edges) && edges.length > 0) {
          gotEdgesFromApi = true;
          for (const edge of edges) {
            const node = edge?.node;
            if (node && !following.some(f => f.login === node.login)) {
              following.push({
                login: node.login,
                displayName: node.displayName,
                profileImageURL: node.profileImageURL || '',
                followedAt: edge.followedAt || '',
              });
            }
          }
          if (followingCount === null) followingCount = following.length;
        }
      }
    } catch { /* indisponível */ }

    // Dados disponíveis se obtivemos edges reais ou um totalCount válido
    const followingAvailable = following.length > 0 || followingCount !== null;

    return {
      login: u.login,
      displayName: u.displayName,
      description: u.description || '',
      createdAt: u.createdAt,
      profileImageURL: u.profileImageURL,
      followers: u.followers?.totalCount ?? 0,
      followingCount: followingAvailable ? (followingCount ?? following.length) : 0,
      isPartner: u.roles?.isPartner ?? false,
      isAffiliate: u.roles?.isAffiliate ?? false,
      following,
      followingAvailable,
    };
  } catch (err) {
    console.error('Error fetching viewer profile:', err);
    return null;
  }
}

// ─── Viewer count (lightweight) ───────────────

export async function getViewerCount(channelLogin: string): Promise<number> {
  const query = `query { user(login: "${channelLogin}") { stream { viewersCount } } }`;
  try {
    const data = (await gqlRequest({ query, variables: {} })) as any;
    return data?.data?.user?.stream?.viewersCount ?? 0;
  } catch { return 0; }
}

// ─── Connection test ──────────────────────────

export async function testConnection(): Promise<boolean> {
  try {
    const d = await getChannelInfo('twitch');
    return !!d;
  } catch { return false; }
}
