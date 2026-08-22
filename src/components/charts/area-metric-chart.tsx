"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface MetricPoint {
  t: number; // epoch ms
  v: number | null;
}

/** Single-series area chart for machine vitals (CPU/RAM/disk). Renders
 * its own empty state — "no telemetry" and "genuinely flat at zero" read
 * very differently to an operator and must not look the same (PROMPT
 * §38/§55). */
export function AreaMetricChart({
  data,
  unit,
  color = "var(--accent)",
  formatValue = (v) => String(v),
}: {
  data: MetricPoint[];
  unit: string;
  color?: string;
  formatValue?: (v: number) => string;
}) {
  const hasData = data.some((p) => p.v != null);

  if (!hasData) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border-subtle text-xs text-text-tertiary">
        No telemetry in this window.
      </div>
    );
  }

  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="metricFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(t) => new Date(t).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
            stroke="var(--text-tertiary)"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            minTickGap={40}
          />
          <YAxis stroke="var(--text-tertiary)" fontSize={10} tickLine={false} axisLine={false} width={40} tickFormatter={(v) => formatValue(v)} />
          <Tooltip
            contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)", borderRadius: 8, fontSize: 12 }}
            labelFormatter={(t) => new Date(t as number).toLocaleString("es-AR")}
            formatter={(v: number) => [`${formatValue(v)}${unit}`, undefined]}
          />
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill="url(#metricFill)" isAnimationActive={false} connectNulls />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
