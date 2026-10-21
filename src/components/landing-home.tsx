"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useInView } from "framer-motion";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bot,
  CircleAlert,
  Clock,
  Crown,
  Database,
  Search,
  Server,
  ShieldCheck,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import type { ScanStats } from "@/lib/scan-stats";
import { formatCompact, formatNumber, timeAgo } from "@/lib/format";

function TwitchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
    </svg>
  );
}

function extractChannel(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const patterns = [
    /twitch\.tv\/([a-zA-Z0-9_]+)/,
    /^@?([a-zA-Z0-9_]{1,25})$/,
  ];
  for (const p of patterns) {
    const m = trimmed.match(p);
    if (m) return m[1].toLowerCase();
  }
  return null;
}

function CountUp({ value, duration = 1.4 }: { value: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / (duration * 1000));
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(eased * value));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, duration]);

  return <span ref={ref}>{formatCompact(display)}</span>;
}

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

export default function LandingHome({ stats }: { stats: ScanStats }) {
  const router = useRouter();
  const [inputValue, setInputValue] = useState("");
  const [inputError, setInputError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const channel = extractChannel(inputValue);
    if (channel) {
      setInputError("");
      router.push(`/scan/${encodeURIComponent(channel)}`);
    } else {
      setInputError("Introduz um nome ou URL de canal Twitch válido");
    }
  };

  const features = [
    {
      icon: Server,
      title: "Ligação direta à Twitch",
      desc: "Pedidos feitos no nosso servidor — sem proxies CORS lentos e falháveis. Muito mais rápido e fiável.",
      accent: "from-violet-500 to-purple-500",
    },
    {
      icon: Bot,
      title: "Deteção de bots melhorada",
      desc: "Algoritmo com baseline robusta que deteta botnets criadas este mês — o ponto cego das outras ferramentas.",
      accent: "from-red-500 to-rose-500",
    },
    {
      icon: Activity,
      title: "Tracking em tempo real",
      desc: "Contagem de viewers, chatters autenticados e % de bots atualizados a cada 10 segundos.",
      accent: "from-emerald-500 to-teal-500",
    },
    {
      icon: Users,
      title: "Perfis de viewers",
      desc: "Explora cada conta do chat: idade, seguidores, avatar e score de suspeição com razões explicáveis.",
      accent: "from-sky-500 to-blue-500",
    },
    {
      icon: BarChart3,
      title: "Gráficos de criação",
      desc: "Distribuição mensal e anual das contas — os picos de criação em massa saltam à vista.",
      accent: "from-amber-500 to-orange-500",
    },
    {
      icon: Database,
      title: "Histórico global",
      desc: "Cada análise fica registada na base de dados: vê scans recentes e o ranking de canais com mais bots.",
      accent: "from-fuchsia-500 to-pink-500",
    },
  ];

  const metricCards = [
    { icon: Search, label: "Análises feitas", value: stats.totalScans },
    { icon: Users, label: "Viewers analisados", value: stats.viewersAnalyzed },
    { icon: Bot, label: "Bots detetados", value: stats.botsDetected },
    { icon: TwitchIcon, label: "Canais únicos", value: stats.channelsScanned },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Backdrop */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-grid" />
        <div className="absolute -top-40 left-1/2 h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-twitch/18 blur-[140px]" />
        <div className="absolute top-[38rem] -left-48 h-[420px] w-[420px] rounded-full bg-indigo-600/14 blur-[120px]" />
        <div className="absolute top-[70rem] -right-40 h-[420px] w-[420px] rounded-full bg-fuchsia-600/10 blur-[120px]" />
      </div>

      {/* Nav */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/5 bg-void/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-twitch to-indigo-600 glow-ring">
              <TwitchIcon className="h-4.5 w-4.5 text-white" />
            </div>
            <div className="leading-tight">
              <span className="font-display block text-[15px] font-bold tracking-tight text-white">
                Sniker <span className="text-twitch-bright">Bot Checker</span>
              </span>
              <span className="block text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                Twitch viewer analytics
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-300 sm:flex">
              <ShieldCheck className="h-3.5 w-3.5" />
              Sem login · API pública
            </span>
            <a
              href="#como-funciona"
              className="hidden text-sm text-zinc-400 transition hover:text-white sm:block"
            >
              Como funciona
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative flex min-h-svh items-center justify-center px-4 pt-24 pb-16">
        <div className="relative z-10 mx-auto w-full max-w-5xl text-center">
          <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}
            className="mx-auto mb-7 inline-flex items-center gap-2 rounded-full border border-twitch/25 bg-twitch/10 px-4 py-1.5 text-sm text-violet-200">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-twitch-bright text-twitch-bright" />
            Análise em tempo real, agora sem proxies CORS
          </motion.div>

          <motion.h1 variants={fadeUp} initial="hidden" animate="show" custom={1}
            className="font-display text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
            <span className="text-white">Quantos viewers do chat</span>
            <br />
            <span className="text-gradient">são realmente bots?</span>
          </motion.h1>

          <motion.p variants={fadeUp} initial="hidden" animate="show" custom={2}
            className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400 sm:text-xl">
            Cola o nome de um canal Twitch e descobre em segundos: contas suspeitas,
            rajadas de criação em massa e a percentagem real de audiência autêntica.
          </motion.p>

          {/* Search */}
          <motion.form variants={fadeUp} initial="hidden" animate="show" custom={3}
            onSubmit={handleSubmit} className="mx-auto mt-10 max-w-xl">
            <div className="group relative flex items-center rounded-2xl border border-white/10 bg-white/[0.04] p-2 backdrop-blur-xl transition focus-within:border-twitch/50 focus-within:bg-white/[0.06]">
              <div className="pl-3 text-twitch-bright">
                <TwitchIcon className="h-5 w-5" />
              </div>
              <input
                type="text"
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  if (inputError) setInputError("");
                }}
                placeholder="Nome do canal ou twitch.tv/username"
                className="min-w-0 flex-1 bg-transparent px-3 py-3 text-[15px] text-white placeholder-zinc-500 outline-none"
                autoFocus
              />
              <button
                type="submit"
                className="flex shrink-0 items-center gap-2 rounded-xl bg-gradient-to-r from-twitch to-indigo-500 px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110 active:scale-[0.98]"
              >
                Analisar
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
            {inputError && (
              <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                className="mt-3 flex items-center justify-center gap-1.5 text-sm text-red-400">
                <CircleAlert className="h-4 w-4" /> {inputError}
              </motion.p>
            )}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-zinc-500">
              <span>Experimenta:</span>
              {["gaules", "ibai", "xqc"].map((c) => (
                <button key={c} type="button" onClick={() => setInputValue(c)}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-zinc-300 transition hover:border-twitch/40 hover:text-white">
                  {c}
                </button>
              ))}
            </div>
          </motion.form>

          {/* Live stats */}
          {stats.totalScans > 0 && (
            <motion.div variants={fadeUp} initial="hidden" animate="show" custom={4}
              className="mx-auto mt-14 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
              {metricCards.map((m) => (
                <div key={m.label} className="glass rounded-2xl px-4 py-4 text-left">
                  <m.icon className="h-4 w-4 text-twitch-bright" />
                  <div className="font-display mt-2 text-2xl font-bold text-white">
                    <CountUp value={m.value} />
                  </div>
                  <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                    {m.label}
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </div>

        {/* Scroll hint */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-zinc-600">
          <motion.div animate={{ y: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 2 }}
            className="mx-auto h-9 w-5 rounded-full border border-zinc-700 p-1">
            <div className="mx-auto h-2 w-1 rounded-full bg-zinc-500" />
          </motion.div>
        </div>
      </section>

      {/* Recent scans */}
      {stats.recent.length > 0 && (
        <section className="relative z-10 mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.6 }}
            className="glass rounded-3xl p-6 sm:p-8">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Clock className="h-4.5 w-4.5 text-twitch-bright" />
                <h2 className="font-display text-lg font-semibold text-white">Scans recentes</h2>
              </div>
              <span className="text-xs text-zinc-500">guardado em tempo real</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {stats.recent.map((s, i) => (
                <motion.a
                  key={s.channel}
                  href={`/scan/${s.channel}`}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.05 }}
                  className="glass glass-hover group rounded-2xl p-4"
                >
                  <div className="flex items-center gap-3">
                    {s.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.avatarUrl} alt={s.channel} className="h-9 w-9 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-twitch/20 text-sm font-bold text-twitch-bright">
                        {s.displayName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white group-hover:text-twitch-bright">
                        {s.displayName}
                      </div>
                      <div className="text-[11px] text-zinc-500">{timeAgo(s.createdAt)}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1 text-zinc-400">
                      <Users className="h-3 w-3" /> {formatCompact(s.trackedViewers)}
                    </span>
                    <span className={`flex items-center gap-1 font-semibold ${s.botPercentage > 20 ? "text-red-400" : s.botPercentage > 5 ? "text-amber-400" : "text-emerald-400"}`}>
                      <Bot className="h-3 w-3" /> {s.botPercentage}%
                    </span>
                  </div>
                </motion.a>
              ))}
            </div>
          </motion.div>
        </section>
      )}

      {/* Leaderboard + metodologia */}
      <section className="relative z-10 mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-5">
          {/* Leaderboard */}
          <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.6 }}
            className="glass rounded-3xl p-6 sm:p-8 lg:col-span-2">
            <div className="mb-6 flex items-center gap-2.5">
              <Crown className="h-4.5 w-4.5 text-amber-400" />
              <h2 className="font-display text-lg font-semibold text-white">Mais bots detetados</h2>
            </div>
            {stats.leaderboard.length === 0 ? (
              <p className="text-sm text-zinc-500">
                Ainda sem dados suficientes. Analisa o teu canal e ajuda a construir o ranking.
              </p>
            ) : (
              <div className="space-y-2.5">
                {stats.leaderboard.map((s, i) => (
                  <a key={s.channel} href={`/scan/${s.channel}`}
                    className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3 transition hover:border-twitch/30">
                    <span className={`font-display w-6 text-center text-sm font-bold ${i === 0 ? "text-amber-400" : "text-zinc-500"}`}>
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-white">{s.displayName}</div>
                      <div className="text-[11px] text-zinc-500">
                        {formatNumber(s.suspectedBots)} bots em {formatNumber(s.trackedViewers)} viewers
                      </div>
                    </div>
                    <span className="rounded-lg bg-red-500/15 px-2 py-1 text-xs font-bold text-red-300">
                      {s.botPercentage}%
                    </span>
                  </a>
                ))}
              </div>
            )}
          </motion.div>

          {/* Metodologia */}
          <motion.div id="como-funciona" initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.6, delay: 0.1 }}
            className="glass rounded-3xl p-6 sm:p-8 lg:col-span-3">
            <div className="mb-6 flex items-center gap-2.5">
              <Zap className="h-4.5 w-4.5 text-twitch-bright" />
              <h2 className="font-display text-lg font-semibold text-white">Como detetamos os bots</h2>
            </div>
            <div className="space-y-5">
              {[
                {
                  n: "01",
                  title: "Lemos o chat ao vivo",
                  desc: "Obtemos a lista de chatters ligada ao canal através da API pública da Twitch — diretamente do nosso servidor, sem proxies nem extensões.",
                },
                {
                  n: "02",
                  title: "Analisamos cada conta",
                  desc: "Data de criação, avatar, seguidores e padrão do username geram um score 0–100 com razões explicáveis para cada viewer.",
                },
                {
                  n: "03",
                  title: "Procuramos picos de criação",
                  desc: "Se dezenas de contas do chat nasceram no mesmo mês ou no mesmo dia, é uma botnet. A nossa baseline estatística evita falsos positivos.",
                },
              ].map((step) => (
                <div key={step.n} className="flex gap-4">
                  <span className="font-display text-2xl font-bold text-twitch/40">{step.n}</span>
                  <div>
                    <h3 className="text-sm font-semibold text-white">{step.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-zinc-400">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="relative z-10 mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.6 }}
          className="mb-10 text-center">
          <h2 className="font-display text-3xl font-bold text-white sm:text-4xl">
            Tudo o que a extensão fazia,{" "}
            <span className="text-gradient">mas melhor</span>
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-zinc-400">
            Reconstruído do zero com servidor próprio, algoritmo corrigido e dados persistentes.
          </p>
        </motion.div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <motion.div key={f.title} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.5, delay: (i % 3) * 0.08 }}
              className="glass glass-hover rounded-3xl p-6">
              <div className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${f.accent} shadow-lg`}>
                <f.icon className="h-5 w-5 text-white" />
              </div>
              <h3 className="mt-4 font-display text-base font-semibold text-white">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA final */}
      <section className="relative z-10 mx-auto max-w-4xl px-4 py-16 text-center sm:px-6">
        <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.6 }}
          className="glass rounded-[2rem] p-10 sm:p-14">
          <TrendingUp className="mx-auto h-8 w-8 text-twitch-bright" />
          <h2 className="font-display mt-4 text-2xl font-bold text-white sm:text-3xl">
            O teu chat tem viewers a fingir?
          </h2>
          <p className="mx-auto mt-2 max-w-md text-zinc-400">
            Descobre agora — demora menos de 30 segundos e não precisas de conta.
          </p>
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-twitch to-indigo-500 px-6 py-3.5 text-sm font-semibold text-white transition hover:brightness-110 active:scale-[0.98]"
          >
            Analisar um canal
            <ArrowRight className="h-4 w-4" />
          </button>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 text-sm text-zinc-500 sm:flex-row sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <TwitchIcon className="h-4 w-4 text-twitch-bright" />
            <span>Sniker Bot Checker — não afiliado à Twitch</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <Server className="h-3.5 w-3.5" /> Server-side GQL
            </span>
            <span className="flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5" /> Histórico persistente
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
