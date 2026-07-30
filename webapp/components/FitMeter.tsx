import type { FitLevel } from "@/lib/fitRank";

/**
 * Fit as a 34px meter plus its label.
 *
 * Three fit levels rendered as three identically-sized pills made relative fit
 * something you read word by word. A meter makes a column of them scannable:
 * the eye finds the full bars without parsing anything. The label stays because
 * "high" is still the word the rest of the app — and the scraper — uses.
 *
 * The widths are ordinal, not measurements. `fit` is a three-value enum from the
 * scraper's quick assessment; there is no underlying score to be faithful to,
 * so these are just three clearly distinguishable lengths.
 */
const WIDTH: Record<FitLevel, string> = {
  high: "100%",
  medium: "60%",
  low: "28%",
};

const TONE: Record<FitLevel, string> = {
  high: "var(--high)",
  medium: "var(--medium)",
  low: "var(--low)",
};

export default function FitMeter({ fit }: { fit: FitLevel }) {
  return (
    <span className="fit" style={{ ["--fc" as string]: TONE[fit] }}>
      <span className="track" aria-hidden="true">
        <i style={{ width: WIDTH[fit] }} />
      </span>
      <span className="lab">{fit}</span>
    </span>
  );
}
