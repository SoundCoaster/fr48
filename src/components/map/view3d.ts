import { LngLat, MercatorCoordinate, type CustomLayerInterface, type Map as MLMap } from "maplibre-gl";
import { destination } from "@/lib/geo";

/** What the 3D view follows (refreshed by the caller every frame). */
export interface Target3D {
  lat: number;
  lon: number;
  altFt: number;
  hdg: number;
  vsFpm: number;
  gs: number;
}

const TERRAIN_TILES = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
const FLIGHT_LAYERS = ["flights", "flights-shadow", "flights-hover", "route"];
/** Model is built in metres; drawn a bit larger than life so it reads at chase distance. */
const MODEL_SCALE = 1.6;
const RAD = Math.PI / 180;

type Three = typeof import("three");

/** Low-poly airliner in metres: nose towards +Y (north), up +Z. */
function buildAirliner(T: Three) {
  const g = new T.Group();
  const white = new T.MeshStandardMaterial({ color: 0xf4f5f7, roughness: 0.45, metalness: 0.1, side: T.DoubleSide });
  const grey = new T.MeshStandardMaterial({ color: 0x9aa1aa, roughness: 0.5, metalness: 0.3, side: T.DoubleSide });
  const dark = new T.MeshStandardMaterial({ color: 0x23272d, roughness: 0.6, side: T.DoubleSide });
  const accent = new T.MeshStandardMaterial({ color: 0xfdc307, roughness: 0.4, side: T.DoubleSide });

  // Fuselage (cylinder axis is Y) with tapered nose and tail cones
  const body = new T.Mesh(new T.CylinderGeometry(2, 2, 30, 24), white);
  g.add(body);
  const nose = new T.Mesh(new T.SphereGeometry(2, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), white);
  nose.scale.set(1, 2.2, 1);
  nose.position.y = 15;
  g.add(nose);
  const tail = new T.Mesh(new T.ConeGeometry(2, 9, 24), white);
  tail.rotation.x = Math.PI;
  tail.position.y = -19.5;
  tail.position.z = 0.6;
  tail.scale.set(1, 1, 0.7);
  g.add(tail);
  // Cockpit windows
  const cockpit = new T.Mesh(new T.BoxGeometry(2.4, 1.2, 0.6), dark);
  cockpit.position.set(0, 16.2, 1.3);
  cockpit.rotation.x = -0.5;
  g.add(cockpit);

  const extrude = (pts: [number, number][], depth: number, mat: InstanceType<Three["MeshStandardMaterial"]>) => {
    const shape = new T.Shape(pts.map(([x, y]) => new T.Vector2(x, y)));
    const geo = new T.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    geo.translate(0, 0, -depth / 2);
    return new T.Mesh(geo, mat);
  };

  // Swept wings (in the XY plane)
  for (const side of [1, -1]) {
    const wing = extrude(
      [
        [0, 4],
        [17 * side, -5],
        [17 * side, -7.5],
        [0, -4],
      ],
      0.5,
      white,
    );
    wing.position.z = -0.9;
    g.add(wing);
    // Engines under the wings
    const nacelle = new T.Mesh(new T.CylinderGeometry(1.15, 1, 4.8, 16), grey);
    nacelle.position.set(6.2 * side, 2.6, -2.1);
    g.add(nacelle);
    const intake = new T.Mesh(new T.CircleGeometry(1, 16), dark);
    intake.rotation.x = -Math.PI / 2;
    intake.position.set(6.2 * side, 5.01, -2.1);
    g.add(intake);
    // Horizontal stabiliser
    const stab = extrude(
      [
        [0, -15],
        [6.5 * side, -19.5],
        [6.5 * side, -21],
        [0, -19.5],
      ],
      0.35,
      white,
    );
    stab.position.z = 0.6;
    g.add(stab);
  }
  // Vertical fin
  g.add(makeFin(T, accent));
  return g;
}

