"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  BadgeCheck,
  Bot,
  CalendarClock,
  CalendarDays,
  CircleAlert,
  Crown,
  Download,
  Eye,
  Gamepad2,
  History,
  LayoutDashboard,
  Loader2,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
} from "lucide-react";
import {
  analyzeBotPatterns,
  isSpikeMonthAccount,
  scoreViewerHeuristics,
  type BotAnalysis,
} from "@/lib/bot-detector";
import { formatAge, formatCompact, formatDate, formatNumber, getAgeBadge, getAgeDays } from "@/lib/format";
import ViewerProfileModal, { type ViewerSnapshot } from "@/components/viewer-profile-modal";
import {
  BotDonut,
  MonthlyChart,
  TimelineChart,
  YearChart,
  type TimePoint,
} from "@/components/analysis-charts";

/* ─── Tipos ─── */

interface ChannelInfo {
  id: string;
  login: string;
  displayName: string;
  description: string;
  createdAt: string;
  profileImageURL: string;
  isPartner: boolean;
  isAffiliate: boolean;
  followers: number;
  stream: { title: string; viewersCount: number; game: string } | null;
}

interface ChattersResponse {
  viewers: string[];
  totalCount: number;
  broadcasters: string[];
  moderators: string[];
  vips: string[];
  chatbots: string[];
  streamViewers: number;
}

interface UserBasic {
  login: string;
  displayName: string;
  createdAt: string;
  profileImageURL: string;
  followers: number;
}

type ViewerStatus = "bot" | "suspeito" | "ok";

interface TrackedViewer {
  login: string;
  displayName: string;
  createdAt: string;
  profileImageURL: string;
  followers: number;
  role: "broadcaster" | "moderador" | "vip" | "chatbot" | "viewer";
  /** perfil completo já obtido? (senão tenta de novo no ciclo seguinte) */
  dataFetched: boolean;
  firstSeen: number;
  lastSeen: number;
  score: number;
  reasons: string[];
  status: ViewerStatus;
  sameDayCount: number;
  spikeHit: boolean;
}

type TabId = "resumo" | "viewers" | "contas" | "bots";

const ROLE_ICON: Record<TrackedViewer["role"], { icon: any; cls: string; label: string }> = {
  broadcaster: { icon: Crown, cls: "text-amber-400", label: "Streamer" },
  moderador: { icon: ShieldCheck, cls: "text-emerald-400", label: "Moderador" },
  vip: { icon: Star, cls: "text-pink-400", label: "VIP" },
  chatbot: { icon: Bot, cls: "text-sky-400", label: "Chatbot oficial" },
  viewer: { icon: Users, cls: "text-zinc-500", label: "Viewer" },
};

const fmtElapsed = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

