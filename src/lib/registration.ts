/** Aircraft registration from a flight plan's REG/ remark, hyphenated like F-HBXA. */
const NO_HYPHEN = /^(N|JA|HL|UK|RDPL)/;
const TWO_LETTER = new Set(
  "EC EI EK EP ER ES EW EX EY EZ HA HB HC HH HI HK HP HR HS HZ JU JY LN LV LX LY LZ OB OD OE OH OK OM OO OY PH PJ PK PP PR PS PT PU PZ RA RP SE SP ST SU SX TC TF TG TI TJ TL TN TR TS TT TU UN UP UR VH VN VP VQ VT XA XB XC YA YI YK YL YN YR YS YU YV ZA ZK ZP ZS 3A 3B 3C 3D 4K 4L 4O 4R 4X 5A 5B 5H 5N 5R 5T 5U 5V 5W 5X 5Y 6O 6V 6Y 7O 7P 7Q 7T 8P 8Q 8R 9A 9G 9H 9J 9K 9L 9M 9N 9Q 9U 9V 9XR 9Y A2 A3 A4O A5 A6 A7 A8 A9C C2 C3 C5 C6 C9 CC CN CP CS CU CX D2 D4 D6 E3 E5 E7 H4 J2 J3 J5 J6 J7 J8 P2 P4 S2 S5 S7 S9 T7 T8A T9 V2 V3 V4 V5 V6 V7 V8 Z3 E9".split(" "),
);

export function registration(remarks: string | undefined): string | null {
  const m = /\bREG\/([A-Z0-9-]{3,10})\b/i.exec(remarks || "");
  if (!m) return null;
  const reg = m[1].toUpperCase();
  if (reg.includes("-") || NO_HYPHEN.test(reg)) return reg;
  for (const len of [3, 2]) if (TWO_LETTER.has(reg.slice(0, len))) return `${reg.slice(0, len)}-${reg.slice(len)}`;
  if (/^[A-Z]/.test(reg) && "FGDICBM".includes(reg[0])) return `${reg[0]}-${reg.slice(1)}`;
  return reg;
}
