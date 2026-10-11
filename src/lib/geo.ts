const R_NM = 3440.065;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/** Great-circle distance in nautical miles. */
export function distanceNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Initial bearing in degrees (0-360). */
export function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Point reached travelling `distNm` from a start point along `brg` degrees. */
export function destination(lat: number, lon: number, brg: number, distNm: number): [number, number] {
  const d = distNm / R_NM;
  const b = toRad(brg);
  const p1 = toRad(lat);
  const l1 = toRad(lon);
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [toDeg(p2), ((toDeg(l2) + 540) % 360) - 180];
}

/**
 * Great-circle path as [lon, lat] coordinates, with longitudes unwrapped so
 * MapLibre draws the short way across the antimeridian.
 */
export function greatCircle(lat1: number, lon1: number, lat2: number, lon2: number, maxStepNm = 50): [number, number][] {
  const total = distanceNm(lat1, lon1, lat2, lon2);
  const n = Math.max(2, Math.ceil(total / maxStepNm));
  const p1 = toRad(lat1), l1 = toRad(lon1), p2 = toRad(lat2), l2 = toRad(lon2);
  const d = total / R_NM;
  const out: [number, number][] = [];
  let prevLon = lon1;
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    let lat: number, lon: number;
    if (d < 1e-9) {
      lat = lat1; lon = lon1;
    } else {
      const A = Math.sin((1 - f) * d) / Math.sin(d);
      const B = Math.sin(f * d) / Math.sin(d);
      const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
      const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
      const z = A * Math.sin(p1) + B * Math.sin(p2);
      lat = toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)));
      lon = toDeg(Math.atan2(y, x));
    }
    lon = unwrap(prevLon, lon);
    prevLon = lon;
    out.push([lon, lat]);
  }
  return out;
}

/** Shift `lon` by ±360 so it is within 180° of `ref`. */
export function unwrap(ref: number, lon: number): number {
  while (lon - ref > 180) lon -= 360;
  while (lon - ref < -180) lon += 360;
  return lon;
}

export function angleDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}
