export interface DecodedMetar {
  raw: string;
  wind: string | null;
  visibility: string | null;
  temperature: number | null;
  dewpoint: number | null;
  qnh: string | null;
  clouds: string | null;
  category: "VFR" | "MVFR" | "IFR" | "LIFR" | null;
  /** Degrees true; null when calm or variable */
  windDir: number | null;
  windKt: number | null;
  sky: "clear" | "partly" | "cloudy" | "rain" | "snow" | "storm" | "fog";
}

const COVER: Record<string, string> = { FEW: "Few", SCT: "Scattered", BKN: "Broken", OVC: "Overcast", VV: "Vertical vis." };

export function decodeMetar(raw: string): DecodedMetar {
  const t = raw.split(/\s+/);
  const out: DecodedMetar = {
    raw, wind: null, visibility: null, temperature: null, dewpoint: null, qnh: null, clouds: null, category: null,
    windDir: null, windKt: null, sky: "clear",
  };
  let maxCover = 0;
  let ceiling = Infinity;
  let visM = Infinity;
  for (const tok of t) {
    let m: RegExpExecArray | null;
    if ((m = /^(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?(KT|MPS)$/.exec(tok))) {
      const unit = m[4] === "MPS" ? "m/s" : "kt";
      out.wind = +m[2] === 0 ? "Calm" : `${m[1] === "VRB" ? "Variable" : `${m[1]}°`} ${+m[2]}${m[3] ? `G${+m[3]}` : ""} ${unit}`;
      out.windKt = Math.round(m[4] === "MPS" ? +m[2] * 1.944 : +m[2]);
      out.windDir = m[1] === "VRB" || out.windKt === 0 ? null : +m[1];
    } else if (/^\d{4}$/.test(tok) && out.wind && !out.visibility) {
      visM = +tok;
      out.visibility = +tok >= 9999 ? "10+ km" : `${(+tok / 1000).toFixed(+tok < 5000 ? 1 : 0)} km`;
    } else if ((m = /^(\d+)?(?:\s?(\d)\/(\d))?SM$/.exec(tok))) {
      const sm = (m[1] ? +m[1] : 0) + (m[2] ? +m[2] / +m[3] : 0);
      visM = sm * 1609;
      out.visibility = `${sm} SM`;
    } else if (tok === "CAVOK") {
      out.visibility = "10+ km";
      out.clouds = "CAVOK";
    } else if ((m = /^(M?\d{2})\/(M?\d{2})?$/.exec(tok))) {
      out.temperature = parseInt(m[1].replace("M", "-"), 10);
      if (m[2]) out.dewpoint = parseInt(m[2].replace("M", "-"), 10);
    } else if ((m = /^Q(\d{4})$/.exec(tok))) out.qnh = `${+m[1]} hPa`;
    else if ((m = /^A(\d{4})$/.exec(tok))) out.qnh = `${(+m[1] / 100).toFixed(2)} inHg`;
    else if ((m = /^(FEW|SCT|BKN|OVC|VV)(\d{3})/.exec(tok))) {
      const ft = +m[2] * 100;
      maxCover = Math.max(maxCover, { FEW: 1, SCT: 2, BKN: 3, OVC: 4, VV: 4 }[m[1]] ?? 0);
      if ((m[1] === "BKN" || m[1] === "OVC" || m[1] === "VV") && ft < ceiling) ceiling = ft;
      if (!out.clouds) out.clouds = `${COVER[m[1]]} ${ft.toLocaleString("en-US")} ft`;
    } else if (tok === "NSC" || tok === "SKC" || tok === "CLR" || tok === "NCD") out.clouds ??= "Clear";
  }
  if (/(^|\s)[+-]?(VC)?TS/.test(raw)) out.sky = "storm";
  else if (/(^|\s)[+-]?(SN|SG|PL)/.test(raw)) out.sky = "snow";
  else if (/(^|\s)[+-]?(SH|DZ|RA)/.test(raw)) out.sky = "rain";
  else if (/(^|\s)(FG|BR|HZ)(\s|$)/.test(raw)) out.sky = "fog";
  else out.sky = maxCover >= 3 ? "cloudy" : maxCover >= 1 ? "partly" : "clear";
  if (out.wind || out.visibility) {
    out.category =
      ceiling < 500 || visM < 1600 ? "LIFR" : ceiling < 1000 || visM < 4800 ? "IFR" : ceiling <= 3000 || visM <= 8000 ? "MVFR" : "VFR";
  }
  return out;
}
