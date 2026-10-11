import type { Map as MLMap } from "maplibre-gl";

/** The live map instance, for controls rendered outside the map tree. */
export const mapInstance: { current: MLMap | null } = { current: null };
