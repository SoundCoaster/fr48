// ICAO aircraft type designator -> [display name, silhouette category]
/** Map icon family; each has /public/aircraft/{name}.png and {name}-sel.png. */
export type Silhouette =
  | "a380"
  | "b747"
  | "a340"
  | "quad"
  | "b777"
  | "a350"
  | "b787"
  | "a330"
  | "b767"
  | "trijet"
  | "b757"
  | "a321"
  | "a320"
  | "b737"
  | "ejet"
  | "rj"
  | "bizjet"
  | "turboprop"
  | "twinprop"
  | "ga"
  | "glider"
  | "heli"
  | "fighter"
  | "balloon"
  | "santa";

/** Relative on-map size of each icon family. */
export const SILHOUETTE_SCALE: Record<Silhouette, number> = {
  a380: 1.25, b747: 1.2, a340: 1.12, quad: 0.95, b777: 1.15, a350: 1.12, b787: 1.08, a330: 1.1,
  b767: 1.05, trijet: 1.1, b757: 0.95, a321: 0.92, a320: 0.88, b737: 0.88, ejet: 0.82, rj: 0.8,
  bizjet: 0.72, turboprop: 0.82, twinprop: 0.7, ga: 0.62, glider: 0.66, heli: 0.66, fighter: 0.7,
  balloon: 0.6, santa: 1.6,
};

export const SILHOUETTES = Object.keys(SILHOUETTE_SCALE) as Silhouette[];

