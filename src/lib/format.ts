/** Helpers de formatação partilhados (client-safe). */

export function getAgeDays(createdAt: string): number {
  if (!createdAt) return -1;
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return -1;
  return Math.floor((Date.now() - t) / 86400000);
}

export function formatAge(createdAt: string): string {
  const days = getAgeDays(createdAt);
  if (days < 0) return "—";
  if (days < 30) return `${days}d`;
  if (days < 365) {
    const months = Math.floor(days / 30);
    return `${months} ${months === 1 ? "mês" : "meses"}`;
  }
  const years = days / 365;
  return `${years.toFixed(1).replace(".", ",")} ${years < 1.95 ? "ano" : "anos"}`;
}

export function getAgeBadge(createdAt: string): {
  label: string;
  className: string;
} {
  const days = getAgeDays(createdAt);
  if (days < 0)
    return {
      label: "—",
      className: "text-zinc-500 bg-zinc-500/10 border-zinc-500/20",
    };
  if (days < 7)
    return {
      label: formatAge(createdAt),
      className: "text-red-300 bg-red-500/10 border-red-500/30",
    };
  if (days < 30)
    return {
      label: formatAge(createdAt),
      className: "text-red-300/90 bg-red-500/10 border-red-500/20",
    };
  if (days < 90)
    return {
      label: formatAge(createdAt),
      className: "text-amber-300 bg-amber-500/10 border-amber-500/20",
    };
  if (days < 365)
    return {
      label: formatAge(createdAt),
      className: "text-sky-300 bg-sky-500/10 border-sky-500/20",
    };
  return {
    label: formatAge(createdAt),
    className: "text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
  };
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("pt-PT").format(n);
}

export function formatCompact(n: number): string {
  return new Intl.NumberFormat("pt-PT", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

export function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const names = [
    "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
    "Jul", "Ago", "Set", "Out", "Nov", "Dez",
  ];
  return `${names[(m ?? 1) - 1]} ${String(y).slice(2)}`;
}

export function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.max(1, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `há ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d}d`;
  const mo = Math.floor(d / 30);
  return `há ${mo} ${mo === 1 ? "mês" : "meses"}`;
}
