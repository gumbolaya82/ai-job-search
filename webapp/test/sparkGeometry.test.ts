import test from "node:test";
import assert from "node:assert/strict";
import { SPARK_H, SPARK_PAD, SPARK_W, sparkGeometry } from "../lib/sparkGeometry.ts";

test("seven points produce seven coordinate pairs across the full width", () => {
  const geo = sparkGeometry([1, 2, 3, 4, 5, 6, 7]);
  assert.ok(geo);
  const pairs = geo.line.split(" ");
  assert.equal(pairs.length, 7);
  assert.equal(pairs[0].split(",")[0], SPARK_PAD.toFixed(1));
  assert.equal(pairs[6].split(",")[0], (SPARK_W - SPARK_PAD).toFixed(1));
});

test("fewer than two points draws nothing", () => {
  assert.equal(sparkGeometry([]), null);
  assert.equal(sparkGeometry([5]), null);
});

test("an all-zero series is flat, never NaN", () => {
  const geo = sparkGeometry([0, 0, 0, 0, 0, 0, 0]);
  assert.ok(geo);
  assert.ok(!geo.line.includes("NaN"), geo.line);
  assert.ok(!geo.area.includes("NaN"), geo.area);
  const ys = geo.line.split(" ").map((p) => Number(p.split(",")[1]));
  // Zero sits on the baseline: H - PAD, the same y for every point.
  assert.deepEqual(new Set(ys), new Set([SPARK_H - SPARK_PAD]));
});

test("the series is scaled to its own max, so the peak touches the top pad", () => {
  const geo = sparkGeometry([0, 40]);
  assert.ok(geo);
  const [, peak] = geo.line.split(" ")[1].split(",");
  assert.equal(Number(peak), SPARK_PAD);
});

test("last is the final point, so a renderer can mark where the curve ends", () => {
  const geo = sparkGeometry([0, 0, 40]);
  assert.ok(geo);
  assert.equal(geo.last.x, SPARK_W - SPARK_PAD);
  assert.equal(geo.last.y, SPARK_PAD, "the peak is the last point here, so it sits at the top pad");

  const flat = sparkGeometry([0, 0, 0, 0, 0, 0, 0]);
  assert.ok(flat);
  assert.equal(flat.last.y, SPARK_H - SPARK_PAD, "an all-zero series ends on the baseline");
  assert.ok(Number.isFinite(flat.last.x) && Number.isFinite(flat.last.y));
});

test("the area closes on the baseline at both ends", () => {
  const geo = sparkGeometry([1, 2]);
  assert.ok(geo);
  assert.ok(geo.area.startsWith(`${SPARK_PAD},${SPARK_H} `));
  assert.ok(geo.area.endsWith(`${(SPARK_W - SPARK_PAD).toFixed(1)},${SPARK_H}`));
});
