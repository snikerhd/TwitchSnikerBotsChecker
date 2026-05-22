import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart3, Bot, Shield, Users, Search, Zap, LineChart, Clock,
  Settings, ArrowRight, Lock, Trash2, ChevronDown, Heart,
} from 'lucide-react';

interface LandingPageProps {
  onStartAnalysis: (channel: string) => void;
}

function TwitchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
    </svg>
  );
}

export default function LandingPage({ onStartAnalysis }: LandingPageProps) {
  const [inputValue, setInputValue] = useState('');
  const [inputError, setInputError] = useState('');

  const extractChannelName = (input: string): string | null => {
    const trimmed = input.trim();
    if (!trimmed) return null;
    const urlPatterns = [/twitch\.tv\/([a-zA-Z0-9_]+)/, /^([a-zA-Z0-9_]{3,25})$/];
    for (const pattern of urlPatterns) {
      const match = trimmed.match(pattern);
      if (match) return match[1].toLowerCase();
    }
    return null;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const channel = extractChannelName(inputValue);
    if (channel) {
      setInputError('');
      onStartAnalysis(channel);
    } else {
      setInputError('Introduz um nome de utilizador ou URL de canal Twitch válido');
    }
  };

  const features = [
    { icon: BarChart3, title: 'Tracking em Tempo Real', desc: 'Monitoriza contagem de viewers e utilizadores autenticados ao vivo.', gradient: 'from-purple-500 to-violet-500' },
    { icon: Bot, title: 'Deteção de Bots', desc: 'Identifica automaticamente padrões suspeitos de criação de contas.', gradient: 'from-red-500 to-pink-500' },
    { icon: Users, title: 'Perfis de Utilizador', desc: 'Vê perfis detalhados com datas de criação e quem seguem.', gradient: 'from-blue-500 to-cyan-500' },
    { icon: LineChart, title: 'Gráficos Visuais', desc: 'Gráficos que mostram distribuição de contas legítimas vs. bots.', gradient: 'from-green-500 to-emerald-500' },
    { icon: Search, title: 'Lista Pesquisável', desc: 'Lista pesquisável e paginada de todos os viewers rastreados.', gradient: 'from-orange-500 to-amber-500' },
    { icon: Clock, title: 'Dados Históricos', desc: 'Regista timestamps de primeira e última vez visto por cada viewer.', gradient: 'from-indigo-500 to-blue-500' },
    { icon: Zap, title: 'Velocidade Automática', desc: 'Ajusta automaticamente a velocidade dos pedidos conforme o tamanho da stream.', gradient: 'from-yellow-500 to-orange-500' },
    { icon: Settings, title: 'Zero Configuração', desc: 'Sem configuração manual — adapta-se automaticamente a cada canal.', gradient: 'from-teal-500 to-cyan-500' },
  ];

  return (
    <>
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a1a]/80 backdrop-blur-xl border-b border-purple-500/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-white to-purple-200 bg-clip-text text-transparent">
                ViewerMetrics
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="hidden sm:inline">Inspirado por ViewerMetrics</span>
              <Heart className="w-3 h-3 text-red-400" />
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center pt-16 pb-10">
        <div className="absolute inset-0">
          <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-purple-600/15 rounded-full blur-[120px]" />
          <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[120px]" />
        </div>
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `linear-gradient(rgba(139,92,246,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,0.5) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }} />

        <div className="relative max-w-4xl mx-auto px-4 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-sm mb-8">
            <TwitchIcon className="w-4 h-4" />
            ViewerMetrics — Analisador de Streams
          </motion.div>

          <motion.h1 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}
            className="text-5xl sm:text-6xl lg:text-7xl font-bold leading-tight">
            <span className="text-white">Analisa Qualquer</span><br />
            <span className="bg-gradient-to-r from-purple-400 via-violet-400 to-indigo-400 bg-clip-text text-transparent">
              Stream Twitch
            </span>
          </motion.h1>

          <motion.p initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-6 text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto">
            Introduz o nome de um canal Twitch ou URL para analisar viewers em tempo real,
            detetar bots e obter insights detalhados sobre a audiência da stream.
          </motion.p>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}
            className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20 text-green-300 text-xs">
            <Shield className="w-3 h-3" />
            Sem necessidade de conta Twitch — usa API pública, sem login necessário
          </motion.div>

          {/* Input Form */}
          <motion.form initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.3 }}
            onSubmit={handleSubmit} className="mt-10 max-w-xl mx-auto">
            <div className="relative flex items-center">
              <div className="absolute left-4 text-purple-400"><TwitchIcon className="w-5 h-5" /></div>
              <input type="text" placeholder="Nome do canal ou twitch.tv/username..."
                value={inputValue} onChange={(e) => { setInputValue(e.target.value); setInputError(''); }}
                className="w-full pl-12 pr-36 py-5 bg-white/[0.05] border border-white/10 focus:border-purple-500/50 rounded-2xl text-white placeholder-gray-500 text-lg outline-none transition-all focus:bg-white/[0.08] focus:shadow-lg focus:shadow-purple-500/10" />
              <button type="submit"
                className="absolute right-2 flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl text-white font-semibold hover:from-purple-500 hover:to-indigo-500 shadow-lg shadow-purple-500/25 transition-all">
                Analisar <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            {inputError && <p className="mt-3 text-sm text-red-400">{inputError}</p>}
          </motion.form>

          {/* Quick examples */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
            className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <span className="text-xs text-gray-500">Experimenta:</span>
            {['xqc', 'shroud', 'pokimane', 'kaicenat'].map((name) => (
              <button key={name} onClick={() => onStartAnalysis(name)}
                className="px-3 py-1.5 text-xs text-purple-300 bg-purple-500/10 border border-purple-500/20 rounded-lg hover:bg-purple-500/20 transition-all">
                {name}
              </button>
            ))}
          </motion.div>

          {/* Stats */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
            className="mt-16 grid grid-cols-3 gap-6 max-w-md mx-auto">
            {[
              { icon: BarChart3, label: 'Tempo Real', value: 'Live' },
              { icon: Bot, label: 'Deteção de Bots', value: 'Auto' },
              { icon: Shield, label: 'Privacidade', value: '100%' },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 mb-2">
                  <stat.icon className="w-5 h-5 text-purple-400" />
                </div>
                <div className="text-xl font-bold text-white">{stat.value}</div>
                <div className="text-xs text-gray-500">{stat.label}</div>
              </div>
            ))}
          </motion.div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }} className="mt-16">
            <a href="#features" className="inline-flex flex-col items-center gap-1 text-gray-500 hover:text-purple-400 transition-colors">
              <span className="text-xs">Explorar funcionalidades</span>
              <ChevronDown className="w-4 h-4 animate-bounce" />
            </a>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
            <span className="text-purple-400 text-sm font-semibold tracking-widest uppercase">Funcionalidades</span>
            <h2 className="mt-4 text-4xl sm:text-5xl font-bold text-white">
              Potenciado por{' '}
              <span className="bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">ViewerMetrics</span>
            </h2>
            <p className="mt-4 text-gray-500 text-sm">Inspirado pela extensão Chrome ViewerMetrics</p>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {features.map((f, i) => (
              <motion.div key={f.title} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}
                className="p-6 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-purple-500/30 hover:bg-white/[0.06] transition-all group">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${f.gradient} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <f.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{f.title}</h3>
                <p className="text-sm text-gray-400">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Privacy */}
      <section className="py-24 relative">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="bg-gradient-to-br from-white/[0.04] to-white/[0.02] border border-white/[0.06] rounded-3xl p-8 sm:p-12">
            <div className="text-center mb-10">
              <span className="text-green-400 text-sm font-semibold tracking-widest uppercase">Privacidade e Segurança</span>
              <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-white">Os teus dados ficam contigo</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {[
                { icon: Lock, title: 'Apenas Local', desc: 'Todos os dados ficam guardados localmente no teu browser. Nada sai da tua máquina.' },
                { icon: Shield, title: 'Transparente', desc: 'Todos os pedidos são feitos diretamente à API pública do Twitch. Sem servidores externos.' },
                { icon: Trash2, title: 'Limpeza Automática', desc: 'Dados apagados quando fechas a página. Nada é guardado permanentemente.' },
              ].map((item) => (
                <div key={item.title} className="text-center">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-green-500/10 border border-green-500/20 mb-4">
                    <item.icon className="w-6 h-6 text-green-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">{item.title}</h3>
                  <p className="text-sm text-gray-400">{item.desc}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] py-8">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-semibold text-white">ViewerMetrics</span>
          </div>
          <p className="text-xs text-gray-500 flex items-center gap-1.5">
            Inspirado por ViewerMetrics <Heart className="w-3 h-3 text-red-400" /> Feito para streamers
          </p>
        </div>
      </footer>
    </>
  );
}
