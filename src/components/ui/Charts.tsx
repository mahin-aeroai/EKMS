"use client";

import { useId } from "react";

/**
 * Charts — Deliverable 3.3
 * Purpose: visualize trend/comparison/distribution; click-through drill-down to the
 * underlying filtered Table.
 * Variants: Line, Bar, Donut, Gauge, Heatmap.
 * Accessibility: an accessible data table alternative should always ship alongside these
 * in production; each chart below also exposes a visually-hidden <table> for that reason.
 * These are dependency-free SVG implementations so the design system has no hard runtime
 * dependency on a specific charting library — swap in Chart.js/Recharts/etc. behind this
 * same prop contract if preferred.
 */

function AccessibleDataTable({ labels, values }: { labels: string[]; values: number[] }) {
  return (
    <table className="sr-only">
      <caption>Chart data</caption>
      <thead>
        <tr>
          {labels.map((l) => (
            <th key={l}>{l}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          {values.map((v, i) => (
            <td key={i}>{v}</td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

export function BarChart({
  data,
  onBarClick,
}: {
  data: { label: string; value: number }[];
  onBarClick?: (label: string) => void;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div>
      <div className="flex h-40 items-end gap-3">
        {data.map((d) => (
          <button
            key={d.label}
            onClick={() => onBarClick?.(d.label)}
            className="group flex flex-1 flex-col items-center gap-1.5"
            aria-label={`${d.label}: ${d.value}`}
          >
            <div className="flex h-32 w-full items-end">
              <div
                className="w-full rounded-t-md bg-primary transition-[height] duration-[var(--dur-standard)] group-hover:bg-primary-hover"
                style={{ height: `${(d.value / max) * 100}%` }}
              />
            </div>
            <span className="text-[11px] text-ink-muted">{d.label}</span>
          </button>
        ))}
      </div>
      <AccessibleDataTable labels={data.map((d) => d.label)} values={data.map((d) => d.value)} />
    </div>
  );
}

export function LineChart({ data }: { data: { label: string; value: number }[] }) {
  const width = 320;
  const height = 140;
  const max = Math.max(...data.map((d) => d.value), 1);
  const min = Math.min(...data.map((d) => d.value), 0);
  const range = max - min || 1;
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1 || 1)) * (width - 20) + 10;
    const y = height - 20 - ((d.value - min) / range) * (height - 40);
    return `${x},${y}`;
  });
  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Trend line chart">
        <polyline
          points={points.join(" ")}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map((p, i) => {
          const [x, y] = p.split(",").map(Number);
          return <circle key={i} cx={x} cy={y} r={3} fill="var(--primary)" />;
        })}
      </svg>
      <AccessibleDataTable labels={data.map((d) => d.label)} values={data.map((d) => d.value)} />
    </div>
  );
}

export function DonutChart({
  data,
}: {
  data: { label: string; value: number; color: "primary" | "success" | "warning" | "danger" | "info" }[];
}) {
  const id = useId();
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const colorVar: Record<string, string> = {
    primary: "var(--primary)",
    success: "var(--success)",
    warning: "var(--warning)",
    danger: "var(--danger)",
    info: "var(--info)",
  };
  const r = 40;
  const circumference = 2 * Math.PI * r;
  const segments = data.reduce<Array<(typeof data)[number] & { cumulative: number }>>((acc, d) => {
    const prev = acc[acc.length - 1];
    const cumulative = prev ? prev.cumulative + prev.value : 0;
    return [...acc, { ...d, cumulative }];
  }, []);
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" width={112} height={112} role="img" aria-label="Distribution donut chart">
        <g transform="rotate(-90 50 50)">
          {segments.map((d) => {
            const frac = d.value / total;
            const dash = `${frac * circumference} ${circumference}`;
            const offset = -((d.cumulative / total) * circumference);
            return (
              <circle
                key={d.label + id}
                cx={50}
                cy={50}
                r={r}
                fill="none"
                stroke={colorVar[d.color]}
                strokeWidth={16}
                strokeDasharray={dash}
                strokeDashoffset={offset}
              />
            );
          })}
        </g>
      </svg>
      <ul className="space-y-1 text-xs">
        {data.map((d) => (
          <li key={d.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorVar[d.color] }} />
            <span className="text-ink-secondary">{d.label}</span>
            <span className="font-medium text-ink">{Math.round((d.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function GaugeChart({ value, label }: { value: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  const angle = (clamped / 100) * 180;
  const color = clamped >= 80 ? "var(--success)" : clamped >= 50 ? "var(--warning)" : "var(--danger)";
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 120 70" width={140} height={82}>
        <path d="M10 65 A 50 50 0 0 1 110 65" fill="none" stroke="var(--line)" strokeWidth={10} strokeLinecap="round" />
        <path
          d="M10 65 A 50 50 0 0 1 110 65"
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={`${(angle / 180) * 157} 157`}
        />
        <text x="60" y="55" textAnchor="middle" className="fill-ink text-lg font-bold">
          {clamped}%
        </text>
      </svg>
      <span className="text-xs text-ink-muted">{label}</span>
    </div>
  );
}

export function Heatmap({ rows, cols, values }: { rows: string[]; cols: string[]; values: number[][] }) {
  const max = Math.max(...values.flat(), 1);
  return (
    <table className="border-separate border-spacing-1 text-xs">
      <thead>
        <tr>
          <th />
          {cols.map((c) => (
            <th key={c} className="px-1 font-medium text-ink-muted">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={r}>
            <th className="pr-2 text-right font-medium text-ink-muted">{r}</th>
            {cols.map((c, ci) => {
              const v = values[ri][ci];
              const intensity = v / max;
              return (
                <td key={c}>
                  <div
                    className="h-6 w-6 rounded"
                    style={{ background: `color-mix(in srgb, var(--primary) ${intensity * 100}%, var(--surface-sunken))` }}
                    title={`${r} / ${c}: ${v}`}
                  />
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
