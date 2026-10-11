import type { Silhouette } from "@/data/aircraft";

// Top-down aircraft outlines in a 100×100 box, nose up, centred on x = 50.
// Each body is authored as the right half (nose → tail) and mirrored.

type Pt = [number, number];
interface Shape {
  half: Pt[];
  /** Ellipses [cx, cy, rx, ry] on the right side, mirrored to the left. */
  engines?: [number, number, number, number][];
  /** Extra closed polygons drawn as-is (props, rotors). */
  extra?: Pt[][];
  /** Relative on-screen size. */
  scale: number;
}

const SHAPES: Record<Silhouette, Shape> = {
  a380: {
    scale: 1.18,
    half: [[50, 4], [53.5, 5.5], [55.8, 9], [56.5, 14], [56.5, 33], [97, 64], [98.5, 66], [98.5, 69], [56.5, 60], [56.3, 77], [54.5, 85], [75, 91], [75, 94.5], [53, 93], [51.3, 96], [50, 96.5]],
    engines: [[67, 44, 2.8, 5.5], [83, 56, 2.6, 5]],
  },
  quad: {
    scale: 1.1,
    half: [[50, 1], [53, 3.5], [54.6, 8], [55, 13], [55, 38], [97, 66], [98, 68], [98, 70], [55, 57], [54.8, 79], [53.6, 87], [72, 94], [72, 97], [52.5, 95], [51.2, 99], [50, 99.5]],
    engines: [[66, 47.5, 2.5, 5], [82, 58, 2.3, 4.6]],
  },
  heavy: {
    scale: 1.05,
    half: [[50, 1], [53, 3], [54.8, 7], [55.5, 12], [55.5, 37], [97, 62], [98.5, 64.5], [98.5, 66.5], [55.5, 55], [55.3, 78], [54, 86], [73, 94], [73, 97], [52.5, 95], [51.2, 99], [50, 99.5]],
    engines: [[71, 49.5, 3.6, 6.5]],
  },
  narrow: {
    scale: 0.88,
    half: [[50, 7], [52.2, 8.5], [53.5, 11], [54.2, 15], [54.3, 38], [88, 56], [89.5, 58], [89.5, 60.5], [54.3, 52], [54.2, 74], [53.4, 80], [68, 87], [68, 90], [52.5, 88.5], [51.5, 92.5], [50, 93]],
    engines: [[67, 47, 2.8, 5.5]],
  },
  rj: {
    scale: 0.8,
    half: [[50, 5], [51.8, 6.5], [52.8, 9], [53.3, 13], [53.3, 42], [85, 58], [86, 60], [86, 62], [53.3, 54], [53.2, 80], [52.5, 86], [66, 90], [66, 93], [51.5, 92], [50.8, 95], [50, 95.5]],
    engines: [[58.5, 70, 3.2, 7]],
  },
  bizjet: {
    scale: 0.68,
    half: [[50, 6], [52, 8], [53.2, 12], [53.6, 18], [53.6, 44], [82, 62], [83, 64], [83, 66], [53.6, 57], [53.4, 80], [52.4, 86], [64, 90], [64, 93], [51.5, 92], [50.8, 95], [50, 95.5]],
    engines: [[58.8, 70, 3.4, 6.5]],
  },
  prop: {
    scale: 0.78,
    half: [[50, 8], [52, 9.5], [53, 12], [53.5, 16], [53.5, 36], [91, 37.5], [92, 38.5], [92, 43.5], [53.5, 45], [53.3, 74], [52.5, 82], [64, 85], [64, 88.5], [51.5, 88], [50.8, 93], [50, 93.5]],
    engines: [[66, 37, 2.8, 8]],
    extra: [
      [[59, 28.5], [73, 28.5], [73, 30], [59, 30]],
      [[27, 28.5], [41, 28.5], [41, 30], [27, 30]],
    ],
  },
  ga: {
    scale: 0.6,
    half: [[50, 14], [52.2, 15], [53.2, 18], [53.5, 33], [90, 33], [91, 34], [91, 41], [53.5, 41], [52.5, 60], [51.5, 75], [64, 78], [64, 84], [51, 84], [50.5, 86], [50, 86]],
    extra: [[[41, 11], [59, 11], [59, 12.8], [41, 12.8]]],
  },
  heli: {
    scale: 0.66,
    half: [[50, 28], [55, 30], [58.5, 36], [59.5, 45], [58, 54], [53, 60], [51.2, 62], [51.2, 86], [57, 86], [57, 89], [51.2, 89], [50, 92]],
    extra: [
      [[18.5, 20.2], [20.2, 18.5], [81.5, 79.8], [79.8, 81.5]],
      [[79.8, 18.5], [81.5, 20.2], [20.2, 81.5], [18.5, 79.8]],
    ],
  },
  fighter: {
    scale: 0.66,
    half: [[50, 3], [51.5, 8], [52.8, 16], [53.5, 28], [54, 40], [82, 66], [82, 72], [55, 72], [55, 80], [68, 90], [68, 94], [53, 92], [51.5, 96], [50, 96]],
  },
};

export const SILHOUETTES = Object.keys(SHAPES) as Silhouette[];

export function silhouetteScale(s: Silhouette): number {
  return SHAPES[s]?.scale ?? 1;
}

const f = (n: number) => +n.toFixed(2);

/** SVG path data (100×100 viewBox) for a silhouette. */
export function silhouettePath(s: Silhouette): string {
  const shape = SHAPES[s] ?? SHAPES.narrow;
  const right = shape.half;
  const left = [...right].reverse().map(([x, y]) => [100 - x, y] as Pt);
  const body = [...right, ...left.slice(1, -1)];
  const poly = (pts: Pt[]) => `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join("L")}Z`;
  let d = poly(body);
  for (const [cx, cy, rx, ry] of shape.engines ?? []) {
    for (const x of [cx, 100 - cx]) {
      d += `M${f(x - rx)} ${f(cy)}a${rx} ${ry} 0 1 1 ${f(rx * 2)} 0a${rx} ${ry} 0 1 1 ${f(-rx * 2)} 0Z`;
    }
  }
  for (const p of shape.extra ?? []) d += poly(p);
  return d;
}
