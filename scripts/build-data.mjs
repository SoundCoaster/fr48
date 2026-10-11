// Builds the static reference data used by FlightRadar48.
// Usage: node scripts/build-data.mjs
// Sources: VATSpy data project, OurAirports, OpenFlights (all openly licensed).
import { writeFile, mkdir, rm } from "node:fs/promises";

const SRC = {
  vatspy: "https://raw.githubusercontent.com/vatsimnetwork/vatspy-data-project/master/VATSpy.dat",
  oaAirports: "https://davidmegginson.github.io/ourairports-data/airports.csv",
  oaCountries: "https://davidmegginson.github.io/ourairports-data/countries.csv",
  ofAirports: "https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat",
  ofAirlines: "https://raw.githubusercontent.com/jpatokal/openflights/master/data/airlines.dat",
  oaRunways: "https://davidmegginson.github.io/ourairports-data/runways.csv",
};

const get = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.text();
};

// Minimal RFC4180 CSV parser (handles quotes and escaped quotes).
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const nul = (v) => (v === "\\N" || v === undefined ? "" : v);
const round = (n, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

const [vatspy, oaAirportsTxt, oaCountriesTxt, ofAirportsTxt, ofAirlinesTxt, oaRunwaysTxt] = await Promise.all(
  Object.values(SRC).map(get),
);

// --- Countries (ISO code -> name)
const countries = {};
for (const r of parseCsv(oaCountriesTxt).slice(1)) if (r[1]) countries[r[1]] = r[2];

// --- OurAirports, indexed by ICAO/GPS code
const SIZE = { large_airport: 3, medium_airport: 2, small_airport: 1, seaplane_base: 1, heliport: 0, closed: -1 };
const oa = new Map();
for (const r of parseCsv(oaAirportsTxt).slice(1)) {
  const [, ident, type, name, lat, lon, elev, , iso, , city, sched, icao, iata, gps] = r;
  const rec = { type, name, lat: +lat, lon: +lon, elev: +elev || 0, iso, city, sched: sched === "yes", iata };
  for (const code of [icao, gps, ident]) if (code && !oa.has(code)) oa.set(code, rec);
}

// --- OpenFlights airports for timezones
const tz = new Map();
for (const r of parseCsv(ofAirportsTxt)) {
  const icao = nul(r[5]);
  if (icao && nul(r[11])) tz.set(icao, nul(r[11]));
}

// --- VATSpy airports are the reference set (what VATSIM pilots actually file)
const section = (name) => {
  const start = vatspy.indexOf(`[${name}]`);
  const end = vatspy.indexOf("\n[", start + 1);
  return vatspy
    .slice(start, end === -1 ? undefined : end)
    .split("\n")
    .slice(1)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith(";"));
};

const airports = [];
const seen = new Set();
for (const line of section("Airports")) {
  const [icao, vName, lat, lon, iataLid, fir, pseudo] = line.split("|");
  if (pseudo === "1" || seen.has(icao)) continue;
  seen.add(icao);
  const o = oa.get(icao);
  const size = o ? Math.max(0, SIZE[o.type] ?? 1) + (o.sched ? 1 : 0) : 1;
  airports.push([
    icao,
    o?.iata || (iataLid && iataLid.length === 3 ? iataLid : ""),
    o?.name || vName,
    (o?.city || "").replace(/\s*\(.*\)$/, "").split(",")[0].trim(),
    o?.iso || "",
    round(+lat),
    round(+lon),
    o?.elev ?? 0,
    tz.get(icao) || "",
    Math.min(size, 4),
    fir,
  ]);
}

// --- Airlines (ICAO -> [name, telephony callsign, country, IATA])
const airlines = {};
for (const r of parseCsv(ofAirlinesTxt)) {
  const name = nul(r[1]), iata = nul(r[3]), icao = nul(r[4]), call = nul(r[5]), country = nul(r[6]), active = r[7];
  if (!/^[A-Z]{3}$/.test(icao)) continue;
  // Prefer active carriers when several share the same ICAO code
  if (airlines[icao] && !(active === "Y" && airlines[icao][4] !== "Y")) continue;
  airlines[icao] = [name, call, country, iata === "-" ? "" : iata, active];
}
for (const k in airlines) airlines[k].pop();

await mkdir("src/data", { recursive: true });
await writeFile(
  "src/data/airports.json",
  JSON.stringify({
    fields: ["icao", "iata", "name", "city", "country", "lat", "lon", "elev", "tz", "size", "fir"],
    rows: airports,
  }),
);
await writeFile("src/data/airlines.json", JSON.stringify(airlines));
await writeFile("src/data/countries.json", JSON.stringify(countries));
console.log(`airports: ${airports.length}, airlines: ${Object.keys(airlines).length}, countries: ${Object.keys(countries).length}`);

// --- Runways, served as static chunks (public/runways/{first 2 ICAO letters}.json)
// so they never weigh on the Worker bundle.
// Row: [le_ident, he_ident, length_ft, width_ft, surface, lighted, le_heading]
const runways = {};
for (const r of parseCsv(oaRunwaysTxt).slice(1)) {
  const [, , ident, len, wid, surface, lighted, closed, le, , , , leHdg, , he] = r;
  if (!seen.has(ident) || closed === "1") continue;
  (runways[ident] ??= []).push([le, he, +len || 0, +wid || 0, surface, lighted === "1" ? 1 : 0, leHdg ? Math.round(+leHdg) : null]);
}
await rm("public/runways", { recursive: true, force: true });
await mkdir("public/runways", { recursive: true });
const chunks = {};
for (const [icao, list] of Object.entries(runways)) (chunks[icao.slice(0, 2)] ??= {})[icao] = list;
for (const [prefix, data] of Object.entries(chunks)) await writeFile(`public/runways/${prefix}.json`, JSON.stringify(data));
console.log(`runways: ${Object.keys(runways).length} airports in ${Object.keys(chunks).length} chunks`);
