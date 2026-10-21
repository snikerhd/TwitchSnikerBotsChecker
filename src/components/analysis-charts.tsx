"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonthBucket } from "@/lib/bot-detector";
import { monthLabel } from "@/lib/format";

/* ─── Tooltip base ─── */
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-[#12121f]/95 px-3.5 py-2.5 text-xs shadow-2xl backdrop-blur-md">
      <div className="mb-1 font-semibold text-white">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey ?? p.name} className="flex items-center gap-2 text-zinc-300">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color ?? p.payload?.fill }} />
          <span>{p.name}:</span>
          <span className="font-semibold text-white">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Timeline: viewers vs autenticados ─── */
export interface TimePoint {
  time: string;
  stream: number;
  autenticados: number;
}

export function TimelineChart({ data }: { data: TimePoint[] }) {
  if (data.length < 2) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-zinc-500">
        A recolher dados para o gráfico… (são precisos 2+ ciclos)
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
        <defs>
          <linearGradient id="gStream" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#9147ff" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#9147ff" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="gAuth" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#34d399" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 6" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="time" tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={42} />
        <Tooltip content={<ChartTooltip />} />
        <Area type="monotone" dataKey="stream" name="Viewers (stream)" stroke="#a970ff" strokeWidth={2} fill="url(#gStream)" />
        <Area type="monotone" dataKey="autenticados" name="Chatters" stroke="#34d399" strokeWidth={2} fill="url(#gAuth)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ─── Distribuição mensal (picos a vermelho) ─── */
export function MonthlyChart({ data }: { data: MonthBucket[] }) {
  const chartData = data.map((m) => ({ ...m, label: monthLabel(m.month) }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 6" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={42} />
        <Tooltip
          content={({ active, payload }: any) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload as MonthBucket & { label: string };
            return (
              <div className="rounded-xl border border-white/10 bg-[#12121f]/95 px-3.5 py-2.5 text-xs shadow-2xl backdrop-blur-md">
                <div className="font-semibold text-white">{d.label}</div>
                <div className="mt-1 text-zinc-300">
                  <span className="font-semibold text-white">{d.count}</span> contas criadas
                </div>
                {d.isSpike && (
                  <div className="mt-1 font-semibold text-red-400">Mês de pico — possível botnet</div>
                )}
              </div>
            );
          }}
        />
        <Bar dataKey="count" name="Contas" radius={[5, 5, 0, 0]} maxBarSize={26}>
          {chartData.map((m) => (
            <Cell key={m.month} fill={m.isSpike ? "#ef4444" : "#7c5cf0"} fillOpacity={m.isSpike ? 0.95 : 0.75} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ─── Contas por ano ─── */
export function YearChart({ data }: { data: { year: string; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 6" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="year" tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={42} />
        <Tooltip content={<ChartTooltip />} />
        <Bar dataKey="count" name="Contas" radius={[6, 6, 0, 0]} maxBarSize={44}>
          {data.map((d, i) => (
            <Cell key={d.year} fill={i === data.length - 1 ? "#f59e0b" : "#6366f1"} fillOpacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ─── Donut bots vs legítimos ─── */
export function BotDonut({ botPct }: { botPct: number }) {
  const legit = Math.max(0, 100 - botPct);
  const data = [
    { name: "Legítimos", value: legit, fill: "#34d399" },
    { name: "Bots suspeitos", value: botPct, fill: "#ef4444" },
  ];
  return (
    <div className="relative h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" innerRadius="68%" outerRadius="92%"
            strokeWidth={0} startAngle={90} endAngle={450} cornerRadius={8} paddingAngle={botPct > 0 && botPct < 100 ? 3 : 0}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.fill} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }: any) =>
              active && payload?.length ? (
                <div className="rounded-xl border border-white/10 bg-[#12121f]/95 px-3 py-2 text-xs shadow-2xl">
                  <span style={{ color: payload[0].payload.fill }} className="font-semibold">
                    {payload[0].name}: {payload[0].value}%
                  </span>
                </div>
              ) : null
            }
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-display text-3xl font-bold ${botPct > 20 ? "text-red-400" : botPct > 5 ? "text-amber-400" : "text-emerald-400"}`}>
          {botPct}%
        </span>
        <span className="text-[11px] uppercase tracking-wider text-zinc-500">bots</span>
      </div>
    </div>
  );
}
