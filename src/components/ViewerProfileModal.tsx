import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Loader2, Users, Shield, ExternalLink,
  Star, Bot, Calendar, UserCheck,
} from 'lucide-react';
import { getViewerProfile, type ViewerFullProfile } from '../lib/twitch-api';

interface Props {
  login: string | null;
  isBot: boolean;
  accountsOnSameDay?: number;
  createdAt?: string;
  firstSeen?: number;
  lastSeen?: number;
  onClose: () => void;
}

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export default function ViewerProfileModal({ login, isBot, accountsOnSameDay, createdAt: viewerCreatedAt, firstSeen, lastSeen, onClose }: Props) {
  const [profile, setProfile] = useState<ViewerFullProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!login) return;
    setLoading(true);
    setError(false);
    setProfile(null);
    getViewerProfile(login)
      .then(p => { setProfile(p); if (!p) setError(true); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [login]);

  if (!login) return null;

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
        <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }}
          onClick={e => e.stopPropagation()}
          className="w-full max-w-lg max-h-[85vh] overflow-y-auto bg-[#12122a] border border-purple-500/20 rounded-2xl shadow-2xl shadow-purple-900/30">

          <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-[#12122a] border-b border-white/[0.06]">
            <h3 className="text-lg font-bold text-white">Perfil do Viewer</h3>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-all">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6">
            {loading && (
              <div className="py-16 text-center">
                <Loader2 className="w-10 h-10 text-purple-400 animate-spin mx-auto mb-3" />
                <p className="text-gray-400 text-sm">A carregar perfil de {login}...</p>
              </div>
            )}

            {error && !loading && (
              <div className="py-16 text-center">
                <Users className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">Não foi possível carregar o perfil de {login}</p>
              </div>
            )}

            {profile && !loading && (
              <div className="space-y-6">
                {/* Header do perfil */}
                <div className="flex items-start gap-4">
                  <img src={profile.profileImageURL} alt={profile.displayName}
                    className="w-20 h-20 rounded-2xl border-2 border-purple-500/30" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-xl font-bold text-white">{profile.displayName}</h2>
                      {profile.isPartner && (
                        <span className="px-1.5 py-0.5 text-[10px] bg-purple-500/20 text-purple-300 rounded font-medium flex items-center gap-1">
                          <Shield className="w-3 h-3" /> Parceiro
                        </span>
                      )}
                      {profile.isAffiliate && !profile.isPartner && (
                        <span className="px-1.5 py-0.5 text-[10px] bg-blue-500/20 text-blue-300 rounded font-medium">Afiliado</span>
                      )}
                      {isBot && (
                        <span className="px-1.5 py-0.5 text-[10px] bg-red-500/20 text-red-400 rounded font-medium flex items-center gap-1">
                          <Bot className="w-3 h-3" /> Bot Suspeito
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">@{profile.login}</p>
                    {profile.description && <p className="text-sm text-gray-400 mt-2 line-clamp-3">{profile.description}</p>}
                  </div>
                </div>

                {/* Info estilo extensão */}
                <div className="bg-[#0d0d20] rounded-xl border border-white/[0.06] overflow-hidden font-mono text-[11px]">
                  <div className="px-4 py-2 border-b border-white/[0.06] bg-purple-500/5">
                    <span className="text-[10px] text-purple-300 font-semibold tracking-wider uppercase">Detalhes da Conta</span>
                  </div>
                  <div className="divide-y divide-white/[0.04]">
                    <div className="flex justify-between px-4 py-2.5">
                      <span className="text-gray-500">Criada em</span>
                      <span className="text-white">{new Date(profile.createdAt).toLocaleDateString('pt-PT')}</span>
                    </div>
                    <div className="flex justify-between px-4 py-2.5">
                      <span className="text-gray-500">Contas no Mesmo Dia</span>
                      <span className={`font-bold ${(accountsOnSameDay ?? 0) >= 3 ? 'text-red-400' : (accountsOnSameDay ?? 0) >= 2 ? 'text-orange-400' : 'text-green-400'}`}>
                        {accountsOnSameDay ?? '—'}
                      </span>
                    </div>
                    {firstSeen && (
                      <div className="flex justify-between px-4 py-2.5">
                        <span className="text-gray-500">Primeira Vez Visto</span>
                        <span className="text-white">{new Date(firstSeen).toLocaleString('pt-PT')}</span>
                      </div>
                    )}
                    {lastSeen && (
                      <div className="flex justify-between px-4 py-2.5">
                        <span className="text-gray-500">Última Vez Visto</span>
                        <span className="text-white">{new Date(lastSeen).toLocaleString('pt-PT')}</span>
                      </div>
                    )}
                    {firstSeen && lastSeen && (
                      <div className="flex justify-between px-4 py-2.5">
                        <span className="text-gray-500">Tempo na Stream</span>
                        <span className="text-cyan-400 font-bold">{fmtDuration(lastSeen - firstSeen)}</span>
                      </div>
                    )}
                    <div className="flex justify-between px-4 py-2.5">
                      <span className="text-gray-500">Seguidores</span>
                      <span className="text-white">{profile.followers.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between px-4 py-2.5">
                      <span className="text-gray-500">A Seguir</span>
                      <span className="text-white">{profile.followingAvailable ? profile.followingCount.toLocaleString() : '—'}</span>
                    </div>
                  </div>
                </div>

                {/* Alerta contas no mesmo dia */}
                {(accountsOnSameDay ?? 0) >= 3 && (
                  <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-xl">
                    <p className="text-[11px] text-red-300 flex items-center gap-1.5">
                      <Bot className="w-3.5 h-3.5 shrink-0" />
                      ⚠️ {accountsOnSameDay} contas no chat foram criadas no mesmo dia{viewerCreatedAt ? ` (${new Date(viewerCreatedAt).toLocaleDateString('pt-PT')})` : ''}. Padrão suspeito de criação em massa.
                    </p>
                  </div>
                )}
                {(accountsOnSameDay ?? 0) === 2 && (
                  <div className="p-3 bg-orange-500/5 border border-orange-500/20 rounded-xl">
                    <p className="text-[11px] text-orange-300">⚡ 2 contas no chat criadas no mesmo dia — pode ser coincidência.</p>
                  </div>
                )}

                {/* Estatísticas visuais */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 text-center">
                    <UserCheck className="w-4 h-4 text-purple-400 mx-auto mb-1" />
                    <div className="text-lg font-bold text-white">{profile.followers.toLocaleString()}</div>
                    <div className="text-[10px] text-gray-500">Seguidores</div>
                  </div>
                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 text-center">
                    <Star className="w-4 h-4 text-yellow-400 mx-auto mb-1" />
                    <div className="text-lg font-bold text-white">{profile.followingAvailable ? profile.followingCount.toLocaleString() : '—'}</div>
                    <div className="text-[10px] text-gray-500">A Seguir</div>
                  </div>
                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 text-center">
                    <Calendar className="w-4 h-4 text-green-400 mx-auto mb-1" />
                    <div className="text-sm font-bold text-white">
                      {new Date(profile.createdAt).toLocaleDateString('pt-PT', { month: 'short', year: 'numeric' })}
                    </div>
                    <div className="text-[10px] text-gray-500">Criado</div>
                  </div>
                </div>

                {/* (info de idade e same day já está na tabela de detalhes acima) */}

                {/* Lista de quem segue */}
                {profile.following.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                      <Star className="w-4 h-4 text-yellow-400" />
                      A Seguir ({profile.followingCount.toLocaleString()}{profile.following.length < profile.followingCount ? ` — a mostrar ${profile.following.length}` : ''})
                    </h4>
                    <div className="space-y-1 max-h-64 overflow-y-auto">
                      {profile.following.map(ch => (
                        <a key={ch.login} href={`https://twitch.tv/${ch.login}`} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.04] transition-all group">
                          {ch.profileImageURL ? (
                            <img src={ch.profileImageURL} alt={ch.displayName} className="w-8 h-8 rounded-full" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 text-xs font-bold">
                              {ch.displayName[0]}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-white font-medium truncate">{ch.displayName}</div>
                            <div className="text-[10px] text-gray-500">@{ch.login}</div>
                          </div>
                          <ExternalLink className="w-3.5 h-3.5 text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {profile.following.length === 0 && (
                  <div className="text-center py-6 bg-white/[0.02] rounded-xl border border-white/[0.06]">
                    {profile.followingAvailable ? (
                      <>
                        <Users className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                        <p className="text-xs text-gray-500">Não segue ninguém</p>
                        {isBot && <p className="text-xs text-red-400 mt-1">⚠️ Contas bot geralmente não seguem ninguém</p>}
                      </>
                    ) : (
                      <>
                        <Shield className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                        <p className="text-xs text-gray-400 font-medium">Dados indisponíveis</p>
                        <p className="text-[11px] text-gray-500 mt-1 px-4">
                          A Twitch tornou as listas de "a seguir" privadas — já não é possível ver quem um viewer segue.
                        </p>
                      </>
                    )}
                  </div>
                )}

                <a href={`https://twitch.tv/${profile.login}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-300 text-sm font-medium hover:bg-purple-500/20 transition-all">
                  <ExternalLink className="w-4 h-4" /> Abrir no Twitch
                </a>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
