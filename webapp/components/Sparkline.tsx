import { SPARK_H, SPARK_W, sparkGeometry } from "@/lib/sparkGeometry";

/**
 * A seven-point weekly sparkline for a stat card.
 *
 * Deliberately unlabelled and unaxised: at 20px tall the only question it can
 * honestly answer is "which way is this going", and the number above it already
 * says how many. Scaled to its own max so each card reads on its own terms —
 * the low-fit card would flatten to nothing on a shared scale.
 *
 * Pure SVG, no client boundary, no charting dependency. `preserveAspectRatio` is
 * "none" so the seven weeks always span the card's width, which rules out any
 * round mark — a circle would render as an ellipse under that scale.
 *
 * The coordinates come from `lib/sparkGeometry.ts` because the downloaded HTML
 * report draws the same curve as a string, without React.
 */

export default function Sparkline({
  points,
  color = "var(--accent)",
  label,
}: {
  points: number[];
  color?: string;
  label?: string;
}) {
  const geo = sparkGeometry(points);
  if (!geo) return null;

  return (
    <svg
      className="spark"
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label ?? `Last ${points.length} weeks: ${points.join(", ")}`}
    >
      <polygon points={geo.area} fill={color} opacity="0.13" />
      <polyline
        points={geo.line}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