/** Vertical fin built directly in model axes (Y = length, Z = height). */
function makeFin(T: Three, mat: InstanceType<Three["MeshStandardMaterial"]>) {
  const pts: [number, number][] = [
    [-13, 1.5],
    [-21.5, 9.5],
    [-24, 9.5],
    [-22.2, 1.5],
  ];
  const shape = new T.Shape(pts.map(([y, z]) => new T.Vector2(y, z)));
  const geo = new T.ExtrudeGeometry(shape, { depth: 0.4, bevelEnabled: false });
  geo.translate(0, 0, -0.2);
  // Shape plane is XY: map shape-x -> model Y, shape-y -> model Z, extrusion -> model X
  geo.applyMatrix4(new T.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1));
  return new T.Mesh(geo, mat);
}

interface Smoothed {
  lat: number;
  lon: number;
  altM: number;
  hdg: number;
  pitch: number;
}

/**
 * FR24-style 3D chase view: terrain, a 3D aircraft at its real altitude and a
 * camera that follows it. Drag to orbit, wheel/pinch to change distance.
 */
export class View3D {
  private state: Smoothed | null = null;
  private orbitAz = 0; // degrees relative to "behind the aircraft"
  private orbitEl = 14; // degrees above the horizon
  private distance = 260; // metres
  private raf = 0;
  private last = performance.now();
  private cleanup: (() => void)[] = [];
  private layerReady = false;

  constructor(
    private map: MLMap,
    private target: () => Target3D | null,
  ) {}

