"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface DailySuccessPoint {
  date: string; // "YYYY-MM-DD"
  successPercent: number | null; // null = no runs that day
  runCount: number;
}

export function SuccessRateChart({ data }: { data: DailySuccessPoint[] }) {
  const hasData = data.some((p) => p.runCount > 0);

  if (!hasData) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border-subtle text-xs text-text-tertiary">
        No runs recorded in this window.
      </div>
    );
  }

  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(d: string) => d.slice(5)}
            stroke="var(--text-tertiary)"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis domain={[0, 100]} stroke="var(--text-tertiary)" fontSize={10} tickLine={false} axisLine={false} width={32} tickFormatter={(v) => `${v}%`} />
          <Tooltip
            contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)", borderRadius: 8, fontSize: 12 }}
            formatter={(v: number, _name, item) => [`${v}% (${item.payload.runCount} runs)`, "Success rate"]}
          />
          <Bar dataKey="successPercent" fill="var(--accent)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