const T: Record<string, [string, Silhouette]> = {
  // Airbus
  A19N: ["Airbus A319neo", "a320"],
  A20N: ["Airbus A320neo", "a320"],
  A21N: ["Airbus A321neo", "a321"],
  A318: ["Airbus A318", "a320"],
  A319: ["Airbus A319", "a320"],
  A320: ["Airbus A320", "a320"],
  A321: ["Airbus A321", "a321"],
  A306: ["Airbus A300-600", "a330"],
  A30B: ["Airbus A300", "a330"],
  A310: ["Airbus A310", "a330"],
  A332: ["Airbus A330-200", "a330"],
  A333: ["Airbus A330-300", "a330"],
  A337: ["Airbus A330 Beluga XL", "a330"],
  A338: ["Airbus A330-800neo", "a330"],
  A339: ["Airbus A330-900neo", "a330"],
  A342: ["Airbus A340-200", "a340"],
  A343: ["Airbus A340-300", "a340"],
  A345: ["Airbus A340-500", "a340"],
  A346: ["Airbus A340-600", "a340"],
  A359: ["Airbus A350-900", "a350"],
  A35K: ["Airbus A350-1000", "a350"],
  A388: ["Airbus A380-800", "a380"],
  A3ST: ["Airbus A300-600ST Beluga", "a330"],
  A400: ["Airbus A400M Atlas", "turboprop"],
  BCS1: ["Airbus A220-100", "ejet"],
  BCS3: ["Airbus A220-300", "ejet"],
  // Boeing
  B712: ["Boeing 717-200", "rj"],
  B721: ["Boeing 727-100", "rj"],
  B722: ["Boeing 727-200", "rj"],
  B732: ["Boeing 737-200", "b737"],
  B733: ["Boeing 737-300", "b737"],
  B734: ["Boeing 737-400", "b737"],
  B735: ["Boeing 737-500", "b737"],
  B736: ["Boeing 737-600", "b737"],
  B737: ["Boeing 737-700", "b737"],
  B738: ["Boeing 737-800", "b737"],
  B739: ["Boeing 737-900", "b737"],
  B37M: ["Boeing 737 MAX 7", "b737"],
  B38M: ["Boeing 737 MAX 8", "b737"],
  B39M: ["Boeing 737 MAX 9", "b737"],
  B3XM: ["Boeing 737 MAX 10", "b737"],
  B741: ["Boeing 747-100", "b747"],
  B742: ["Boeing 747-200", "b747"],
  B743: ["Boeing 747-300", "b747"],
  B744: ["Boeing 747-400", "b747"],
  B748: ["Boeing 747-8", "b747"],
  B74S: ["Boeing 747SP", "b747"],
  B752: ["Boeing 757-200", "b757"],
  B753: ["Boeing 757-300", "b757"],
  B762: ["Boeing 767-200", "b767"],
  B763: ["Boeing 767-300", "b767"],
  B764: ["Boeing 767-400", "b767"],
  B772: ["Boeing 777-200", "b777"],
  B77L: ["Boeing 777-200LR", "b777"],
  B773: ["Boeing 777-300", "b777"],
  B77W: ["Boeing 777-300ER", "b777"],
  B778: ["Boeing 777-8", "b777"],
  B779: ["Boeing 777-9", "b777"],
  B788: ["Boeing 787-8 Dreamliner", "b787"],
  B789: ["Boeing 787-9 Dreamliner", "b787"],
  B78X: ["Boeing 787-10 Dreamliner", "b787"],
  // McDonnell Douglas / Lockheed / others
  DC10: ["McDonnell Douglas DC-10", "trijet"],
  MD11: ["McDonnell Douglas MD-11", "trijet"],
  MD80: ["McDonnell Douglas MD-80", "rj"],
  MD81: ["McDonnell Douglas MD-81", "rj"],
  MD82: ["McDonnell Douglas MD-82", "rj"],
  MD83: ["McDonnell Douglas MD-83", "rj"],
  MD87: ["McDonnell Douglas MD-87", "rj"],
  MD88: ["McDonnell Douglas MD-88", "rj"],
  MD90: ["McDonnell Douglas MD-90", "rj"],
  DC3: ["Douglas DC-3", "turboprop"],
  DC6: ["Douglas DC-6", "turboprop"],
  L101: ["Lockheed L-1011 TriStar", "trijet"],
  CONC: ["Aérospatiale/BAC Concorde", "fighter"],
  C130: ["Lockheed C-130 Hercules", "turboprop"],
  C30J: ["Lockheed Martin C-130J Super Hercules", "turboprop"],
  C17: ["Boeing C-17 Globemaster III", "b747"],
  C5M: ["Lockheed C-5M Super Galaxy", "b747"],
  K35R: ["Boeing KC-135R Stratotanker", "quad"],
  KC2: ["Kawasaki C-2", "a330"],
  E3TF: ["Boeing E-3 Sentry", "quad"],
  AN12: ["Antonov An-12", "turboprop"],
  A124: ["Antonov An-124 Ruslan", "b747"],
  A225: ["Antonov An-225 Mriya", "b747"],
  IL76: ["Ilyushin Il-76", "b747"],
  IL96: ["Ilyushin Il-96", "b747"],
  T154: ["Tupolev Tu-154", "rj"],
  T204: ["Tupolev Tu-204", "a320"],
  SU95: ["Sukhoi Superjet 100", "ejet"],
  C919: ["COMAC C919", "a320"],
  AJ27: ["COMAC ARJ21", "rj"],
  // Regional jets
  CRJ1: ["Bombardier CRJ100", "rj"],
  CRJ2: ["Bombardier CRJ200", "rj"],
  CRJ7: ["Bombardier CRJ700", "rj"],
  CRJ9: ["Bombardier CRJ900", "rj"],
  CRJX: ["Bombardier CRJ1000", "rj"],
  E135: ["Embraer ERJ-135", "rj"],
  E140: ["Embraer ERJ-140", "rj"],
  E145: ["Embraer ERJ-145", "rj"],
  E170: ["Embraer E170", "ejet"],
  E175: ["Embraer E175", "ejet"],
  E75L: ["Embraer E175", "ejet"],
  E75S: ["Embraer E175", "ejet"],
  E190: ["Embraer E190", "ejet"],
  E195: ["Embraer E195", "ejet"],
  E290: ["Embraer E190-E2", "ejet"],
  E295: ["Embraer E195-E2", "ejet"],
  F70: ["Fokker 70", "rj"],
  F100: ["Fokker 100", "rj"],
  B461: ["BAe 146-100", "quad"],
  B462: ["BAe 146-200", "quad"],
  B463: ["BAe 146-300", "quad"],
  RJ70: ["Avro RJ70", "quad"],
  RJ85: ["Avro RJ85", "quad"],
  RJ1H: ["Avro RJ100", "quad"],
  // Turboprops
  AT43: ["ATR 42-300", "turboprop"],
  AT45: ["ATR 42-500", "turboprop"],
  AT46: ["ATR 42-600", "turboprop"],
  AT72: ["ATR 72", "turboprop"],
  AT75: ["ATR 72-500", "turboprop"],
  AT76: ["ATR 72-600", "turboprop"],
  DH8A: ["De Havilland Canada Dash 8-100", "turboprop"],
  DH8B: ["De Havilland Canada Dash 8-200", "turboprop"],
  DH8C: ["De Havilland Canada Dash 8-300", "turboprop"],
  DH8D: ["De Havilland Canada Dash 8-400", "turboprop"],
  DHC6: ["De Havilland Canada Twin Otter", "turboprop"],
  DHC7: ["De Havilland Canada Dash 7", "turboprop"],
  DHC2: ["De Havilland Canada Beaver", "ga"],
  SF34: ["Saab 340", "turboprop"],
  SB20: ["Saab 2000", "turboprop"],
  JS31: ["BAe Jetstream 31", "turboprop"],
  JS32: ["BAe Jetstream 32", "turboprop"],
  JS41: ["BAe Jetstream 41", "turboprop"],
  E120: ["Embraer EMB 120 Brasilia", "turboprop"],
  D328: ["Dornier 328", "turboprop"],
  F50: ["Fokker 50", "turboprop"],
  B190: ["Beechcraft 1900", "turboprop"],
  BE20: ["Beechcraft King Air 200", "twinprop"],
  BE30: ["Beechcraft King Air 300", "twinprop"],
  BE9L: ["Beechcraft King Air 90", "twinprop"],
  B350: ["Beechcraft King Air 350", "twinprop"],
  PC12: ["Pilatus PC-12", "ga"],
  PC24: ["Pilatus PC-24", "bizjet"],
  PC6T: ["Pilatus PC-6 Porter", "ga"],
  PC21: ["Pilatus PC-21", "ga"],
  TBM7: ["Daher TBM 700", "ga"],
  TBM8: ["Daher TBM 850", "ga"],
  TBM9: ["Daher TBM 900", "ga"],
  C208: ["Cessna 208 Caravan", "ga"],
  KODI: ["Daher Kodiak 100", "ga"],
  P180: ["Piaggio P.180 Avanti", "twinprop"],
  // Business jets
  C25A: ["Cessna Citation CJ2", "bizjet"],
  C25B: ["Cessna Citation CJ3", "bizjet"],
  C25C: ["Cessna Citation CJ4", "bizjet"],
  C510: ["Cessna Citation Mustang", "bizjet"],
  C525: ["Cessna CitationJet", "bizjet"],
  C550: ["Cessna Citation II", "bizjet"],
  C560: ["Cessna Citation V", "bizjet"],
  C56X: ["Cessna Citation Excel", "bizjet"],
  C680: ["Cessna Citation Sovereign", "bizjet"],
  C68A: ["Cessna Citation Latitude", "bizjet"],
  C700: ["Cessna Citation Longitude", "bizjet"],
  C750: ["Cessna Citation X", "bizjet"],
  E50P: ["Embraer Phenom 100", "bizjet"],
  E55P: ["Embraer Phenom 300", "bizjet"],
  E545: ["Embraer Praetor 500", "bizjet"],
  E550: ["Embraer Praetor 600", "bizjet"],
  LJ35: ["Learjet 35", "bizjet"],
  LJ45: ["Learjet 45", "bizjet"],
  LJ75: ["Learjet 75", "bizjet"],
  CL30: ["Bombardier Challenger 300", "bizjet"],
  CL35: ["Bombardier Challenger 350", "bizjet"],
  CL60: ["Bombardier Challenger 600", "bizjet"],
  GL5T: ["Bombardier Global 5000", "bizjet"],
  GLEX: ["Bombardier Global Express", "bizjet"],
  GL7T: ["Bombardier Global 7500", "bizjet"],
  GLF4: ["Gulfstream IV", "bizjet"],
  GLF5: ["Gulfstream V", "bizjet"],
  GLF6: ["Gulfstream G650", "bizjet"],
  G280: ["Gulfstream G280", "bizjet"],
  GA6C: ["Gulfstream G600", "bizjet"],
  GA7C: ["Gulfstream G700", "bizjet"],
  F2TH: ["Dassault Falcon 2000", "bizjet"],
  FA7X: ["Dassault Falcon 7X", "bizjet"],
  FA8X: ["Dassault Falcon 8X", "bizjet"],
  FA50: ["Dassault Falcon 50", "bizjet"],
  F900: ["Dassault Falcon 900", "bizjet"],
  H25B: ["Hawker 800", "bizjet"],
  HDJT: ["Honda HA-420 HondaJet", "bizjet"],
  SF50: ["Cirrus SF50 Vision Jet", "bizjet"],
  EA50: ["Eclipse 500", "bizjet"],
  BBJ: ["Boeing Business Jet", "b737"],
  // General aviation
  C150: ["Cessna 150", "ga"],
  C152: ["Cessna 152", "ga"],
  C162: ["Cessna 162 Skycatcher", "ga"],
  C172: ["Cessna 172 Skyhawk", "ga"],
  C177: ["Cessna 177 Cardinal", "ga"],
  C182: ["Cessna 182 Skylane", "ga"],
  C206: ["Cessna 206 Stationair", "ga"],
  C210: ["Cessna 210 Centurion", "ga"],
  C310: ["Cessna 310", "twinprop"],
  C340: ["Cessna 340", "twinprop"],
  C414: ["Cessna 414", "twinprop"],
  C421: ["Cessna 421", "twinprop"],
  P28A: ["Piper PA-28 Cherokee", "ga"],
  P28B: ["Piper PA-28 Cherokee", "ga"],
  P28R: ["Piper PA-28R Arrow", "ga"],
  P32R: ["Piper PA-32R Saratoga", "ga"],
  P46T: ["Piper PA-46 Malibu Meridian", "ga"],
  PA46: ["Piper PA-46 Malibu", "ga"],
  PA34: ["Piper PA-34 Seneca", "twinprop"],
  PA44: ["Piper PA-44 Seminole", "twinprop"],
  PA18: ["Piper PA-18 Super Cub", "ga"],
  J3: ["Piper J-3 Cub", "ga"],
  SR20: ["Cirrus SR20", "ga"],
  SR22: ["Cirrus SR22", "ga"],
  S22T: ["Cirrus SR22T", "ga"],
  DA40: ["Diamond DA40 Diamond Star", "ga"],
  DA42: ["Diamond DA42 Twin Star", "twinprop"],
  DA62: ["Diamond DA62", "twinprop"],
  DV20: ["Diamond DV20 Katana", "ga"],
  BE33: ["Beechcraft Bonanza 33", "ga"],
  BE35: ["Beechcraft Bonanza 35", "ga"],
  BE36: ["Beechcraft Bonanza 36", "ga"],
  BE58: ["Beechcraft Baron 58", "twinprop"],
  BE55: ["Beechcraft Baron 55", "twinprop"],
  M20P: ["Mooney M20", "ga"],
  M20T: ["Mooney M20 Turbo", "ga"],
  DR40: ["Robin DR400", "ga"],
  TB20: ["Socata TB-20 Trinidad", "ga"],
  TB10: ["Socata TB-10 Tobago", "ga"],
  C42: ["Comco Ikarus C42", "ga"],
  P208: ["Tecnam P2008", "ga"],
  P210: ["Piper PA-46 Malibu", "ga"],
  GLID: ["Glider", "glider"],
  DG1T: ["DG Flugzeugbau DG-1000", "glider"],
  EXTR: ["Extra EA-300", "ga"],
  E300: ["Extra EA-300", "ga"],
  PTS2: ["Pitts S-2 Special", "ga"],
  ICON: ["ICON A5", "ga"],
  BALL: ["Hot-air balloon", "balloon"],
  // Helicopters
  EC35: ["Airbus Helicopters H135", "heli"],
  EC45: ["Airbus Helicopters H145", "heli"],
  EC30: ["Airbus Helicopters H130", "heli"],
  EC55: ["Airbus Helicopters H155", "heli"],
  EC75: ["Airbus Helicopters H175", "heli"],
  EC25: ["Airbus Helicopters H225", "heli"],
  AS50: ["Airbus Helicopters H125", "heli"],
  AS65: ["Airbus Helicopters Dauphin", "heli"],
  A109: ["Leonardo AW109", "heli"],
  A139: ["Leonardo AW139", "heli"],
  A169: ["Leonardo AW169", "heli"],
  A189: ["Leonardo AW189", "heli"],
  B06: ["Bell 206 JetRanger", "heli"],
  B407: ["Bell 407", "heli"],
  B412: ["Bell 412", "heli"],
  B429: ["Bell 429", "heli"],
  B505: ["Bell 505 Jet Ranger X", "heli"],
  R22: ["Robinson R22", "heli"],
  R44: ["Robinson R44", "heli"],
  R66: ["Robinson R66", "heli"],
  S76: ["Sikorsky S-76", "heli"],
  S92: ["Sikorsky S-92", "heli"],
  H60: ["Sikorsky UH-60 Black Hawk", "heli"],
  H47: ["Boeing CH-47 Chinook", "heli"],
  UH1: ["Bell UH-1 Iroquois", "heli"],
  V22: ["Bell Boeing V-22 Osprey", "turboprop"],
  // Military jets
  F16: ["General Dynamics F-16 Fighting Falcon", "fighter"],
  F18: ["Boeing F/A-18 Hornet", "fighter"],
  F18S: ["Boeing F/A-18E/F Super Hornet", "fighter"],
  F15: ["McDonnell Douglas F-15 Eagle", "fighter"],
  F14: ["Grumman F-14 Tomcat", "fighter"],
  F22: ["Lockheed Martin F-22 Raptor", "fighter"],
  F35: ["Lockheed Martin F-35 Lightning II", "fighter"],
  EUFI: ["Eurofighter Typhoon", "fighter"],
  RFAL: ["Dassault Rafale", "fighter"],
  M2000: ["Dassault Mirage 2000", "fighter"],
  MIR2: ["Dassault Mirage 2000", "fighter"],
  GRIF: ["Saab JAS 39 Gripen", "fighter"],
  A10: ["Fairchild Republic A-10", "fighter"],
  T38: ["Northrop T-38 Talon", "fighter"],
  HAWK: ["BAE Systems Hawk", "fighter"],
  ALJ: ["Dassault/Dornier Alpha Jet", "fighter"],
  SU27: ["Sukhoi Su-27", "fighter"],
  MG29: ["Mikoyan MiG-29", "fighter"],
  B1: ["Rockwell B-1 Lancer", "fighter"],
  B52: ["Boeing B-52 Stratofortress", "b747"],
};