  async start() {
    const map = this.map;
    const T = await import("three");

    if (!map.getSource("dem")) {
      map.addSource("dem", { type: "raster-dem", tiles: [TERRAIN_TILES], tileSize: 256, encoding: "terrarium", maxzoom: 15 });
    }
    map.setTerrain({ source: "dem", exaggeration: 1 });
    map.setMaxPitch(85);
    for (const id of FLIGHT_LAYERS) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");

    // The camera is driven here; disable the map's own gestures and add orbit controls
    map.dragPan.disable();
    map.scrollZoom.disable();
    map.touchZoomRotate.disable();
    map.doubleClickZoom.disable();
    const canvas = map.getCanvas();
    let dragging: { x: number; y: number } | null = null;
    let pinch: number | null = null;
    const onDown = (e: PointerEvent) => {
      dragging = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging || pinch !== null) return;
      this.orbitAz -= (e.clientX - dragging.x) * 0.35;
      this.orbitEl = Math.max(-5, Math.min(70, this.orbitEl + (e.clientY - dragging.y) * 0.25));
      dragging = { x: e.clientX, y: e.clientY };
    };
    const onUp = () => (dragging = null);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      this.distance = Math.max(70, Math.min(6000, this.distance * Math.exp(e.deltaY * 0.0015)));
    };
    const onTouch = (e: TouchEvent) => {
      if (e.touches.length !== 2) return (pinch = null);
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      if (pinch !== null) this.distance = Math.max(70, Math.min(6000, this.distance * (pinch / d)));
      pinch = d;
    };
    const onTouchEnd = () => (pinch = null);
    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("touchmove", onTouch, { passive: true });
    canvas.addEventListener("touchend", onTouchEnd);
    this.cleanup.push(() => {
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("touchmove", onTouch);
      canvas.removeEventListener("touchend", onTouchEnd);
    });

    // three.js custom layer drawing the aircraft into MapLibre's GL context
    let renderer: InstanceType<Three["WebGLRenderer"]>;
    const scene = new T.Scene();
    const camera = new T.Camera();
    const model = buildAirliner(T);
    scene.add(model);
    scene.add(new T.AmbientLight(0xffffff, 1.4));
    const sun = new T.DirectionalLight(0xffffff, 2.2);
    sun.position.set(40, 60, 120);
    scene.add(sun);
    const current = () => this.state;
    const layer: CustomLayerInterface = {
      id: "plane3d",
      type: "custom",
      renderingMode: "3d",
      onAdd(m, gl) {
        renderer = new T.WebGLRenderer({ canvas: m.getCanvas(), context: gl as WebGL2RenderingContext, antialias: true });
        renderer.autoClear = false;
      },
      render(_gl, args) {
        const s = current();
        if (!s) return;
        const mc = MercatorCoordinate.fromLngLat([s.lon, s.lat], s.altM);
        const scale = mc.meterInMercatorCoordinateUnits() * MODEL_SCALE;
        const local = new T.Matrix4()
          .makeTranslation(mc.x, mc.y, mc.z ?? 0)
          .scale(new T.Vector3(scale, -scale, scale))
          .multiply(new T.Matrix4().makeRotationZ(-s.hdg * RAD))
          .multiply(new T.Matrix4().makeRotationX(s.pitch * RAD));
        camera.projectionMatrix = new T.Matrix4().fromArray(args.modelViewProjectionMatrix as unknown as number[]).multiply(local);
        renderer.resetState();
        renderer.render(scene, camera);
      },
    };
    map.addLayer(layer);
    this.layerReady = true;
    this.cleanup.push(() => {
      if (map.getLayer("plane3d")) map.removeLayer("plane3d");
    });

    this.loop();
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.5, (now - this.last) / 1000);
    this.last = now;
    const t = this.target();
    if (!t || !this.layerReady) return;

    const map = this.map;
    const ground = map.queryTerrainElevation(new LngLat(t.lon, t.lat)) ?? 0;
    const altM = Math.max(t.altFt * 0.3048, ground + 2);
    const pitch = Math.max(-12, Math.min(15, Math.atan2(t.vsFpm / 196.85, Math.max(t.gs, 60) * 0.5144) / RAD));

    // Smooth out the corrections that arrive with each feed update
    const k = 1 - Math.exp(-dt * 2.5);
    const s = this.state;
    if (!s || Math.abs(s.lat - t.lat) > 0.2 || Math.abs(s.lon - t.lon) > 0.2) {
      this.state = { lat: t.lat, lon: t.lon, altM, hdg: t.hdg, pitch };
    } else {
      s.lat += (t.lat - s.lat) * k;
      s.lon += (t.lon - s.lon) * k;
      s.altM += (altM - s.altM) * k;
      s.hdg = (s.hdg + ((((t.hdg - s.hdg) % 360) + 540) % 360 - 180) * k + 360) % 360;
      s.pitch += (pitch - s.pitch) * k;
    }
    const st = this.state!;

    // Chase camera: behind the aircraft (plus user orbit), slightly above
    const az = st.hdg + 180 + this.orbitAz;
    const horiz = this.distance * Math.cos(this.orbitEl * RAD);
    const [clat, clon] = destination(st.lat, st.lon, az, horiz / 1852);
    const camGround = map.queryTerrainElevation(new LngLat(clon, clat)) ?? 0;
    const camAlt = Math.max(st.altM + this.distance * Math.sin(this.orbitEl * RAD), camGround + 20);
    const opts = map.calculateCameraOptionsFromTo(new LngLat(clon, clat), camAlt, new LngLat(st.lon, st.lat), st.altM);
    map.jumpTo(opts);
  };

  stop() {
    cancelAnimationFrame(this.raf);
    this.cleanup.forEach((f) => f());
    this.cleanup = [];
    const map = this.map;
    try {
      map.setTerrain(null);
      if (map.getSource("dem")) map.removeSource("dem");
      for (const id of FLIGHT_LAYERS) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "visible");
    } catch {
      // style may have been replaced
    }
    map.setMaxPitch(60);
    map.dragPan.enable();
    map.scrollZoom.enable();
    map.touchZoomRotate.enable();
    map.touchZoomRotate.disableRotation();
    map.doubleClickZoom.enable();
    const s = this.state;
    map.easeTo({ pitch: 0, bearing: 0, zoom: 8, ...(s ? { center: [s.lon, s.lat] as [number, number] } : {}), duration: 800 });
  }
}
