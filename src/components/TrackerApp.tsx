import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Play, Pause, Users, Bot, Shield, Search, BarChart3,
  Clock, AlertTriangle, Loader2, RefreshCw, Eye, Radio, UserCheck,
  Crown, Star, Wrench, ChevronDown, ExternalLink, Zap, CalendarDays,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell,
} from 'recharts';
import {
  getChannelInfo, getChattersParallel, getUsersInfoFast,
  getViewerCount, type UserInfo, type ChattersData,
} from '../lib/twitch-api';
import { analyzeBotPatterns, classifyViewer, scoreViewerHeuristics, type BotAnalysis } from '../lib/bot-detector';
import ViewerProfileModal from './ViewerProfileModal';

interface Props { channelName: string; onBack: () => void; }

type ViewerStatus = 'bot' | 'suspeito' | 'ok';

interface TrackedViewer {
  login: string; displayName: string; createdAt: string;
  profileImageURL: string; isBot: boolean; firstSeen: number;
  lastSeen: number; role: string; sameDayCount: number;
  status: ViewerStatus;
  botScore: number; botReasons: string[]; followers: number;
}

interface TimePoint { time: string; viewers: number; authenticated: number; }

// ─── Helpers de idade de conta ─────────
function getAgeDays(createdAt: string): number {
  if (!createdAt) return -1;
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
}

function formatAge(createdAt: string): string {
  const days = getAgeDays(createdAt);
  if (days < 0) return '—';
  if (days === 0) return 'Hoje';
  if (days === 1) return '1 dia';
  if (days < 30) return `${days} dias`;
  if (days < 365) {
    const months = Math.floor(days / 30);
    return months === 1 ? '1 mês' : `${months} meses`;
  }
  const years = (days / 365).toFixed(1);
  return `${years} anos`;
}

function getAgeBadge(createdAt: string): { label: string; color: string; bg: string } {
  const days = getAgeDays(createdAt);
  if (days < 0) return { label: '?', color: 'text-gray-500', bg: 'bg-gray-500/10' };
  if (days < 7) return { label: 'Muito Nova', color: 'text-red-400', bg: 'bg-red-500/10' };
  if (days < 30) return { label: 'Nova', color: 'text-orange-400', bg: 'bg-orange-500/10' };
  if (days < 90) return { label: 'Recente', color: 'text-yellow-400', bg: 'bg-yellow-500/10' };
  if (days < 365) return { label: '< 1 Ano', color: 'text-blue-400', bg: 'bg-blue-500/10' };
  return { label: 'Veterana', color: 'text-green-400', bg: 'bg-green-500/10' };
}

