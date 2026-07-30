/**
 * The sparkline's coordinate maths, with no renderer attached.
 *
 * A leaf module with no runtime imports, for the same reason `fitRank.ts` and
 * `jobsSeries.ts` are ones: two callers need the identical curve but cannot
 * share a renderer. `components/Sparkline.tsx` emits JSX for the dashboard;
 * `lib/report/reportHtml.ts` builds an SVG string on the server. Duplicating
 * the arithmetic is exactly the drift this repo avoids, and pulling
 * `react-dom/server` into a string builder to reuse the component would be
 * worse. So the pure part lives here and both sides render it.
 *
 * `node --test` loads this directly.
 */

/** The viewBox the curve is drawn in. Callers scale it with CSS. */
export const SPARK_W = 100;
export const SPARK_H = 24;
export const SPARK_PAD = 2;

/**
 * Point strings for the filled area and the line, or `null` when there is
 * nothing to draw.
 *
 * Scaled to the series' own max so each stat card reads on its own terms — the
 * low-fit card would flatten to nothing on a shared scale. `Math.max(…, 1)`
 * keeps an all-zero series from dividing by zero and emitting `NaN`.
 *
 * A single point is `null`, not a dot: `preserveAspectRatio="none"` would
 * render any round mark as an ellipse, and one week is not a trend.
 */
export function sparkGeometry(
  points: readonly number[],
): { line: string; area: string } | null {
  if (points.length < 2) return null;

  const max = Math.max(...points, 1);
  const step = (SPARK_W - SPARK_PAD * 2) / (points.length - 1);
  const y = (v: number) => SPARK_H - SPARK_PAD - (v / max) * (SPARK_H - SPARK_PAD * 2);
  const coords = points.map((v, i) => [SPARK_PAD + i * step, y(v)] as const);
  const line = coords.map(([x, yy]) => `${x.toFixed(1)},${yy.toFixed(1)}`).join(" ");
  const area = `${SPARK_PAD},${SPARK_H} ${line} ${(SPARK_W - SPARK_PAD).toFixed(1)},${SPARK_H}`;

  return { line, area };
}
