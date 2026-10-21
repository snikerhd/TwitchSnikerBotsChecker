"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BadgeCheck,
  Bot,
  CalendarDays,
  CircleAlert,
  Eye,
  Heart,
  Loader2,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { formatAge, formatDate, formatNumber } from "@/lib/format";

export interface ViewerProfile {
  login: string;
  displayName: string;
  createdAt: string;
  profileImageURL: string;
  description: string;
  followers: number;
  followingCount: number;
  isPartner: boolean;
  isAffiliate: boolean;
  following: {
    login: string;
    displayName: string;
    profileImageURL: string;
    followedAt: string;
  }[];
  followingAvailable: boolean;
}

export interface ViewerSnapshot {
  status: "bot" | "suspeito" | "ok";
  score: number;
  reasons: string[];
}

interface Props {
  login: string | null;
  snapshot?: ViewerSnapshot | null;
  onClose: () => void;
}

export default function ViewerProfileModal({ login, snapshot, onClose }: Props) {
  const [profile, setProfile] = useState<ViewerProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!login) return;
    let cancelled = false;
    setProfile(null);
    setError(null);
    setLoading(true);

    fetch(`/api/twitch/viewer/${encodeURIComponent(login)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Erro");
        return r.json();
      })
      .then((p) => !cancelled && setProfile(p))
      .catch((e) => !cancelled && setError(e.message ?? "Falha ao carregar"))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [login]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    if (login) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [login, onClose]);

  const statusConfig = {
    bot: { label: "Bot provável", cls: "bg-red-500/15 text-red-300 border-red-500/30", icon: Bot },
    suspeito: { label: "Suspeito", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30", icon: CircleAlert },
    ok: { label: "Parece legítimo", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", icon: ShieldCheck },
  } as const;

  return (
    <AnimatePresence>
      {login && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 48, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 48, opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[88vh] w-full max-w-lg overflow-hidden overflow-y-auto rounded-t-3xl border border-white/10 bg-[#10101c] shadow-2xl sm:rounded-3xl"
          >
            <button
              onClick={onClose}
              className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>

            {loading && (
              <div className="flex h-72 flex-col items-center justify-center gap-3 text-zinc-400">
                <Loader2 className="h-7 w-7 animate-spin text-twitch-bright" />
                <span className="text-sm">A carregar perfil de @{login}…</span>
              </div>
            )}

            {!loading && error && (
              <div className="flex h-72 flex-col items-center justify-center gap-3 px-8 text-center">
                <CircleAlert className="h-8 w-8 text-red-400" />
                <p className="text-sm text-zinc-300">{error}</p>
                <p className="text-xs text-zinc-500">A conta pode ter sido suspensa ou removida.</p>
              </div>
            )}

            {!loading && profile && (
              <div>
                {/* Header */}
                <div className="relative h-24 bg-gradient-to-br from-twitch/50 via-indigo-600/40 to-fuchsia-600/30">
                  <div className="absolute inset-0 bg-grid opacity-60" />
                </div>
                <div className="relative px-6 pb-6">
                  <div className="-mt-10 mb-4 flex items-end justify-between">
                    {profile.profileImageURL ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={profile.profileImageURL}
                        alt={profile.displayName}
                        className="h-20 w-20 rounded-2xl border-4 border-[#10101c] object-cover shadow-xl"
                      />
                    ) : (
                      <div className="flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-[#10101c] bg-twitch/25 text-2xl font-bold text-twitch-bright">
                        {profile.displayName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    {snapshot && (
                      <span className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${statusConfig[snapshot.status].cls}`}>
                        {(() => { const I = statusConfig[snapshot.status].icon; return <I className="h-3.5 w-3.5" />; })()}
                        {statusConfig[snapshot.status].label} · {snapshot.score}/100
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-xl font-bold text-white">{profile.displayName}</h2>
                    {profile.isPartner && (
                      <span className="flex items-center gap-1 rounded-full bg-twitch/20 px-2 py-0.5 text-[11px] font-semibold text-twitch-bright">
                        <BadgeCheck className="h-3 w-3" /> Parceiro
                      </span>
                    )}
                    {profile.isAffiliate && !profile.isPartner && (
                      <span className="flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-semibold text-sky-300">
                        <Sparkles className="h-3 w-3" /> Afiliado
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-zinc-500">@{profile.login}</p>
                  {profile.description && (
                    <p className="mt-3 text-sm leading-relaxed text-zinc-300">{profile.description}</p>
                  )}

                  {/* Stats */}
                  <div className="mt-5 grid grid-cols-3 gap-2.5">
                    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3 text-center">
                      <CalendarDays className="mx-auto h-4 w-4 text-twitch-bright" />
                      <div className="mt-1.5 text-sm font-bold text-white">{formatAge(profile.createdAt)}</div>
                      <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                        {formatDate(profile.createdAt)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3 text-center">
                      <Users className="mx-auto h-4 w-4 text-emerald-400" />
                      <div className="mt-1.5 text-sm font-bold text-white">{formatNumber(profile.followers)}</div>
                      <div className="text-[10px] uppercase tracking-wider text-zinc-500">Seguidores</div>
                    </div>
                    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3 text-center">
                      <Heart className="mx-auto h-4 w-4 text-pink-400" />
                      <div className="mt-1.5 text-sm font-bold text-white">
                        {profile.followingAvailable ? formatNumber(profile.followingCount) : "—"}
                      </div>
                      <div className="text-[10px] uppercase tracking-wider text-zinc-500">A seguir</div>
                    </div>
                  </div>

                  {/* Razões da deteção */}
                  {snapshot && snapshot.reasons.length > 0 && (
                    <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-4">
                      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-300">
                        <Eye className="h-3.5 w-3.5" /> Sinais detetados
                      </div>
                      <ul className="space-y-1.5">
                        {snapshot.reasons.map((r) => (
                          <li key={r} className="flex items-start gap-2 text-sm text-zinc-300">
                            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                            {r}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Following */}
                  <div className="mt-5">
                    <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                      <UserCheck className="h-3.5 w-3.5" /> Canais seguidos
                    </div>
                    {profile.following.length > 0 ? (
                      <div className="grid grid-cols-2 gap-2">
                        {profile.following.slice(0, 8).map((f) => (
                          <a key={f.login} href={`https://twitch.tv/${f.login}`} target="_blank" rel="noreferrer"
                            className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] p-2 transition hover:border-twitch/30">
                            {f.profileImageURL ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={f.profileImageURL} alt="" className="h-6 w-6 rounded-full object-cover" />
                            ) : (
                              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-twitch/20 text-[10px] font-bold text-twitch-bright">
                                {f.displayName.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <span className="truncate text-xs text-zinc-300">{f.displayName}</span>
                          </a>
                        ))}
                      </div>
                    ) : (
                      <p className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-xs leading-relaxed text-zinc-500">
                        A Twitch tornou as listas de «a seguir» privadas em 2024 — não é possível
                        ver quem esta conta segue.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