export default function TrackerApp({ channelName, onBack }: Props) {
  const [channelInfo, setChannelInfo] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trackedViewers, setTrackedViewers] = useState<Map<string, TrackedViewer>>(new Map());
  const [botAnalysis, setBotAnalysis] = useState<BotAnalysis | null>(null);
  const [timelineData, setTimelineData] = useState<TimePoint[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'created' | 'age' | 'role'>('name');
  const [filterBots, setFilterBots] = useState<'all' | 'bots' | 'suspeito' | 'legit' | 'new' | 'old'>('all');
  const [elapsed, setElapsed] = useState(0);
  const [fetchCount, setFetchCount] = useState(0);
  const [_lastChatters, setLastChatters] = useState<ChattersData | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [activeTab, setActiveTab] = useState<'overview' | 'viewers' | 'contas' | 'bots'>('overview');
  const [apiStatus, setApiStatus] = useState<'idle' | 'fetching' | 'success' | 'error'>('idle');
  const [progress, setProgress] = useState('');
  const [selectedViewer, setSelectedViewer] = useState<string | null>(null);
  const [selectedIsBot, setSelectedIsBot] = useState(false);

  const trackingRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadChannel(); return () => stopAll(); }, [channelName]);

  const loadChannel = async () => {
    setIsLoading(true); setError(null); setApiStatus('fetching');
    try {
      const info = await getChannelInfo(channelName);
      if (info) { setChannelInfo(info); setViewerCount(info.stream?.viewersCount ?? 0); setApiStatus('success'); }
      else { setError('Canal não encontrado'); setApiStatus('error'); }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      setError(msg.includes('CORS_BLOCKED') ? 'CORS_BLOCKED' : 'Falha na ligação');
      setApiStatus('error');
    }
    setIsLoading(false);
  };

  const stopAll = useCallback(() => {
    trackingRef.current = false; setIsTracking(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (elapsedRef.current) clearInterval(elapsedRef.current);
  }, []);

  const startTracking = useCallback(async () => {
    if (trackingRef.current) return;
    trackingRef.current = true; setIsTracking(true); setElapsed(0); setFetchCount(0);
    elapsedRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    await doFetch();
    intervalRef.current = setInterval(() => { if (trackingRef.current) doFetch(); }, 10000);
  }, [channelName]);

  const doFetch = async () => {
    setApiStatus('fetching'); setProgress('A buscar chatters...');
    try {
      const chatters = await getChattersParallel(channelName, 5);
      setLastChatters(chatters); setFetchCount(c => c + 1);
      setProgress(`Encontrados ${chatters.viewers.length} chatters. A analisar contas...`);
      const now = Date.now();
      const roleMap = new Map<string, string>();
      chatters.broadcasters.forEach(v => roleMap.set(v, 'broadcaster'));
      chatters.moderators.forEach(v => roleMap.set(v, 'moderador'));
      chatters.vips.forEach(v => roleMap.set(v, 'vip'));
      chatters.chatbots.forEach(v => roleMap.set(v, 'chatbot'));

      const newLogins = chatters.viewers.filter(v => !trackedViewers.has(v.toLowerCase()));
      let userInfoMap = new Map<string, { login: string; createdAt: string; displayName: string; profileImageURL: string }>();
      if (newLogins.length > 0) {
        setProgress(`A buscar ${newLogins.length} perfis em paralelo...`);
        userInfoMap = await getUsersInfoFast(newLogins, (done, total) => setProgress(`Perfis: ${done}/${total}`));
      }

      setTrackedViewers(prev => {
        const updated = new Map(prev);
        for (const viewer of chatters.viewers) {
          const key = viewer.toLowerCase();
          if (updated.has(key)) { updated.set(key, { ...updated.get(key)!, lastSeen: now }); }
          else {
            const info = userInfoMap.get(key);
            updated.set(key, {
              login: viewer, displayName: info?.displayName ?? viewer,
              createdAt: info?.createdAt ?? '', profileImageURL: info?.profileImageURL ?? '',
              botScore: 0, botReasons: [], followers: info?.followers ?? 0,
              isBot: false, firstSeen: now, lastSeen: now, role: roleMap.get(viewer) ?? 'viewer',
              sameDayCount: 0, status: 'ok' as ViewerStatus,
            });
          }
        }
        const cutoff = now - 5 * 60 * 1000;
        for (const [key, v] of updated) { if (v.lastSeen < cutoff) updated.delete(key); }

        // 1) Algoritmo mensal (EXATAMENTE como a extensão)
        const accounts = Array.from(updated.values()).filter(v => v.createdAt).map(v => ({ login: v.login, createdAt: v.createdAt }));
        const analysis = analyzeBotPatterns(accounts);
        setBotAnalysis(analysis);

        // 2) Calcular sameDayCount (informativo, como na extensão)
        const dayCounts = new Map<string, number>();
        for (const v of updated.values()) {
          if (!v.createdAt) continue;
          const dayKey = new Date(v.createdAt).toISOString().split('T')[0];
          dayCounts.set(dayKey, (dayCounts.get(dayKey) || 0) + 1);
        }

        // 3) Classificação (combinada):
        //   Bot = algoritmo mensal (spike months) OU heurística ≥ 60
        //   Suspeito = heurística 35–59 OU sameDayCount >= 2 (sem ser bot)
        //   OK = nenhum
        for (const [, v] of updated) {
          if (!v.createdAt) { v.sameDayCount = 0; v.status = 'ok'; v.isBot = false; v.botScore = 0; v.botReasons = []; continue; }
          const dayKey = new Date(v.createdAt).toISOString().split('T')[0];
          v.sameDayCount = dayCounts.get(dayKey) || 0;

          // Heurística por conta (score 0–100)
          const h = scoreViewerHeuristics({
            login: v.login, createdAt: v.createdAt,
            profileImageURL: v.profileImageURL, followers: v.followers,
          });
          v.botScore = h.score;
          v.botReasons = h.reasons;

          // Bot = heurística alta OU (spike mensal COM sinais adicionais)
          // O spike mensal sozinho gera falsos positivos (contas antigas
          // legítimas criadas num mês de pico), por isso exige apoio:
          // score heurístico >= 35 ou 3+ contas criadas no mesmo dia.
          const spikeMatch = classifyViewer(v.createdAt, analysis.spikeMonths, analysis.baseline);
          const isBot = h.level === 'bot' || (spikeMatch && (h.score >= 35 || v.sameDayCount >= 3));
          v.isBot = isBot;

          if (isBot) {
            v.status = 'bot';
          } else if (h.level === 'suspeito' || v.sameDayCount >= 2) {
            v.status = 'suspeito';
          } else {
            v.status = 'ok';
          }
        }

        return updated;
      });

      const vc = await getViewerCount(channelName);
      if (vc > 0) setViewerCount(vc);
      const t = new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setTimelineData(prev => [...prev.slice(-40), { time: t, viewers: vc || chatters.totalCount, authenticated: chatters.viewers.length }]);
      setApiStatus('success'); setProgress('');
    } catch { setApiStatus('error'); setProgress(''); }
  };

  // ─── Filtros e ordenação ─────
  const getFiltered = (): TrackedViewer[] => {
    let arr = Array.from(trackedViewers.values());
    if (searchQuery) { const q = searchQuery.toLowerCase(); arr = arr.filter(v => v.login.includes(q) || v.displayName.toLowerCase().includes(q)); }
    if (filterBots === 'bots') arr = arr.filter(v => v.status === 'bot');
    if (filterBots === 'suspeito') arr = arr.filter(v => v.status === 'suspeito');
    if (filterBots === 'legit') arr = arr.filter(v => v.status === 'ok' && !v.isBot);
    if (filterBots === 'new') arr = arr.filter(v => getAgeDays(v.createdAt) >= 0 && getAgeDays(v.createdAt) < 90);
    if (filterBots === 'old') arr = arr.filter(v => getAgeDays(v.createdAt) >= 365);
    arr.sort((a, b) => {
      if (sortBy === 'name') return a.login.localeCompare(b.login);
      if (sortBy === 'created') return new Date(a.createdAt || '2000').getTime() - new Date(b.createdAt || '2000').getTime();
      if (sortBy === 'age') return getAgeDays(a.createdAt) - getAgeDays(b.createdAt); // mais novas primeiro
      return a.role.localeCompare(b.role);
    });
    return arr;
  };

  // Estatísticas de contas
  const getAccountStats = () => {
    const viewers = Array.from(trackedViewers.values()).filter(v => v.createdAt);
    const today = new Date();
    let under7 = 0, under30 = 0, under90 = 0, under1y = 0, over1y = 0, over3y = 0, over5y = 0;
    const yearCounts = new Map<number, number>();

    // Contagem por dia: dateStr -> lista de viewers
    const dailyMap = new Map<string, TrackedViewer[]>();

    for (const v of viewers) {
      const days = getAgeDays(v.createdAt);
      const d = new Date(v.createdAt);
      const year = d.getFullYear();
      yearCounts.set(year, (yearCounts.get(year) || 0) + 1);
      if (days < 7) under7++;
      if (days < 30) under30++;
      if (days < 90) under90++;
      if (days < 365) under1y++;
      if (days >= 365) over1y++;
      if (days >= 365 * 3) over3y++;
      if (days >= 365 * 5) over5y++;

      const dateKey = d.toISOString().split('T')[0]; // YYYY-MM-DD
      const list = dailyMap.get(dateKey) || [];
      list.push(v);
      dailyMap.set(dateKey, list);
    }

    // Encontrar ano pico
    let peakYear = 0, peakCount = 0;
    for (const [year, count] of yearCounts) {
      if (count > peakCount) { peakYear = year; peakCount = count; }
    }

    // Conta mais nova e mais velha
    const sorted = [...viewers].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const newest = sorted[0];
    const oldest = sorted[sorted.length - 1];

    // Dias com mais de 1 conta (suspeito)
    const dailyBreakdown = Array.from(dailyMap.entries())
      .map(([date, users]) => ({ date, count: users.length, users }))
      .sort((a, b) => b.count - a.count || b.date.localeCompare(a.date));

    // Dia pico
    const peakDay = dailyBreakdown[0];

    // Dias com 2+ contas criadas (clusters)
    const clusterDays = dailyBreakdown.filter(d => d.count >= 2);

    return {
      total: viewers.length, under7, under30, under90, under1y, over1y, over3y, over5y,
      yearCounts: Array.from(yearCounts.entries()).sort((a, b) => a[0] - b[0]).map(([year, count]) => ({ year: String(year), count })),
      peakYear, peakCount, newest, oldest, currentYear: today.getFullYear(),
      dailyBreakdown, peakDay, clusterDays,
    };
  };

  const fmt = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60; return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${sec}s` : `${sec}s`; };

  const roleIcon = (r: string) => {
    switch (r) {
      case 'broadcaster': return <Crown className="w-3 h-3 text-yellow-400" />;
      case 'moderador': return <Wrench className="w-3 h-3 text-green-400" />;
      case 'vip': return <Star className="w-3 h-3 text-pink-400" />;
      case 'chatbot': return <Bot className="w-3 h-3 text-gray-400" />;
      default: return <Users className="w-3 h-3 text-gray-500" />;
    }
  };
  const rolePT = (r: string) => {
    switch (r) { case 'broadcaster': return 'Streamer'; case 'moderador': return 'Mod'; case 'vip': return 'VIP'; case 'chatbot': return 'Bot'; default: return 'Viewer'; }
  };

  const pieData = botAnalysis ? [
    { name: 'Legítimos', value: Math.max(0, botAnalysis.totalViewers - botAnalysis.suspectedBots), color: '#22c55e' },
    { name: 'Bots', value: botAnalysis.suspectedBots, color: '#ef4444' },
  ] : [];

  // Helper: badge de estado do viewer
  const statusBadge = (v: TrackedViewer) => {
    if (v.status === 'bot') return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 text-[10px] font-medium">
        <Bot className="w-3 h-3" />Bot
      </span>
    );
    if (v.status === 'suspeito') return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 text-[10px] font-medium">
        <AlertTriangle className="w-3 h-3" />Suspeito ({v.sameDayCount}/dia)
      </span>
    );
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 text-[10px] font-medium">
        <Shield className="w-3 h-3" />OK
      </span>
    );
  };

  // ─── Gerar log de razões ─────
  const getBotLog = () => {
    if (!botAnalysis) return [];
    const logs: { type: 'info' | 'warn' | 'danger' | 'success'; msg: string; detail?: string; time: string }[] = [];
    const now = new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    logs.push({ type: 'info', msg: `Análise iniciada — ${botAnalysis.totalViewers} contas analisadas`, time: now });
    logs.push({ type: 'info', msg: 'Algoritmo: Mesmo da extensão ViewerMetrics', detail: '🤖 Bot = conta criada num mês com spike anormal (acima do baseline). ⚠️ Suspeito = 2+ contas criadas no mesmo dia (informativo). Exclui top 5 meses para calcular baseline. Só mostra se >10%.', time: now });

    // Baseline
    if (botAnalysis.baseline > 0) {
      logs.push({ type: 'info', msg: `Baseline calculado: ${botAnalysis.baseline} contas/mês`, detail: 'Baseado na análise de padrões de criação de contas antes de 2020 (ou mediana se sem dados antigos).', time: now });
    }

    // Idade das contas
    const stats = botAnalysis.accountAgeStats;
    logs.push({ type: 'info', msg: `Idade média das contas: ${stats.avgDays.toLocaleString()} dias (mediana: ${stats.medianDays.toLocaleString()} dias)`, time: now });

    if (stats.under30Days > 0) {
      logs.push({ type: 'warn', msg: `${stats.under30Days} conta(s) com menos de 30 dias`, detail: 'Contas muito novas podem ser indicativas de viewbotting — contas criadas em massa recentemente.', time: now });
    }
    // under7 vem do accountStats
    const aStatsLocal = getAccountStats();
    if (aStatsLocal.under7 > 0) {
      logs.push({ type: 'danger', msg: `⚠️ ${aStatsLocal.under7} conta(s) com menos de 7 dias!`, detail: 'Contas criadas na última semana são altamente suspeitas quando aparecem em massa no chat.', time: now });
    }
    if (stats.under90Days > 3) {
      logs.push({ type: 'warn', msg: `${stats.under90Days} contas com menos de 90 dias (${Math.round(stats.under90Days / botAnalysis.totalViewers * 100)}% do total)`, time: now });
    }

    // Spikes
    if (botAnalysis.spikeMonths.length > 0) {
      logs.push({ type: 'danger', msg: `Detetados ${botAnalysis.spikeMonths.length} mês(es) com pico anormal de criação de contas`, detail: `Meses: ${botAnalysis.spikeMonths.join(', ')}. Estes meses excederam significativamente o baseline de ${botAnalysis.baseline} contas/mês.`, time: now });

      for (const month of botAnalysis.spikeMonths) {
        const bucket = botAnalysis.monthlyDistribution.find(m => m.month === month);
        if (bucket) {
          const excess = bucket.count - Math.ceil(botAnalysis.baseline / 2);
          logs.push({ type: 'danger', msg: `Mês ${month}: ${bucket.count} contas criadas (${excess > 0 ? '+' + excess : excess} acima do normal)`, detail: `O baseline é ~${botAnalysis.baseline}/mês. Neste mês foram criadas ${bucket.count} contas — ${(bucket.count / botAnalysis.baseline).toFixed(1)}x acima do normal.`, time: now });
        }
      }
    }

    // Clusters de dias
    const aStats = getAccountStats();
    if (aStats.clusterDays.length > 0) {
      const bigClusters = aStats.clusterDays.filter(d => d.count >= 3);
      if (bigClusters.length > 0) {
        for (const day of bigClusters) {
          logs.push({ type: 'danger', msg: `${day.count} contas criadas no mesmo dia: ${new Date(day.date).toLocaleDateString('pt-PT')}`, detail: `Utilizadores: ${day.users.map(u => u.displayName).join(', ')}. Criar várias contas no mesmo dia é um padrão típico de viewbotting.`, time: now });
        }
      }
      if (aStats.clusterDays.length > 3) {
        logs.push({ type: 'warn', msg: `${aStats.clusterDays.length} dias diferentes com 2+ contas criadas no mesmo dia`, detail: 'Múltiplos dias com várias contas criadas pode indicar compra de bots em lotes.', time: now });
      }
    }

    // Classificação por same-day count
    const allViewers = Array.from(trackedViewers.values());
    const botCount = allViewers.filter(v => v.status === 'bot').length;
    const suspectCount = allViewers.filter(v => v.status === 'suspeito').length;

    if (botCount > 0) {
      logs.push({ type: 'danger', msg: `🤖 ${botCount} conta(s) classificadas como BOT (${trackedViewers.size > 0 ? Math.round(botCount / trackedViewers.size * 100) : 0}%)`, detail: `Contas criadas em meses com spike acima do baseline de ${botAnalysis.baseline}/mês. Meses spike: ${botAnalysis.spikeMonths.join(', ')}.`, time: now });
    }
    if (suspectCount > 0) {
      logs.push({ type: 'warn', msg: `⚠️ ${suspectCount} conta(s) classificadas como SUSPEITAS (2-3 contas criadas no mesmo dia)`, detail: 'Contas que partilham o dia de criação com 1-2 outras contas no chat. Pode ser coincidência ou indicativo leve.', time: now });
    }
    if (botCount === 0 && suspectCount === 0) {
      logs.push({ type: 'success', msg: '✅ RESULTADO: Sem bots ou suspeitos detetados', detail: 'Nenhuma conta partilha o dia de criação com 2 ou mais outras contas no chat. A audiência parece orgânica.', time: now });
    } else {
      const pctBot = trackedViewers.size > 0 ? Math.round(botCount / trackedViewers.size * 100) : 0;
      const pctSuspect = trackedViewers.size > 0 ? Math.round(suspectCount / trackedViewers.size * 100) : 0;
      logs.push({ type: botCount > 0 ? 'danger' : 'warn', msg: `📊 RESUMO: ${botCount} bots (${pctBot}%) + ${suspectCount} suspeitos (${pctSuspect}%) de ${trackedViewers.size} viewers`, time: now });
    }

    return logs;
  };

  // ─── Loading ──────────
  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
        <Loader2 className="w-12 h-12 text-purple-400 animate-spin mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">A carregar {channelName}...</h2>
        <p className="text-gray-400 text-sm">A conectar à API do Twitch</p>
      </motion.div>
    </div>
  );

  // ─── Error ────────────
  if (error) {
    const isCors = error === 'CORS_BLOCKED';
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-xl text-center">
          <AlertTriangle className="w-16 h-16 text-yellow-400 mx-auto mb-6" />
          <h2 className="text-2xl font-bold text-white mb-4">{isCors ? 'Restrição CORS' : 'Problema de Ligação'}</h2>
          {isCors ? (
            <div className="space-y-4 mb-8">
              <p className="text-gray-400">O browser bloqueia pedidos diretos à API do Twitch. <strong className="text-white">Não é problema de autenticação</strong>.</p>
              <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl text-left">
                <p className="text-sm text-green-300 font-medium mb-1">✅ Sem necessidade de conta Twitch</p>
                <p className="text-xs text-gray-400">Usa Client-IDs públicos. Tenta usar a extensão ViewerMetrics para Chrome.</p>
              </div>
            </div>
          ) : (
            <p className="text-gray-400 mb-8">Canal "{channelName}" não encontrado ou API inacessível.</p>
          )}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button onClick={onBack} className="flex items-center gap-2 px-6 py-3 border border-gray-700 rounded-xl text-gray-300 hover:text-white transition-all"><ArrowLeft className="w-4 h-4" /> Voltar</button>
            <button onClick={loadChannel} className="flex items-center gap-2 px-6 py-3 bg-white/10 rounded-xl text-white transition-all hover:bg-white/20"><RefreshCw className="w-4 h-4" /> Tentar Novamente</button>
            <button onClick={() => { setError(null); onBack(); }} className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl text-white font-medium shadow-lg shadow-purple-500/25"><BarChart3 className="w-4 h-4" /> Tentar Outro Canal</button>
          </div>
        </motion.div>
      </div>
    );
  }

  const accountStats = getAccountStats();

  // ─── Main ─────────────
  return (
    <div className="min-h-screen">
      {selectedViewer && (() => {
        const sv = trackedViewers.get(selectedViewer.toLowerCase());
        let sameDayCount = 0;
        const svCreatedAt = sv?.createdAt || '';
        if (sv?.createdAt) {
          const svDay = new Date(sv.createdAt).toISOString().split('T')[0];
          for (const v of trackedViewers.values()) {
            if (v.createdAt && new Date(v.createdAt).toISOString().split('T')[0] === svDay) sameDayCount++;
          }
        }
        return <ViewerProfileModal
          login={selectedViewer}
          isBot={selectedIsBot}
          accountsOnSameDay={sameDayCount}
          createdAt={svCreatedAt}
          firstSeen={sv?.firstSeen}
          lastSeen={sv?.lastSeen}
          botScore={sv?.botScore}
          botReasons={sv?.botReasons}
          onClose={() => setSelectedViewer(null)}
        />;
      })()}

      {/* Barra superior */}
      <div className="sticky top-0 z-50 bg-[#0a0a1a]/90 backdrop-blur-xl border-b border-purple-500/10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-all"><ArrowLeft className="w-5 h-5" /></button>
            <div className="flex items-center gap-3">
              {channelInfo?.profileImageURL && <img src={channelInfo.profileImageURL} alt="" className="w-9 h-9 rounded-full border-2 border-purple-500/30" />}
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-bold text-white">{channelInfo?.displayName}</h1>
                  {channelInfo?.isPartner && <span className="px-1.5 py-0.5 text-[10px] bg-purple-500/20 text-purple-300 rounded font-medium">Parceiro</span>}
                  {channelInfo?.stream && <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] bg-red-500/20 text-red-400 rounded font-medium"><Radio className="w-2.5 h-2.5" />AO VIVO</span>}
                </div>
                <div className="text-xs text-gray-500">{channelInfo?.stream ? `${channelInfo.stream.game} • ${viewerCount.toLocaleString()} viewers` : 'Offline'}</div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {progress && <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-purple-500/10 border border-purple-500/20 rounded-lg"><Loader2 className="w-3 h-3 text-purple-400 animate-spin" /><span className="text-xs text-purple-300">{progress}</span></div>}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/5">
              <div className={`w-2 h-2 rounded-full ${apiStatus === 'fetching' ? 'bg-yellow-400 animate-pulse' : apiStatus === 'success' ? 'bg-green-400' : 'bg-gray-400'}`} />
              <span className="text-xs text-gray-400">{apiStatus === 'fetching' ? 'A buscar' : apiStatus === 'success' ? 'Conectado' : 'Inativo'}</span>
            </div>
            <button onClick={isTracking ? stopAll : startTracking}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${isTracking ? 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30' : 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-500/25'}`}>
              {isTracking ? <><Pause className="w-4 h-4" /> Parar</> : <><Play className="w-4 h-4" /> Iniciar Tracking</>}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Info do Canal */}
        {channelInfo && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
              <div className="flex flex-col sm:flex-row items-start gap-5">
                {channelInfo.profileImageURL && <img src={channelInfo.profileImageURL} alt="" className="w-20 h-20 rounded-2xl border-2 border-purple-500/30 shadow-lg" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-2xl font-bold text-white">{channelInfo.displayName}</h2>
                    <a href={`https://twitch.tv/${channelInfo.login}`} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-purple-400"><ExternalLink className="w-4 h-4" /></a>
                  </div>
                  {channelInfo.description && <p className="text-sm text-gray-400 mb-2 line-clamp-2">{channelInfo.description}</p>}
                  <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
                    <span><UserCheck className="w-4 h-4 inline mr-1" />{channelInfo.followers?.toLocaleString()} seguidores</span>
                    <span><Clock className="w-4 h-4 inline mr-1" />Criado em {new Date(channelInfo.createdAt).toLocaleDateString('pt-PT')}</span>
                    {channelInfo.stream && <><span><Eye className="w-4 h-4 inline mr-1" />{viewerCount.toLocaleString()} viewers</span><span className="text-purple-400 font-medium">🎮 {channelInfo.stream.game}</span></>}
                  </div>
                  {channelInfo.stream && <p className="mt-2 text-sm text-white/80 font-medium">📺 {channelInfo.stream.title}</p>}
                </div>
                <button className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-white/5 transition-all"><ChevronDown className="w-5 h-5" /></button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Barra de tracking */}
        {isTracking && (
          <div className="mb-4 flex flex-wrap items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-yellow-400" />A rastrear há {fmt(elapsed)}</span>
            <span>•</span><span>{fetchCount} buscas (5x paralelo)</span>
            <span>•</span><span>{trackedViewers.size} viewers únicos</span>
          </div>
        )}

        {/* Stats */}
        {(() => {
          const botCount = Array.from(trackedViewers.values()).filter(v => v.status === 'bot').length;
          const suspectCount = Array.from(trackedViewers.values()).filter(v => v.status === 'suspeito').length;
          const okCount = trackedViewers.size - botCount - suspectCount;
          const botPct = botAnalysis?.botPercentage ?? (trackedViewers.size > 0 ? Math.round(botCount / trackedViewers.size * 100) : 0);
          return (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
              <Stat icon={<Eye className="w-5 h-5 text-blue-400" />} label="Total Viewers" value={viewerCount.toLocaleString()} bg="bg-blue-500/10 border-blue-500/20" />
              <Stat icon={<Shield className="w-5 h-5 text-green-400" />} label="OK" value={okCount.toLocaleString()} bg="bg-green-500/10 border-green-500/20" />
              <Stat icon={<AlertTriangle className="w-5 h-5 text-orange-400" />} label="Suspeitos" value={suspectCount.toLocaleString()} sub={`${trackedViewers.size > 0 ? Math.round(suspectCount / trackedViewers.size * 100) : 0}%`} bg="bg-orange-500/10 border-orange-500/20" />
              <Stat icon={<Bot className="w-5 h-5 text-red-400" />} label="Bots" value={botCount.toLocaleString()} sub={`${botPct}%`} bg="bg-red-500/10 border-red-500/20" />
              <Stat icon={<CalendarDays className="w-5 h-5 text-cyan-400" />} label="Contas < 90d" value={String(accountStats.under90)} bg="bg-cyan-500/10 border-cyan-500/20" />
            </div>
          );
        })()}

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-6 bg-white/[0.03] p-1 rounded-xl border border-white/[0.06] overflow-x-auto">
          {([['overview', 'Resumo'], ['viewers', `Viewers (${trackedViewers.size})`], ['contas', 'Contas'], ['bots', 'Bots']] as const).map(([tab, label]) => (
            <button key={tab} onClick={() => setActiveTab(tab as any)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${activeTab === tab ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
              {label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* ── RESUMO ── */}
          {activeTab === 'overview' && (
            <motion.div key="ov" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
              {timelineData.length > 1 && (
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
                  <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-purple-400" /> Viewers ao Longo do Tempo</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={timelineData}>
                      <defs><linearGradient id="vg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} /><stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} /></linearGradient></defs>
                      <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '12px', color: '#fff', fontSize: '12px' }} />
                      <Area type="monotone" dataKey="viewers" stroke="#8b5cf6" fill="url(#vg)" strokeWidth={2} name="Viewers" />
                      <Area type="monotone" dataKey="authenticated" stroke="#22c55e" fill="none" strokeWidth={2} strokeDasharray="4 4" name="Autenticados" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}

              {botAnalysis && botAnalysis.totalViewers > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
                    <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><CalendarDays className="w-4 h-4 text-cyan-400" /> Idade das Contas</h3>
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <div className="text-center p-3 bg-white/[0.02] rounded-xl"><div className="text-lg font-bold text-white">{(botAnalysis.accountAgeStats.avgDays / 365).toFixed(1)}a</div><div className="text-[10px] text-gray-500">Média</div></div>
                      <div className="text-center p-3 bg-white/[0.02] rounded-xl"><div className={`text-lg font-bold ${accountStats.under30 > 0 ? 'text-red-400' : 'text-green-400'}`}>{accountStats.under30}</div><div className="text-[10px] text-gray-500">&lt; 30 dias</div></div>
                      <div className="text-center p-3 bg-white/[0.02] rounded-xl"><div className={`text-lg font-bold ${botAnalysis.suspectedBots > 0 ? 'text-red-400' : 'text-green-400'}`}>{botAnalysis.suspectedBots}</div><div className="text-[10px] text-gray-500">Bots</div></div>
                    </div>
                    {botAnalysis.suspectedBots > 0 ? (
                      <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl"><p className="text-xs text-red-300">⚠️ {botAnalysis.botPercentage}% dos viewers marcados como possíveis bots.</p></div>
                    ) : (
                      <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-xl"><p className="text-xs text-green-300">✅ Audiência parece legítima.</p></div>
                    )}
                  </div>
                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
                    <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-purple-400" /> Contas Criadas por Mês</h3>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={botAnalysis.monthlyDistribution.slice(-24)}>
                        <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 9 }} axisLine={false} tickLine={false} angle={-45} textAnchor="end" height={60} />
                        <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '12px', color: '#fff', fontSize: '12px' }} />
                        <Bar dataKey="count" name="Contas" radius={[3, 3, 0, 0]}>{botAnalysis.monthlyDistribution.slice(-24).map((entry, i) => <Cell key={i} fill={entry.isBotMonth ? '#ef4444' : '#8b5cf6'} />)}</Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {!isTracking && trackedViewers.size === 0 && (
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-12 text-center">
                  <Zap className="w-16 h-16 text-purple-500/30 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-white mb-2">Pronto para Rastrear</h3>
                  <p className="text-gray-400 mb-2 text-sm">Busca TODOS os chatters e analisa quando cada conta foi criada.</p>
                  <p className="text-gray-500 mb-6 text-xs">Clica em qualquer viewer para ver perfil, idade da conta e quem segue.</p>
                  <button onClick={startTracking} className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl text-white font-medium shadow-lg shadow-purple-500/25"><Play className="w-4 h-4" /> Iniciar Tracking</button>
                </div>
              )}

              {isTracking && trackedViewers.size === 0 && (
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-12 text-center">
                  <Loader2 className="w-12 h-12 text-purple-400 animate-spin mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-white mb-2">A Buscar Viewers...</h3>
                  <p className="text-gray-400 text-sm">{progress || 'A conectar ao Twitch...'}</p>
                </div>
              )}
            </motion.div>
          )}

          {/* ── VIEWERS ── */}
          {activeTab === 'viewers' && (
            <motion.div key="vw" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden">
                <div className="px-4 sm:px-6 py-4 border-b border-white/[0.06] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-white">Viewers ({getFiltered().length})</h3>
                    {([['all', 'Todos'], ['legit', 'OK'], ['suspeito', '⚠ Suspeitos'], ['bots', '🤖 Bots'], ['new', '< 90 dias'], ['old', '> 1 ano']] as const).map(([f, label]) => (
                      <button key={f} onClick={() => setFilterBots(f as any)}
                        className={`px-2 py-1 text-[11px] rounded-lg transition-all ${filterBots === f ? 'bg-purple-500/20 text-purple-300' : 'text-gray-500 hover:text-gray-300'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="relative flex-1 sm:flex-initial">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <input type="text" placeholder="Pesquisar..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                        className="w-full sm:w-44 pl-9 pr-3 py-2 text-xs bg-white/[0.05] border border-white/10 rounded-lg text-white placeholder-gray-500 outline-none focus:border-purple-500/50" />
                    </div>
                    <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
                      className="px-3 py-2 text-xs bg-white/[0.05] border border-white/10 rounded-lg text-white outline-none">
                      <option value="name">Nome</option><option value="age">Mais Nova</option><option value="created">Criação</option><option value="role">Cargo</option>
                    </select>
                  </div>
                </div>
                <div className="px-6 py-2 bg-purple-500/5 border-b border-purple-500/10">
                  <p className="text-[11px] text-purple-300">💡 Clica num viewer para ver perfil completo, idade da conta e quem segue</p>
                </div>
                <div className="max-h-[600px] overflow-y-auto">
                  {getFiltered().length === 0 ? (
                    <div className="py-16 text-center text-gray-500 text-sm">{trackedViewers.size === 0 ? 'Inicia o tracking para ver viewers' : 'Nenhum viewer corresponde ao filtro'}</div>
                  ) : (
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-[#12122a] z-10">
                        <tr className="text-gray-500 border-b border-white/[0.06]">
                          <th className="text-left px-4 sm:px-6 py-3 font-medium">Viewer</th>
                          <th className="text-left px-4 py-3 font-medium">Conta Criada</th>
                          <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Idade</th>
                          <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Cargo</th>
                          <th className="text-right px-4 sm:px-6 py-3 font-medium">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {getFiltered().map(v => {
                          const badge = getAgeBadge(v.createdAt);
                          // Calcular contas no mesmo dia
                          let sameDay = 0;
                          if (v.createdAt) {
                            const vDay = new Date(v.createdAt).toISOString().split('T')[0];
                            for (const tv of trackedViewers.values()) {
                              if (tv.createdAt && new Date(tv.createdAt).toISOString().split('T')[0] === vDay) sameDay++;
                            }
                          }
                          return (
                            <tr key={v.login} onClick={() => { setSelectedViewer(v.login); setSelectedIsBot(v.isBot); }}
                              className="border-b border-white/[0.03] hover:bg-purple-500/5 transition-colors cursor-pointer group">
                              <td className="px-4 sm:px-6 py-3">
                                <div className="flex items-center gap-3">
                                  {v.profileImageURL ? <img src={v.profileImageURL} alt="" className="w-7 h-7 rounded-full" /> :
                                    <div className="w-7 h-7 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 text-[10px] font-bold">{v.displayName[0]?.toUpperCase()}</div>}
                                  <div><div className="text-white font-medium group-hover:text-purple-300 transition-colors">{v.displayName}</div><div className="text-gray-500">@{v.login}</div></div>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="text-gray-300 text-xs">{v.createdAt ? new Date(v.createdAt).toLocaleDateString('pt-PT') : '—'}</div>
                                {sameDay >= 2 && (
                                  <div className={`text-[9px] mt-0.5 font-medium ${sameDay >= 3 ? 'text-red-400' : 'text-orange-400'}`}>
                                    {sameDay} contas no mesmo dia
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3 hidden sm:table-cell">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${badge.bg} ${badge.color}`}>
                                  {formatAge(v.createdAt)} {badge.label !== 'Veterana' && badge.label !== '?' && <span>⚡</span>}
                                </span>
                              </td>
                              <td className="px-4 py-3 hidden lg:table-cell"><span className="inline-flex items-center gap-1 text-gray-400">{roleIcon(v.role)} {rolePT(v.role)}</span></td>
                              <td className="px-4 sm:px-6 py-3 text-right">
                                {statusBadge(v)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* ── CONTAS ── */}
          {activeTab === 'contas' && (
            <motion.div key="ct" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
              {accountStats.total > 0 ? (
                <>
                  {/* Resumo rápido */}
                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2"><CalendarDays className="w-5 h-5 text-cyan-400" />Análise de Contas do Chat</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                      <div className="p-3 bg-white/[0.02] rounded-xl text-center"><div className="text-xl font-bold text-white">{accountStats.total}</div><div className="text-[10px] text-gray-500">Total Analisado</div></div>
                      <div className="p-3 bg-red-500/5 border border-red-500/10 rounded-xl text-center"><div className={`text-xl font-bold ${accountStats.under7 > 0 ? 'text-red-400' : 'text-green-400'}`}>{accountStats.under7}</div><div className="text-[10px] text-gray-500">&lt; 7 dias</div></div>
                      <div className="p-3 bg-orange-500/5 border border-orange-500/10 rounded-xl text-center"><div className={`text-xl font-bold ${accountStats.under30 > 0 ? 'text-orange-400' : 'text-green-400'}`}>{accountStats.under30}</div><div className="text-[10px] text-gray-500">&lt; 30 dias</div></div>
                      <div className="p-3 bg-yellow-500/5 border border-yellow-500/10 rounded-xl text-center"><div className={`text-xl font-bold ${accountStats.under90 > 2 ? 'text-yellow-400' : 'text-white'}`}>{accountStats.under90}</div><div className="text-[10px] text-gray-500">&lt; 90 dias</div></div>
                      <div className="p-3 bg-blue-500/5 border border-blue-500/10 rounded-xl text-center"><div className="text-xl font-bold text-blue-400">{accountStats.under1y}</div><div className="text-[10px] text-gray-500">&lt; 1 ano</div></div>
                      <div className="p-3 bg-green-500/5 border border-green-500/10 rounded-xl text-center"><div className="text-xl font-bold text-green-400">{accountStats.over1y}</div><div className="text-[10px] text-gray-500">&gt; 1 ano</div></div>
                      <div className="p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-xl text-center"><div className="text-xl font-bold text-emerald-400">{accountStats.over5y}</div><div className="text-[10px] text-gray-500">&gt; 5 anos</div></div>
                    </div>
                  </div>

                  {/* Gráfico por ano */}
                  {accountStats.yearCounts.length > 0 && (
                    <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
                      <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-purple-400" /> Contas Criadas por Ano</h3>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={accountStats.yearCounts}>
                          <XAxis dataKey="year" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                          <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '12px', color: '#fff', fontSize: '12px' }} />
                          <Bar dataKey="count" name="Contas" radius={[4, 4, 0, 0]}>
                            {accountStats.yearCounts.map((entry, i) => {
                              const y = parseInt(entry.year);
                              const color = y >= accountStats.currentYear ? '#ef4444' : y >= accountStats.currentYear - 1 ? '#f59e0b' : y >= 2020 ? '#8b5cf6' : '#22c55e';
                              return <Cell key={i} fill={color} />;
                            })}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                      <div className="flex flex-wrap justify-center gap-4 mt-3 text-[10px] text-gray-500">
                        <span className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded bg-red-500" /> Este ano</span>
                        <span className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded bg-yellow-500" /> Ano passado</span>
                        <span className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded bg-purple-500" /> 2020+</span>
                        <span className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded bg-green-500" /> Antes de 2020</span>
                      </div>
                      {accountStats.peakYear > 0 && (
                        <p className="text-center text-xs text-gray-400 mt-3">📊 Pico: <strong className="text-white">{accountStats.peakYear}</strong> com {accountStats.peakCount} contas criadas</p>
                      )}
                    </div>
                  )}

                  {/* Contas criadas por dia — timeline detalhado */}
                  {accountStats.dailyBreakdown.length > 0 && (
                    <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden">
                      <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                          <CalendarDays className="w-4 h-4 text-cyan-400" /> Contas Criadas por Dia
                          {accountStats.clusterDays.length > 0 && (
                            <span className="px-2 py-0.5 text-[10px] bg-orange-500/10 text-orange-400 rounded-full font-medium">
                              {accountStats.clusterDays.length} dia(s) com 2+ contas
                            </span>
                          )}
                        </h3>
                        {accountStats.peakDay && (
                          <span className="text-[10px] text-gray-500">
                            Pico: <strong className="text-white">{new Date(accountStats.peakDay.date).toLocaleDateString('pt-PT')}</strong> ({accountStats.peakDay.count} contas)
                          </span>
                        )}
                      </div>
                      <div className="max-h-[500px] overflow-y-auto">
                        {accountStats.dailyBreakdown.map(day => {
                          const isCluster = day.count >= 2;
                          const isHuge = day.count >= 4;
                          const dateParts = new Date(day.date).toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
                          const daysAgo = getAgeDays(day.date + 'T00:00:00Z');
                          return (
                            <div key={day.date} className={`px-6 py-3 border-b border-white/[0.03] ${isHuge ? 'bg-red-500/5' : isCluster ? 'bg-orange-500/5' : 'hover:bg-white/[0.02]'} transition-colors`}>
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3">
                                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${isHuge ? 'bg-red-500/20 text-red-400' : isCluster ? 'bg-orange-500/20 text-orange-400' : 'bg-white/[0.05] text-gray-400'}`}>
                                    {day.count}
                                  </div>
                                  <div>
                                    <div className="text-sm text-white font-medium capitalize">{dateParts}</div>
                                    <div className="text-[10px] text-gray-500">
                                      {daysAgo === 0 ? 'Hoje' : daysAgo === 1 ? 'Ontem' : `Há ${formatAge(day.date + 'T00:00:00Z')}`}
                                      {isCluster && <span className="ml-2 text-orange-400">⚠️ {day.count} contas no mesmo dia</span>}
                                    </div>
                                  </div>
                                </div>
                                {isHuge && (
                                  <span className="px-2 py-0.5 text-[10px] bg-red-500/10 text-red-400 rounded-full font-medium">🚨 Suspeito</span>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-1.5 ml-11">
                                {day.users.map(u => (
                                  <button key={u.login}
                                    onClick={() => { setSelectedViewer(u.login); setSelectedIsBot(u.isBot); }}
                                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:border-purple-500/30 hover:bg-purple-500/5 transition-all text-[11px] group/user">
                                    {u.profileImageURL ? <img src={u.profileImageURL} alt="" className="w-4 h-4 rounded-full" /> :
                                      <div className="w-4 h-4 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 text-[8px] font-bold">{u.displayName[0]}</div>}
                                    <span className="text-gray-300 group-hover/user:text-purple-300">{u.displayName}</span>
                                    {u.status === 'bot' && <Bot className="w-3 h-3 text-red-400" />}
                                    {u.status === 'suspeito' && <AlertTriangle className="w-3 h-3 text-orange-400" />}
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Conta mais nova e mais velha */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {accountStats.newest && (
                      <div className="bg-red-500/5 border border-red-500/15 rounded-2xl p-5 cursor-pointer hover:border-red-500/30 transition-all"
                        onClick={() => { setSelectedViewer(accountStats.newest.login); setSelectedIsBot(accountStats.newest.isBot); }}>
                        <h4 className="text-xs font-semibold text-red-400 mb-3 flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5" />Conta Mais Nova no Chat</h4>
                        <div className="flex items-center gap-3">
                          {accountStats.newest.profileImageURL ? <img src={accountStats.newest.profileImageURL} alt="" className="w-10 h-10 rounded-full" /> :
                            <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center text-red-400 font-bold">{accountStats.newest.displayName[0]}</div>}
                          <div>
                            <div className="text-white font-medium">{accountStats.newest.displayName}</div>
                            <div className="text-xs text-gray-400">Criada em {new Date(accountStats.newest.createdAt).toLocaleDateString('pt-PT')}</div>
                            <div className="text-xs text-red-400 font-medium mt-0.5">Idade: {formatAge(accountStats.newest.createdAt)}</div>
                          </div>
                        </div>
                      </div>
                    )}
                    {accountStats.oldest && (
                      <div className="bg-green-500/5 border border-green-500/15 rounded-2xl p-5 cursor-pointer hover:border-green-500/30 transition-all"
                        onClick={() => { setSelectedViewer(accountStats.oldest.login); setSelectedIsBot(accountStats.oldest.isBot); }}>
                        <h4 className="text-xs font-semibold text-green-400 mb-3 flex items-center gap-2"><Shield className="w-3.5 h-3.5" />Conta Mais Antiga no Chat</h4>
                        <div className="flex items-center gap-3">
                          {accountStats.oldest.profileImageURL ? <img src={accountStats.oldest.profileImageURL} alt="" className="w-10 h-10 rounded-full" /> :
                            <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 font-bold">{accountStats.oldest.displayName[0]}</div>}
                          <div>
                            <div className="text-white font-medium">{accountStats.oldest.displayName}</div>
                            <div className="text-xs text-gray-400">Criada em {new Date(accountStats.oldest.createdAt).toLocaleDateString('pt-PT')}</div>
                            <div className="text-xs text-green-400 font-medium mt-0.5">Idade: {formatAge(accountStats.oldest.createdAt)}</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Lista das contas mais novas */}
                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-white/[0.06]">
                      <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Clock className="w-4 h-4 text-orange-400" /> Contas Mais Recentes (ordenadas por data de criação)</h3>
                    </div>
                    <div className="max-h-[400px] overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-[#12122a] z-10">
                          <tr className="text-gray-500 border-b border-white/[0.06]">
                            <th className="text-left px-6 py-3 font-medium">Viewer</th>
                            <th className="text-left px-4 py-3 font-medium">Data de Criação</th>
                            <th className="text-left px-4 py-3 font-medium">Idade</th>
                            <th className="text-right px-6 py-3 font-medium">Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from(trackedViewers.values())
                            .filter(v => v.createdAt)
                            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                            .slice(0, 50)
                            .map(v => {
                              const badge = getAgeBadge(v.createdAt);
                              return (
                                <tr key={v.login} onClick={() => { setSelectedViewer(v.login); setSelectedIsBot(v.isBot); }}
                                  className="border-b border-white/[0.03] hover:bg-purple-500/5 transition-colors cursor-pointer group">
                                  <td className="px-6 py-3">
                                    <div className="flex items-center gap-3">
                                      {v.profileImageURL ? <img src={v.profileImageURL} alt="" className="w-7 h-7 rounded-full" /> :
                                        <div className="w-7 h-7 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 text-[10px] font-bold">{v.displayName[0]?.toUpperCase()}</div>}
                                      <span className="text-white font-medium group-hover:text-purple-300">{v.displayName}</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-gray-300">{new Date(v.createdAt).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                                  <td className="px-4 py-3">
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${badge.bg} ${badge.color}`}>
                                      <CalendarDays className="w-3 h-3" /> {formatAge(v.createdAt)}
                                    </span>
                                  </td>
                                  <td className="px-6 py-3 text-right">
                                    {statusBadge(v)}
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-12 text-center">
                  <CalendarDays className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-white mb-2">Sem Dados de Contas</h3>
                  <p className="text-gray-400 text-sm">Inicia o tracking para ver quando cada conta no chat foi criada.</p>
                </div>
              )}
            </motion.div>
          )}

          {/* ── BOTS ── */}
          {activeTab === 'bots' && (
            <motion.div key="bt" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
              {botAnalysis && botAnalysis.totalViewers > 0 ? (
                <>
                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2"><Bot className="w-5 h-5 text-red-400" />Deteção de Bots</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div className="text-center p-4 bg-white/[0.02] rounded-xl"><div className="text-2xl font-bold text-white">{botAnalysis.totalViewers}</div><div className="text-xs text-gray-500 mt-1">Analisados</div></div>
                      <div className="text-center p-4 bg-white/[0.02] rounded-xl"><div className={`text-2xl font-bold ${botAnalysis.suspectedBots > 0 ? 'text-red-400' : 'text-green-400'}`}>{botAnalysis.suspectedBots}</div><div className="text-xs text-gray-500 mt-1">Bots Suspeitos</div></div>
                      <div className="text-center p-4 bg-white/[0.02] rounded-xl"><div className="text-2xl font-bold text-yellow-400">{botAnalysis.spikeMonths.length}</div><div className="text-xs text-gray-500 mt-1">Meses Pico</div></div>
                      <div className="text-center p-4 bg-white/[0.02] rounded-xl"><div className="text-2xl font-bold text-purple-400">{botAnalysis.baseline}</div><div className="text-xs text-gray-500 mt-1">Base/mês</div></div>
                    </div>
                  </div>

                  {botAnalysis.monthlyDistribution.length > 0 && (
                    <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
                      <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-purple-400" /> Linha Temporal de Criação</h3>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={botAnalysis.monthlyDistribution.slice(-30)}>
                          <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 9 }} axisLine={false} tickLine={false} angle={-45} textAnchor="end" height={60} />
                          <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                          <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '12px', color: '#fff', fontSize: '12px' }} />
                          <Bar dataKey="count" name="Contas" radius={[3, 3, 0, 0]}>{botAnalysis.monthlyDistribution.slice(-30).map((entry, i) => <Cell key={i} fill={entry.isBotMonth ? '#ef4444' : '#8b5cf6'} />)}</Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {botAnalysis.spikeMonths.length > 0 && (
                    <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6">
                      <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-400" />Meses com Pico</h3>
                      <div className="flex flex-wrap gap-2">{botAnalysis.spikeMonths.map(m => {
                        const b = botAnalysis.monthlyDistribution.find(x => x.month === m);
                        return <div key={m} className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl"><div className="text-sm font-medium text-red-400">{m}</div><div className="text-xs text-gray-400">{b?.count ?? 0} contas</div></div>;
                      })}</div>
                    </div>
                  )}

                  {botAnalysis.suspectedBots > 0 && (
                    <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
                      <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><Bot className="w-4 h-4 text-red-400" /> Distribuição</h3>
                      <ResponsiveContainer width="100%" height={180}>
                        <PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={75} dataKey="value" strokeWidth={0}>{pieData.map((e, i) => <Cell key={i} fill={e.color} />)}</Pie><Tooltip contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '12px', color: '#fff', fontSize: '12px' }} /></PieChart>
                      </ResponsiveContainer>
                      <div className="flex justify-center gap-6 mt-2">
                        <div className="flex items-center gap-2 text-xs"><div className="w-3 h-3 rounded-full bg-green-500" /><span className="text-gray-400">Legítimos ({botAnalysis.legitimatePercentage}%)</span></div>
                        <div className="flex items-center gap-2 text-xs"><div className="w-3 h-3 rounded-full bg-red-500" /><span className="text-gray-400">Bots ({botAnalysis.botPercentage}%)</span></div>
                      </div>
                    </div>
                  )}

                  {botAnalysis.suspectedBots === 0 && (
                    <div className="bg-green-500/5 border border-green-500/20 rounded-2xl p-6 text-center">
                      <Shield className="w-10 h-10 text-green-400 mx-auto mb-3" />
                      <h3 className="text-lg font-semibold text-white mb-1">Sem Bots Detetados</h3>
                      <p className="text-sm text-gray-400">A audiência parece legítima.</p>
                    </div>
                  )}

                  {/* ── LOG DE ANÁLISE ── */}
                  <div className="bg-[#0d0d20] border border-white/[0.06] rounded-2xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                        <Search className="w-4 h-4 text-purple-400" /> Log de Análise — Porquê Bots Suspeitos?
                      </h3>
                      <span className="text-[10px] text-gray-500 font-mono">{getBotLog().length} entradas</span>
                    </div>
                    <div className="max-h-[500px] overflow-y-auto font-mono text-[11px]">
                      {getBotLog().map((log, i) => (
                        <div key={i} className={`px-6 py-3 border-b border-white/[0.03] ${
                          log.type === 'danger' ? 'bg-red-500/[0.03]' :
                          log.type === 'warn' ? 'bg-yellow-500/[0.02]' :
                          log.type === 'success' ? 'bg-green-500/[0.03]' : ''
                        }`}>
                          <div className="flex items-start gap-3">
                            <span className="text-gray-600 shrink-0 mt-0.5">[{log.time}]</span>
                            <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                              log.type === 'danger' ? 'bg-red-400' :
                              log.type === 'warn' ? 'bg-yellow-400' :
                              log.type === 'success' ? 'bg-green-400' : 'bg-blue-400'
                            }`} />
                            <div className="flex-1 min-w-0">
                              <p className={`${
                                log.type === 'danger' ? 'text-red-300' :
                                log.type === 'warn' ? 'text-yellow-300' :
                                log.type === 'success' ? 'text-green-300' : 'text-blue-300'
                              } leading-relaxed`}>
                                {log.msg}
                              </p>
                              {log.detail && (
                                <p className="text-gray-500 mt-1 leading-relaxed text-[10px]">
                                  ↳ {log.detail}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Lista de bots individuais */}
                  {botAnalysis.suspectedBots > 0 && (() => {
                    const botViewers = Array.from(trackedViewers.values()).filter(v => v.isBot);
                    return botViewers.length > 0 ? (
                      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-white/[0.06]">
                          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                            <Bot className="w-4 h-4 text-red-400" /> Contas Marcadas como Bot ({botViewers.length})
                          </h3>
                        </div>
                        <div className="max-h-[400px] overflow-y-auto">
                          {botViewers
                            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                            .map(v => {
                              const d = new Date(v.createdAt);
                              const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                              const bucket = botAnalysis.monthlyDistribution.find(m => m.month === monthKey);
                              const badge = getAgeBadge(v.createdAt);
                              return (
                                <div key={v.login}
                                  onClick={() => { setSelectedViewer(v.login); setSelectedIsBot(true); }}
                                  className="px-6 py-4 border-b border-white/[0.03] hover:bg-red-500/5 transition-colors cursor-pointer group">
                                  <div className="flex items-center gap-4">
                                    {v.profileImageURL ? <img src={v.profileImageURL} alt="" className="w-10 h-10 rounded-full border border-red-500/30" /> :
                                      <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center text-red-400 text-sm font-bold">{v.displayName[0]}</div>}
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="text-white font-medium group-hover:text-red-300">{v.displayName}</span>
                                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium ${badge.bg} ${badge.color}`}>{badge.label}</span>
                                        <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-red-500/10 text-red-400">🤖 Bot</span>
                                      </div>
                                      <div className="text-[11px] text-gray-500 mt-1">
                                        Conta criada em <strong className="text-gray-300">{d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' })}</strong>
                                        {' '}({formatAge(v.createdAt)})
                                      </div>
                                      <div className="text-[10px] text-red-400/80 mt-0.5 flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3" />
                                        Razão: Conta criada no mês <strong>{monthKey}</strong>
                                        {bucket && <> — {bucket.count} contas criadas nesse mês (base: ~{botAnalysis.baseline}/mês, {(bucket.count / botAnalysis.baseline).toFixed(1)}x acima)</>}
                                      </div>
                                    </div>
                                    <ExternalLink className="w-4 h-4 text-gray-600 group-hover:text-red-400 transition-colors shrink-0" />
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    ) : null;
                  })()}
                </>
              ) : (
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-12 text-center">
                  <Bot className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-white mb-2">Sem Análise</h3>
                  <p className="text-gray-400 text-sm">Inicia o tracking para analisar bots.</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, sub, bg }: { icon: React.ReactNode; label: string; value: string; sub?: string; bg: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className={`${bg} border rounded-2xl p-4 text-center`}>
      <div className="flex justify-center mb-2">{icon}</div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </motion.div>
  );
}