export function aircraftInfo(code: string | undefined): { code: string; name: string; silhouette: Silhouette } {
  const c = (code || "").toUpperCase();
  const hit = T[c];
  if (hit) return { code: c, name: hit[0], silhouette: hit[1] };
  return { code: c, name: c || "Unknown", silhouette: guessSilhouette(c) };
}

function guessSilhouette(c: string): Silhouette {
  if (/^B74/.test(c)) return "b747";
  if (/^A34/.test(c)) return "a340";
  if (/^B77/.test(c)) return "b777";
  if (/^B78/.test(c)) return "b787";
  if (/^A35/.test(c)) return "a350";
  if (/^(A33|A30)/.test(c)) return "a330";
  if (/^B76/.test(c)) return "b767";
  if (/^B75/.test(c)) return "b757";
  if (/^(B73|B3)/.test(c)) return "b737";
  if (/^(E1[79]|E2|BCS)/.test(c)) return "ejet";
  if (/^(CRJ|E13|E14|MD8)/.test(c)) return "rj";
  if (/^(AT[47]|DH8|SF3)/.test(c)) return "turboprop";
  if (/^(BE[0-9]|PA3|PA4|C3|C4)/.test(c)) return "twinprop";
  if (/^(C5|C6|C7|LJ|GLF|FA|CL[36]|GL|E5)/.test(c)) return "bizjet";
  if (/^(C1|C2|P28|SR2|DA4|PA)/.test(c)) return "ga";
  if (/^(R[24]|EC|AS|H[0-9]|B4[0-9])/.test(c)) return "heli";
  return "a320";
}
