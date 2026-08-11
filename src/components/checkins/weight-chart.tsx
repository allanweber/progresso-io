"use client";

import {
  formatCheckinWeight,
  shortCheckinDate,
  type WeightPointDto,
} from "@/lib/student-checkins";

/**
 * Inline SVG weight chart: gridlines + min/max/date labels + area + line + dots.
 * Handles a single check-in gracefully (a centered point on a baseline). Shared
 * by the aluno portal (Evolução) and the coach Evolução tab.
 */
export function WeightChart({ series }: { series: WeightPointDto[] }) {
  const W = 340;
  const H = 176;
  const left = 38;
  const right = W - 12;
  const top = 14;
  const bottom = H - 22;
  const n = series.length;

  const weights = series.map((s) => s.weightKg);
  const rawMin = Math.min(...weights);
  const rawMax = Math.max(...weights);
  const flat = rawMax - rawMin < 0.05;
  const min = flat ? rawMin - 1 : rawMin - (rawMax - rawMin) * 0.15;
  const max = flat ? rawMax + 1 : rawMax + (rawMax - rawMin) * 0.15;
  const span = max - min || 1;

  const x = (i: number) =>
    n === 1 ? (left + right) / 2 : left + (i / (n - 1)) * (right - left);
  const y = (w: number) => top + (1 - (w - min) / span) * (bottom - top);
  const pts = series.map((s, i) => [x(i), y(s.weightKg)] as const);

  const line = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
    .join(" ");
  const area = `${line} L${pts[n - 1][0].toFixed(1)} ${bottom} L${pts[0][0].toFixed(1)} ${bottom} Z`;

  const gridYs = [top, (top + bottom) / 2, bottom];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label="Gráfico de evolução do peso"
    >
      <defs>
        <linearGradient id="checkinWeight" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--primary)" stopOpacity="0.18" />
          <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {gridYs.map((gy, i) => (
        <line
          key={i}
          x1={left}
          y1={gy}
          x2={right}
          y2={gy}
          stroke="var(--border)"
          strokeWidth={1}
          strokeDasharray={i === 2 ? "0" : "3 4"}
        />
      ))}

      <text x={left - 6} y={top + 4} textAnchor="end" className="fill-muted-foreground" fontSize="10">
        {formatCheckinWeight(rawMax)}
      </text>
      <text x={left - 6} y={bottom} textAnchor="end" className="fill-muted-foreground" fontSize="10">
        {formatCheckinWeight(rawMin)}
      </text>

      {n >= 2 ? (
        <>
          <path d={area} fill="url(#checkinWeight)" />
          <path
            d={line}
            fill="none"
            stroke="var(--primary)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </>
      ) : null}

      {pts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={n === 1 ? 4 : 2.5} fill="var(--primary)" />
      ))}

      {n === 1 ? (
        <text x={(left + right) / 2} y={H - 6} textAnchor="middle" className="fill-muted-foreground" fontSize="10">
          {shortCheckinDate(series[0].date)}
        </text>
      ) : (
        <>
          <text x={left} y={H - 6} textAnchor="start" className="fill-muted-foreground" fontSize="10">
            {shortCheckinDate(series[0].date)}
          </text>
          <text x={right} y={H - 6} textAnchor="end" className="fill-muted-foreground" fontSize="10">
            {shortCheckinDate(series[n - 1].date)}
          </text>
        </>
      )}
    </svg>
  );
}