function exportCsv(viewers: TrackedViewer[], channel: string) {
  const header = "login;display_name;criado_em;idade_dias;seguidores;cargo;score;estado";
  const rows = viewers.map((v) =>
    [
      v.login,
      `"${v.displayName.replaceAll('"', '""')}"`,
      v.createdAt,
      getAgeDays(v.createdAt),
      v.followers,
      v.role,
      v.score,
      v.status,
    ].join(";"),
  );
  const blob = new Blob(["\uFEFF" + [header, ...rows].join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sniker-bots-${channel}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─── Componente principal ─── */

export default function TrackerApp({ channel }: { channel: string }) {
  const [channelInfo, setChannelInfo] = useState<ChannelInfo | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [isTracking, setIsTracking] = useState(false);
  const [, setViewVersion] = useState(0);
  const [analysis, setAnalysis] = useState<BotAnalysis | null>(null);
  const [timeline, setTimeline] = useState<TimePoint[]>([]);
  const [streamViewers, setStreamViewers] = useState(0);
  const [twitchChatTotal, setTwitchChatTotal] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [cycles, setCycles] = useState(0);
  const [apiStatus, setApiStatus] = useState<"ok" | "fetching" | "error">("ok");
  const [notice, setNotice] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("resumo");

  // filtros
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ViewerStatus>("all");
  const [sortBy, setSortBy] = useState<"score" | "name" | "new" | "old" | "role">("score");
  const [showCount, setShowCount] = useState(24);

  const [selectedLogin, setSelectedLogin] = useState<string | null>(null);

  // Fonte de verdade MUTÁVEL — evita o bug de stale closure do original,
  // que capturava o estado vazio e re-transferia TODOS os perfis a cada ciclo.
  const viewersRef = useRef(new Map<string, TrackedViewer>());
  const trackingRef = useRef(false);
  const inFlightRef = useRef(false);
  const lastSaveRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analysisRef = useRef<BotAnalysis | null>(null);
  const channelInfoRef = useRef<ChannelInfo | null>(null);
  channelInfoRef.current = channelInfo;

  const bump = () => setViewVersion((v) => v + 1);

  useEffect(() => {
    document.title = `${channel} · Sniker Bot Checker`;
    return () => {
      document.title = "Sniker Bot Checker";
    };
  }, [channel]);

  /* ─── Ciclo de recolha ─── */
  const doFetch = useCallback(async () => {
    if (inFlightRef.current) return; // evita ciclos sobrepostos
    inFlightRef.current = true;
    setApiStatus("fetching");
    try {
      const res = await fetch(`/api/twitch/chatters/${encodeURIComponent(channel)}`);
      if (!res.ok) throw new Error("chatters");
      const chatters = (await res.json()) as ChattersResponse;

      setTwitchChatTotal(chatters.totalCount);
      if (chatters.streamViewers > 0) setStreamViewers(chatters.streamViewers);

      // Perfis em falta: logins novos + viewers ainda sem dados
      // (retries automáticos; máx. 350 por ciclo para distribuir carga)
      const map = viewersRef.current;
      const missingLogins = chatters.viewers.filter((v) => {
        const e = map.get(v);
        return !e || !e.dataFetched;
      });
      let userInfo = new Map<string, UserBasic>();
      if (missingLogins.length > 0) {
        try {
          const r = await fetch("/api/twitch/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ logins: missingLogins.slice(0, 350) }),
          });
          if (r.ok) {
            const { users } = (await r.json()) as { users: UserBasic[] };
            userInfo = new Map(users.map((u) => [u.login, u]));
          }
        } catch {
          /* próxima ronda tenta de novo */
        }
      }

      const now = Date.now();
      const roleMap = new Map<string, TrackedViewer["role"]>();
      chatters.broadcasters.forEach((v) => roleMap.set(v, "broadcaster"));
      chatters.moderators.forEach((v) => roleMap.set(v, "moderador"));
      chatters.vips.forEach((v) => roleMap.set(v, "vip"));
      chatters.chatbots.forEach((v) => roleMap.set(v, "chatbot"));

      for (const login of chatters.viewers) {
        const info = userInfo.get(login);
        const existing = map.get(login);
        if (existing) {
          existing.lastSeen = now;
          existing.role = roleMap.get(login) ?? existing.role;
          // Fusão tardia: perfil chegou depois de o viewer já estar no mapa
          if (info && !existing.dataFetched) {
            existing.displayName = info.displayName || existing.displayName;
            existing.createdAt = info.createdAt;
            existing.profileImageURL = info.profileImageURL;
            existing.followers = info.followers;
            existing.dataFetched = true;
          }
        } else {
          map.set(login, {
            login,
            displayName: info?.displayName || login,
            createdAt: info?.createdAt ?? "",
            profileImageURL: info?.profileImageURL ?? "",
            followers: info?.followers ?? 0,
            role: roleMap.get(login) ?? "viewer",
            dataFetched: Boolean(info),
            firstSeen: now,
            lastSeen: now,
            score: 0,
            reasons: [],
            status: "ok",
            sameDayCount: 0,
            spikeHit: false,
          });
        }
      }

      // Poda suave (12 min): a amostragem da Twitch roda lentamente, por isso
      // acumulamos viewers ao longo de vários ciclos — como a extensão faz.
      const cutoff = now - 12 * 60 * 1000;
      for (const [key, v] of map) if (v.lastSeen < cutoff) map.delete(key);

      // Análise mensal
      const accounts = [...map.values()]
        .filter((v) => v.createdAt)
        .map((v) => ({ login: v.login, createdAt: v.createdAt }));
      const next = analyzeBotPatterns(accounts);
      analysisRef.current = next;
      setAnalysis(next);

      // Clusters por dia
      const dayCounts = new Map<string, number>();
      for (const v of map.values()) {
        if (!v.createdAt) continue;
        const dk = new Date(v.createdAt).toISOString().slice(0, 10);
        dayCounts.set(dk, (dayCounts.get(dk) ?? 0) + 1);
      }

      // Classificação combinada (heurísticas + pico mensal)
      for (const v of map.values()) {
        if (!v.createdAt) {
          v.status = "ok";
          v.score = 0;
          v.sameDayCount = 0;
          v.spikeHit = false;
          continue;
        }
        v.sameDayCount =
          dayCounts.get(new Date(v.createdAt).toISOString().slice(0, 10)) ?? 0;
        const h = scoreViewerHeuristics({
          login: v.login,
          createdAt: v.createdAt,
          profileImageURL: v.profileImageURL,
          followers: v.followers,
          sameDayCount: v.sameDayCount,
        });
        v.score = h.score;
        v.reasons = h.reasons;
        v.spikeHit = isSpikeMonthAccount(v.createdAt, next.spikeMonths);

        const isBot =
          h.level === "bot" || (v.spikeHit && (h.score >= 35 || v.sameDayCount >= 3));
        v.status = isBot ? "bot" : h.level === "suspeito" || v.sameDayCount >= 3 ? "suspeito" : "ok";
      }

      bump();
      setCycles((c) => c + 1);

      const t = new Date().toLocaleTimeString("pt-PT", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      setTimeline((prev) => [
        ...prev.slice(-59),
        { time: t, stream: chatters.streamViewers, autenticados: map.size },
      ]);

      // Guardar scan (1ª vez + a cada 60s; servidor também faz throttle)
      if (now - lastSaveRef.current > 55_000 && accounts.length >= 3) {
        lastSaveRef.current = now;
        const info = channelInfoRef.current;
        fetch("/api/scans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel,
            displayName: info?.displayName ?? channel,
            avatarUrl: info?.profileImageURL ?? "",
            isLive: Boolean(info?.stream),
            streamViewers: chatters.streamViewers,
            trackedViewers: map.size,
            authenticatedUsers: next.totalAccounts,
            suspectedBots: next.suspectedBots,
            botPercentage: next.botPercentage,
            baseline: next.baseline,
            spikeMonths: next.spikeMonths,
          }),
        }).catch(() => {});
      }

      setApiStatus("ok");
      setNotice("");
    } catch {
      setApiStatus("error");
      setNotice("Falha num ciclo de recolha — a tentar novamente…");
    } finally {
      inFlightRef.current = false;
    }
  }, [channel]);

  const startTracking = useCallback(() => {
    if (trackingRef.current) return;
    trackingRef.current = true;
    setIsTracking(true);
    void doFetch();
    intervalRef.current = setInterval(() => {
      if (trackingRef.current) void doFetch();
    }, 10_000);
    elapsedRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
  }, [doFetch]);

  const stopTracking = useCallback(() => {
    trackingRef.current = false;
    setIsTracking(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (elapsedRef.current) clearInterval(elapsedRef.current);
  }, []);

  // Carrega canal e auto-inicia o tracking
  useEffect(() => {
    let cancelled = false;
    setPhase("loading");
    fetch(`/api/twitch/channel/${encodeURIComponent(channel)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Erro");
        return r.json();
      })
      .then((info: ChannelInfo) => {
        if (cancelled) return;
        setChannelInfo(info);
        setStreamViewers(info.stream?.viewersCount ?? 0);
        setPhase("ready");
        startTracking();
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadError(e.message ?? "Falha ao carregar");
        setPhase("error");
      });
    return () => {
      cancelled = true;
      stopTracking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);

  /* ─── Dados derivados ─── */
  const viewers = useMemo(
    () => [...viewersRef.current.values()],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewersRef, channel, analysis, cycles],
  );

  const filtered = useMemo(() => {
    let arr = viewers;
    if (search) {
      const q = search.toLowerCase();
      arr = arr.filter(
        (v) => v.login.includes(q) || v.displayName.toLowerCase().includes(q),
      );
    }
    if (statusFilter !== "all") arr = arr.filter((v) => v.status === statusFilter);
    const sorted = [...arr].sort((a, b) => {
      switch (sortBy) {
        case "score":
          return b.score - a.score;
        case "new":
          return getAgeDays(a.createdAt) - getAgeDays(b.createdAt);
        case "old":
          return getAgeDays(b.createdAt) - getAgeDays(a.createdAt);
        case "role":
          return a.role.localeCompare(b.role);
        default:
          return a.login.localeCompare(b.login);
      }
    });
    return sorted;
  }, [viewers, search, statusFilter, sortBy]);

  const counts = useMemo(() => {
    let bots = 0,
      susp = 0;
    for (const v of viewers) {
      if (v.status === "bot") bots++;
      else if (v.status === "suspeito") susp++;
    }
    return {
      total: viewers.length,
      bots,
      susp,
      ok: viewers.length - bots - susp,
    };
  }, [viewers]);

  const yearDist = useMemo(() => {
    const m = new Map<number, number>();
    for (const v of viewers) {
      if (!v.createdAt) continue;
      const y = new Date(v.createdAt).getFullYear();
      m.set(y, (m.get(y) ?? 0) + 1);
    }
    return [...m.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([year, count]) => ({ year: String(year), count }));
  }, [viewers]);

  const oldest = useMemo(
    () =>
      viewers
        .filter((v) => v.createdAt)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .slice(0, 5),
    [viewers],
  );
  const newest = useMemo(
    () =>
      viewers
        .filter((v) => v.createdAt)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5),
    [viewers],
  );
  const topSuspects = useMemo(
    () =>
      viewers
        .filter((v) => v.status !== "ok")
        .sort((a, b) => b.score - a.score)
        .slice(0, 12),
    [viewers],
  );

  const openViewer = (v: TrackedViewer) => setSelectedLogin(v.login);
  const selectedSnapshot: ViewerSnapshot | null = useMemo(() => {
    if (!selectedLogin) return null;
    const v = viewersRef.current.get(selectedLogin);
    return v ? { status: v.status, score: v.score, reasons: v.reasons } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLogin, viewers]);

  /* ─── Render ─── */

  const tabs: { id: TabId; label: string; icon: any; badge?: string }[] = [
    { id: "resumo", label: "Resumo", icon: LayoutDashboard },
    { id: "viewers", label: "Viewers", icon: Users, badge: counts.total ? String(counts.total) : undefined },
    { id: "contas", label: "Contas", icon: CalendarDays },
    { id: "bots", label: "Bots", icon: Bot, badge: counts.bots ? String(counts.bots) : undefined },
  ];

  if (phase === "loading") {
    return (
      <div className="relative flex min-h-svh items-center justify-center">
        <div className="pointer-events-none absolute inset-0"><div className="absolute inset-0 bg-grid" /></div>
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <Loader2 className="h-10 w-10 animate-spin text-twitch-bright" />
          </div>
          <p className="text-sm text-zinc-400">A ligar a <span className="font-semibold text-white">{channel}</span>…</p>
          <p className="text-xs text-zinc-600">Ligação direta à Twitch, sem proxies</p>
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="relative flex min-h-svh items-center justify-center px-4">
        <div className="pointer-events-none absolute inset-0"><div className="absolute inset-0 bg-grid" /></div>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          className="glass max-w-md rounded-3xl p-8 text-center">
          <CircleAlert className="mx-auto h-10 w-10 text-red-400" />
          <h1 className="font-display mt-4 text-xl font-bold text-white">{loadError}</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Verifica se o nome do canal está correto e se a conta existe na Twitch.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link href="/" className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-zinc-300 transition hover:border-white/20 hover:text-white">
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Link>
            <button onClick={() => window.location.reload()}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-twitch to-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110">
              <RefreshCw className="h-4 w-4" /> Tentar de novo
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="relative min-h-svh pb-10">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-grid" />
        <div className="absolute -top-32 left-1/2 h-[380px] w-[720px] -translate-x-1/2 rounded-full bg-twitch/12 blur-[130px]" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-void/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 text-zinc-400 transition hover:border-white/25 hover:text-white" aria-label="Voltar">
            <ArrowLeft className="h-4 w-4" />
          </Link>

          {channelInfo?.profileImageURL ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={channelInfo.profileImageURL} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-twitch/20 font-bold text-twitch-bright">
              {channel.charAt(0).toUpperCase()}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <a href={`https://twitch.tv/${channel}`} target="_blank" rel="noreferrer"
                className="font-display truncate text-[15px] font-bold text-white hover:text-twitch-bright">
                {channelInfo?.displayName ?? channel}
              </a>
              {channelInfo?.isPartner && <BadgeCheck className="h-4 w-4 shrink-0 text-twitch-bright" />}
              {channelInfo?.stream && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-400">
                  <span className="live-dot h-1.5 w-1.5 rounded-full bg-red-500" /> Live
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-zinc-500">
              {channelInfo?.stream ? (
                <span className="flex items-center gap-1 truncate">
                  <Gamepad2 className="h-3 w-3 shrink-0" /> {channelInfo.stream.game}
                </span>
              ) : (
                <span>Stream offline — a analisar chatters ligados</span>
              )}
            </div>
          </div>

          <div className="hidden items-center gap-4 text-xs text-zinc-400 md:flex">
            <span className="flex items-center gap-1.5">
              <Radio className={`h-3.5 w-3.5 ${apiStatus === "error" ? "text-red-400" : apiStatus === "fetching" ? "text-amber-400" : "text-emerald-400"}`} />
              ciclo {cycles}
            </span>
            <span className="flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" /> {fmtElapsed(elapsed)}
            </span>
          </div>

          <button
            onClick={isTracking ? stopTracking : startTracking}
            className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition active:scale-[0.98] ${
              isTracking
                ? "border border-white/15 text-zinc-200 hover:border-red-400/40 hover:text-red-300"
                : "bg-gradient-to-r from-twitch to-indigo-500 text-white hover:brightness-110"
            }`}
          >
            {isTracking ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            <span className="hidden sm:inline">{isTracking ? "Pausar" : "Retomar"}</span>
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-[1400px] px-4 pt-6 sm:px-6">
        {notice && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-300">
            <CircleAlert className="h-4 w-4 shrink-0" /> {notice}
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6 flex gap-1.5 overflow-x-auto rounded-2xl border border-white/5 bg-white/[0.02] p-1.5">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                activeTab === t.id ? "bg-twitch/20 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
              }`}>
              <t.icon className="h-4 w-4" />
              {t.label}
              {t.badge && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${t.id === "bots" ? "bg-red-500/25 text-red-300" : "bg-white/10 text-zinc-300"}`}>
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* ════ RESUMO ════ */}
          {activeTab === "resumo" && (
            <motion.div key="resumo" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
                {(() => {
                  const coverage = twitchChatTotal > 0 && counts.total > 0
                    ? Math.min(100, Math.round((counts.total / twitchChatTotal) * 100))
                    : 0;
                  return [
                    { label: "Viewers na stream", value: formatCompact(streamViewers), icon: Eye, cls: "text-twitch-bright", sub: undefined as string | undefined },
                    { label: "No chat (Twitch)", value: formatCompact(twitchChatTotal), icon: Users, cls: "text-emerald-400", sub: "contagem oficial" },
                    { label: "Rastreados", value: formatCompact(counts.total), icon: Radio, cls: "text-sky-400", sub: coverage ? `${coverage}% do chat` : undefined },
                    { label: "Bots suspeitos", value: formatCompact(counts.bots), icon: Bot, cls: "text-red-400", sub: counts.susp ? `+${counts.susp} suspeitos` : undefined },
                    { label: "% de bots", value: `${analysis?.botPercentage ?? 0}%`, icon: ShieldAlert, cls: (analysis?.botPercentage ?? 0) > 20 ? "text-red-400" : (analysis?.botPercentage ?? 0) > 5 ? "text-amber-400" : "text-emerald-400", sub: undefined as string | undefined },
                    { label: "Meses de pico", value: String(analysis?.spikeMonths.length ?? 0), icon: CalendarClock, cls: "text-amber-400", sub: analysis?.baseline ? `baseline ${analysis.baseline}/mês` : undefined },
                  ].map((s, i) => (
                    <motion.div key={s.label} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                      className="glass rounded-2xl p-4">
                      <s.icon className={`h-4 w-4 ${s.cls}`} />
                      <div className="font-display mt-2 text-2xl font-bold text-white">{s.value}</div>
                      <div className="text-[11px] uppercase tracking-wider text-zinc-500">{s.label}</div>
                      {s.sub && <div className="mt-0.5 text-[10px] text-zinc-500">{s.sub}</div>}
                    </motion.div>
                  ));
                })()}
              </div>

              {twitchChatTotal > 0 && counts.total > 0 && counts.total / twitchChatTotal < 0.6 && (
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-sky-500/20 bg-sky-500/[0.07] px-4 py-2.5 text-xs text-sky-300">
                  <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin-slow" />
                  A Twitch devolve amostras rotativas de ~100 viewers por ciclo — o total rastreado converge
                  para os {formatCompact(twitchChatTotal)} chatters ao fim de 1–2 minutos de tracking.
                </div>
              )}

              <div className="mt-4 grid gap-4 lg:grid-cols-3">
                <div className="glass rounded-3xl p-5 lg:col-span-2">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-display text-sm font-semibold text-white">Viewers vs chatters em tempo real</h3>
                    <span className="text-[11px] text-zinc-500">um ponto a cada 10s</span>
                  </div>
                  <div className="h-56"><TimelineChart data={timeline} /></div>
                </div>
                <div className="glass rounded-3xl p-5">
                  <h3 className="font-display mb-3 text-sm font-semibold text-white">Legítimos vs bots</h3>
                  <div className="h-56"><BotDonut botPct={analysis?.botPercentage ?? 0} /></div>
                </div>
              </div>

              {/* Idades */}
              {analysis && analysis.totalAccounts > 0 && (
                <div className="mt-4 glass rounded-3xl p-5">
                  <h3 className="font-display mb-4 text-sm font-semibold text-white">Idade das contas no chat ({formatNumber(analysis.totalAccounts)})</h3>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                    {[
                      { label: "< 7 dias", value: analysis.accountAgeStats.under7Days, cls: "text-red-400" },
                      { label: "< 30 dias", value: analysis.accountAgeStats.under30Days, cls: "text-red-300" },
                      { label: "< 90 dias", value: analysis.accountAgeStats.under90Days, cls: "text-amber-400" },
                      { label: "< 1 ano", value: analysis.accountAgeStats.under1Year, cls: "text-sky-400" },
                      { label: "Mediana", value: formatAge(new Date(Date.now() - analysis.accountAgeStats.medianDays * 86400000).toISOString()), cls: "text-emerald-400" },
                    ].map((a) => (
                      <div key={a.label} className="rounded-xl border border-white/5 bg-white/[0.02] p-3.5 text-center">
                        <div className={`font-display text-xl font-bold ${a.cls}`}>{a.value}</div>
                        <div className="mt-0.5 text-[11px] uppercase tracking-wider text-zinc-500">{a.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Clusters + picos */}
              {(analysis?.spikeMonths.length || analysis?.dayClusters.length) ? (
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  {!!analysis?.spikeMonths.length && (
                    <div className="glass rounded-3xl p-5">
                      <h3 className="font-display mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                        <ShieldAlert className="h-4 w-4 text-red-400" /> Meses de criação em massa
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {analysis.spikeMonths.map((m) => {
                          const bucket = analysis.monthlyDistribution.find((b) => b.month === m);
                          return (
                            <span key={m} className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300">
                              {m} · {bucket?.count ?? 0} contas
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {!!analysis?.dayClusters.length && (
                    <div className="glass rounded-3xl p-5">
                      <h3 className="font-display mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                        <CalendarClock className="h-4 w-4 text-amber-400" /> Rajadas no mesmo dia
                      </h3>
                      <div className="space-y-1.5">
                        {analysis.dayClusters.slice(0, 5).map((c) => (
                          <div key={c.date} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-xs">
                            <span className="text-zinc-300">{formatDate(c.date)}</span>
                            <span className="font-semibold text-amber-300">{c.count} contas</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              {viewers.length === 0 && (
                <div className="glass mt-4 rounded-3xl p-10 text-center">
                  <Users className="mx-auto h-8 w-8 text-zinc-600" />
                  <p className="mt-3 text-sm text-zinc-400">
                    Ainda sem chatters detetados. Se a stream estiver offline, só aparecem os chatters ligados ao chat.
                  </p>
                </div>
              )}
            </motion.div>
          )}

          {/* ════ VIEWERS ════ */}
          {activeTab === "viewers" && (
            <motion.div key="viewers" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Procurar viewer…"
                    className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2.5 pl-10 pr-4 text-sm text-white placeholder-zinc-500 outline-none transition focus:border-twitch/50"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
                    {([["all", "Todos"], ["bot", "Bots"], ["suspeito", "Suspeitos"], ["ok", "Legítimos"]] as const).map(([id, label]) => (
                      <button key={id} onClick={() => setStatusFilter(id)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${statusFilter === id ? "bg-twitch/25 text-white" : "text-zinc-400 hover:text-white"}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}
                    className="rounded-xl border border-white/10 bg-[#12121f] px-3 py-2.5 text-xs text-zinc-300 outline-none focus:border-twitch/50">
                    <option value="score">Maior score</option>
                    <option value="new">Contas mais novas</option>
                    <option value="old">Contas mais antigas</option>
                    <option value="name">Nome (A–Z)</option>
                    <option value="role">Cargo</option>
                  </select>
                  <button onClick={() => exportCsv(filtered, channel)}
                    className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs font-medium text-zinc-300 transition hover:border-twitch/40 hover:text-white">
                    <Download className="h-3.5 w-3.5" /> CSV
                  </button>
                </div>
              </div>

              <div className="mb-3 text-xs text-zinc-500">
                {formatNumber(filtered.length)} de {formatNumber(counts.total)} viewers
                {counts.bots > 0 && <span className="ml-2 text-red-400">· {counts.bots} bots</span>}
                {counts.susp > 0 && <span className="ml-2 text-amber-400">· {counts.susp} suspeitos</span>}
              </div>

              <div className="glass overflow-hidden rounded-3xl">
                {filtered.length === 0 ? (
                  <div className="p-12 text-center text-sm text-zinc-500">
                    {viewers.length === 0 ? "À espera dos primeiros chatters…" : "Nenhum viewer corresponde aos filtros."}
                  </div>
                ) : (
                  <ul className="divide-y divide-white/[0.04]">
                    {filtered.slice(0, showCount).map((v) => {
                      const age = getAgeBadge(v.createdAt);
                      const Role = ROLE_ICON[v.role];
                      return (
                        <li key={v.login}>
                          <button onClick={() => openViewer(v)}
                            className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.03] sm:px-5">
                            {v.profileImageURL ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={v.profileImageURL} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" loading="lazy" />
                            ) : (
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/5 text-xs font-bold text-zinc-400">
                                {v.displayName.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate text-sm font-medium text-white">{v.displayName}</span>
                                {v.role !== "viewer" && <Role.icon className={`h-3.5 w-3.5 shrink-0 ${Role.cls}`} />}
                              </div>
                              <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
                                <span className={`rounded border px-1.5 py-px ${age.className}`}>{age.label}</span>
                                <span className="hidden sm:inline">{formatNumber(v.followers)} seguidores</span>
                              </div>
                            </div>

                            {/* Score bar */}
                            <div className="hidden w-28 shrink-0 sm:block">
                              <div className="mb-1 flex items-center justify-between text-[10px] text-zinc-500">
                                <span>score</span>
                                <span className={v.score >= 60 ? "text-red-400" : v.score >= 35 ? "text-amber-400" : "text-zinc-400"}>{v.score}</span>
                              </div>
                              <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                                <div
                                  className={`h-full rounded-full transition-all ${v.score >= 60 ? "bg-red-500" : v.score >= 35 ? "bg-amber-400" : "bg-emerald-500"}`}
                                  style={{ width: `${Math.max(4, v.score)}%` }}
                                />
                              </div>
                            </div>

                            <span className={`flex w-24 shrink-0 items-center justify-end gap-1 text-[11px] font-semibold ${
                              v.status === "bot" ? "text-red-400" : v.status === "suspeito" ? "text-amber-400" : "text-emerald-500/80"
                            }`}>
                              {v.status === "bot" ? <Bot className="h-3.5 w-3.5" /> : v.status === "suspeito" ? <CircleAlert className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                              {v.status === "bot" ? "Bot" : v.status === "suspeito" ? "Suspeito" : "OK"}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {filtered.length > showCount && (
                  <button onClick={() => setShowCount((c) => c + 24)}
                    className="w-full border-t border-white/5 py-3.5 text-center text-xs font-medium text-twitch-bright transition hover:bg-white/[0.03]">
                    Mostrar mais {Math.min(24, filtered.length - showCount)} de {formatNumber(filtered.length - showCount)} restantes
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {/* ════ CONTAS ════ */}
          {activeTab === "contas" && (
            <motion.div key="contas" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
              <div className="glass rounded-3xl p-5">
                <h3 className="font-display mb-3 text-sm font-semibold text-white">Ano de criação das contas</h3>
                <div className="h-64">
                  {yearDist.length > 0 ? <YearChart data={yearDist} /> : (
                    <div className="flex h-full items-center justify-center text-sm text-zinc-500">Sem dados ainda…</div>
                  )}
                </div>
                <p className="mt-2 text-[11px] text-zinc-500">
                  O ano atual aparece a âmbar — uma barra âmbar gigante indica contas criadas recentemente em massa.
                </p>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="glass rounded-3xl p-5">
                  <h3 className="font-display mb-4 flex items-center gap-2 text-sm font-semibold text-white">
                    <Sparkles className="h-4 w-4 text-amber-400" /> Contas mais recentes
                  </h3>
                  <ViewerMiniList list={newest} highlight="new" onOpen={openViewer} />
                </div>
                <div className="glass rounded-3xl p-5">
                  <h3 className="font-display mb-4 flex items-center gap-2 text-sm font-semibold text-white">
                    <History className="h-4 w-4 text-emerald-400" /> Veteranos do chat
                  </h3>
                  <ViewerMiniList list={oldest} highlight="old" onOpen={openViewer} />
                </div>
              </div>
            </motion.div>
          )}

          {/* ════ BOTS ════ */}
          {activeTab === "bots" && (
            <motion.div key="bots" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
              <div className="glass rounded-3xl p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-display text-sm font-semibold text-white">Contas criadas por mês</h3>
                  <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#7c5cf0]" /> normal</span>
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-red-500" /> mês de pico</span>
                  </div>
                </div>
                <div className="h-72">
                  {analysis && analysis.monthlyDistribution.length > 0 ? (
                    <MonthlyChart data={analysis.monthlyDistribution} />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-zinc-500">A recolher dados…</div>
                  )}
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-3">
                <div className="glass rounded-3xl p-5">
                  <h3 className="font-display mb-3 text-sm font-semibold text-white">Leitura do veredito</h3>
                  {analysis && analysis.botPercentage > 0 ? (
                    <div className="space-y-3 text-sm leading-relaxed text-zinc-300">
                      <p>
                        Estimamos <strong className="text-red-400">{formatNumber(analysis.suspectedBots)} bots</strong>{" "}
                        ({analysis.botPercentage}%) entre as {formatNumber(analysis.totalAccounts)} contas analisadas.
                      </p>
                      <p className="text-zinc-400">
                        Baseline: <strong className="text-white">{analysis.baseline}</strong> contas/mês é o ritmo
                        "normal" de aparecimento de viewers neste chat. Os meses muito acima disto são picos anómalos.
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm leading-relaxed text-zinc-400">
                      Sem picos significativos de criação de contas por enquanto — o chat parece maioritariamente
                      orgânico. A análise continua a correr a cada 10 segundos.
                    </p>
                  )}
                  <div className="mt-4 rounded-xl border border-white/5 bg-white/[0.02] p-3 text-[11px] leading-relaxed text-zinc-500">
                    A classificação combina 3 sinais: distribuição mensal estatística, heurísticas por conta
                    (username, avatar, idade, seguidores) e rajadas de contas criadas no mesmo dia.
                  </div>
                </div>

                <div className="glass rounded-3xl p-5 lg:col-span-2">
                  <h3 className="font-display mb-4 flex items-center gap-2 text-sm font-semibold text-white">
                    <Bot className="h-4 w-4 text-red-400" /> Top contas suspeitas ({counts.bots + counts.susp})
                  </h3>
                  {topSuspects.length === 0 ? (
                    <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
                      <ShieldCheck className="h-7 w-7 text-emerald-500/70" />
                      <p className="text-sm text-zinc-400">Nenhuma conta suspeita detetada no chat.</p>
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {topSuspects.map((v) => (
                        <li key={v.login}>
                          <button onClick={() => openViewer(v)}
                            className="flex w-full items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5 text-left transition hover:border-red-400/30">
                            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold ${
                              v.status === "bot" ? "bg-red-500/15 text-red-300" : "bg-amber-500/15 text-amber-300"
                            }`}>
                              {v.score}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-white">{v.displayName}</div>
                              <div className="truncate text-[11px] text-zinc-500">
                                {v.reasons[0] ?? (v.spikeHit ? "Criada num mês de pico" : "Sinais fracos")}
                              </div>
                            </div>
                            <span className="shrink-0 text-[11px] text-zinc-500">{formatAge(v.createdAt)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <ViewerProfileModal
        login={selectedLogin}
        snapshot={selectedSnapshot}
        onClose={() => setSelectedLogin(null)}
      />
    </div>
  );
}

/* ─── Lista pequena (contas novas/antigas) ─── */
function ViewerMiniList({
  list,
  highlight,
  onOpen,
}: {
  list: TrackedViewer[];
  highlight: "new" | "old";
  onOpen: (v: TrackedViewer) => void;
}) {
  if (list.length === 0) {
    return <p className="text-sm text-zinc-500">Sem dados ainda…</p>;
  }
  return (
    <ul className="space-y-2">
      {list.map((v) => (
        <li key={v.login}>
          <button onClick={() => onOpen(v)}
            className="flex w-full items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5 text-left transition hover:border-twitch/30">
            {v.profileImageURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={v.profileImageURL} alt="" className="h-8 w-8 rounded-full object-cover" loading="lazy" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-xs font-bold text-zinc-500">
                {v.displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-white">{v.displayName}</div>
              <div className="text-[11px] text-zinc-500">{formatDate(v.createdAt)}</div>
            </div>
            <span className={`shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold ${
              highlight === "new" ? "bg-amber-500/10 text-amber-300" : "bg-emerald-500/10 text-emerald-300"
            }`}>
              {formatAge(v.createdAt)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
