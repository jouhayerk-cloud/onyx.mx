/**
 * Build a mesh for an inventory item.
 *
 * Replaces `createCanoeMesh` + `createFallbackMesh` from ThreeDView.tsx. The old
 * pair had exactly one real generator, gated on `shape.includes('canoe')`, which
 * matches zero of the 497 production rows -- so in practice every item rendered
 * as a grey box. These generators are dispatched on `generated_type` + `shape`
 * instead (see geometryStrategy.ts) and cover 482 of them.
 *
 * Geometry sources, best first. Each tier falls through to the next, so an item
 * is only ever a placeholder when it has neither a type nor dimensions:
 *
 *   1. a captured/baked GLB              (Phase 3 -- not yet wired)
 *   2. a multi-angle visual hull         (Phase 4 -- not yet wired)
 *   3. a vectorized mask silhouette      (Phase 2 -- the `outline` parameter)
 *   4. a parametric profile + dimensions (Phase 1 -- here, 438 items)
 *   5. a placeholder box                 (15 items)
 *
 * Meshes carrying the stone surface are tagged `userData.onyxSurface = true` so
 * the caller can find them for texturing without knowing how they were built.
 */
import * as THREE from 'three';

import type { InventoryItemData } from '../../lib/Types';
import { resolveGeometryStrategy, type GeometryStrategy } from './geometryStrategy';
import { profileFor, type LatheProfile, type OutlineProfile, type Profile } from './parametricProfiles';
import { createMirrorGlassMaterial, createOnyxMaterial, thicknessForItem } from './onyxMaterial';

/** Real-world size in metres. Falls back to a plausible tabletop object. */
interface ItemDimensions {
  length: number;
  width: number;
  height: number;
}

function dimensionsOf(item: InventoryItemData): ItemDimensions {
  const parse = (v: string | undefined, fallback: number) => {
    const n = parseFloat(v || '');
    return Number.isFinite(n) && n > 0 ? n / 100 : fallback;
  };
  return {
    length: parse(item.lengthCm, 0.3),
    width: parse(item.widthCm, 0.3),
    height: parse(item.heightCm, 0.25),
  };
}

/** More segments for bigger pieces; silhouette banding is only visible at size. */
function radialSegmentsFor(radius: number): number {
  return THREE.MathUtils.clamp(Math.round(32 + radius * 160), 32, 96);
}

function onyxMaterialFor(item: InventoryItemData, doubleSided = false) {
  return createOnyxMaterial({
    color: 0xffffff,
    thickness: thicknessForItem(item),
    doubleSided,
  });
}

function tagOnyx<T extends THREE.Mesh>(mesh: T): T {
  mesh.userData.onyxSurface = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Every stone-surfaced mesh under an object, for texture application. */
export function onyxSurfacesOf(object: THREE.Object3D): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  object.traverse(child => {
    if ((child as THREE.Mesh).isMesh && child.userData.onyxSurface) found.push(child as THREE.Mesh);
  });
  return found;
}

/** Recentre on the origin and sit the piece on y = 0. */
function groundAndCentre(object: THREE.Object3D): void {
  const box = new THREE.Box3().setFromObject(object);
  const centre = box.getCenter(new THREE.Vector3());
  object.position.x -= centre.x;
  object.position.z -= centre.z;
  object.position.y -= box.min.y;
}

// ---------------------------------------------------------------------------
// Outline helpers (shared by the extrude-family generators)
// ---------------------------------------------------------------------------

/** Rescale arbitrary points into the -0.5..0.5 box the profiles use. */
function normalizeOutline(points: THREE.Vector2[]): Array<readonly [number, number]> {
  const box = new THREE.Box2().setFromPoints(points);
  const size = box.getSize(new THREE.Vector2());
  if (size.x <= 0 || size.y <= 0) return [];

  return points.map(p => [
    (p.x - box.min.x) / size.x - 0.5,
    (p.y - box.min.y) / size.y - 0.5,
  ] as const);
}

function toShape(points: ReadonlyArray<readonly [number, number]>, sx: number, sy: number): THREE.Shape {
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => {
    if (i === 0) shape.moveTo(x * sx, y * sy);
    else shape.lineTo(x * sx, y * sy);
  });
  shape.closePath();
  return shape;
}

/** Same footprint shrunk toward its centre -- the inner wall of a tray or frame. */
function insetPoints(
  points: ReadonlyArray<readonly [number, number]>,
  factor: number,
): Array<readonly [number, number]> {
  return points.map(([x, y]) => [x * factor, y * factor] as const);
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * Turned pieces: pendants, table and floor lamps, bowls, fountains, spheres.
 *
 * The single biggest class -- 292 of 497 items -- and the one the Showroom had
 * no generator for at all.
 *
 * Hollow profiles double back down the inside, so one revolve yields the outer
 * wall, the rim and the inner wall together, and the interior is what makes the
 * transmission read as stone rather than as a solid lump.
 */
export function createLatheMesh(
  item: InventoryItemData,
  profile: LatheProfile,
  outline?: THREE.Vector2[],
): THREE.Mesh {
  const { length, width, height } = dimensionsOf(item);
  const maxRadius = Math.max(length, width) / 2;

  const source = outline?.length ? outlineToLatheProfile(outline) : profile.points;

  const points = source.map(([r, h]) => new THREE.Vector2(
    // A true zero radius makes a degenerate pole with broken normals.
    Math.max(r * maxRadius, 1e-4),
    h * height,
  ));

  const geometry = new THREE.LatheGeometry(points, radialSegmentsFor(maxRadius));
  geometry.computeVertexNormals();

  return tagOnyx(new THREE.Mesh(geometry, onyxMaterialFor(item, profile.doubleSided ?? true)));
}

/**
 * Turn a silhouette into a revolve profile (Phase 2 path).
 *
 * Takes the widest horizontal half-extent at each height band, which recovers a
 * turned piece's profile from a straight-on photograph. Bands are sampled
 * rather than per-point so an irregular contour does not produce a jagged lathe.
 */
export function outlineToLatheProfile(
  outline: THREE.Vector2[],
  bands = 24,
): Array<readonly [number, number]> {
  const box = new THREE.Box2().setFromPoints(outline);
  const size = box.getSize(new THREE.Vector2());
  if (size.x <= 0 || size.y <= 0) return [[0.5, 0], [0.5, 1]];

  const centreX = box.min.x + size.x / 2;
  const maxima = new Array<number>(bands).fill(0);

  for (const p of outline) {
    const t = (p.y - box.min.y) / size.y;
    const band = THREE.MathUtils.clamp(Math.floor(t * bands), 0, bands - 1);
    maxima[band] = Math.max(maxima[band], Math.abs(p.x - centreX) / (size.x / 2));
  }

  // Empty bands inherit their neighbour so the profile never collapses to zero.
  for (let i = 1; i < bands; i += 1) if (maxima[i] === 0) maxima[i] = maxima[i - 1];
  for (let i = bands - 2; i >= 0; i -= 1) if (maxima[i] === 0) maxima[i] = maxima[i + 1];

  return maxima.map((r, i) => [Math.max(r, 0.02), i / (bands - 1)] as const);
}

/**
 * Prismatic slabs: wall panels, tables, wine racks, squared and rectangular stock.
 *
 * Orientation follows the smallest dimension -- a piece thinner in height lies
 * flat, a piece thinner in width stands up like a panel on a wall.
 */
export function createExtrudeMesh(
  item: InventoryItemData,
  profile: OutlineProfile,
  outline?: THREE.Vector2[],
): THREE.Mesh {
  const { length, width, height } = dimensionsOf(item);
  const points = outline?.length ? normalizeOutline(outline) : profile.points;
  if (!points.length) return createPlaceholderMesh(item);

  // Which column holds which axis is not consistent in the data -- a wall panel
  // records length=10 (its thickness) with width=60 and height=180, while a
  // canoe tray records width=100 as its LONG axis. So treat height as the only
  // reliable vertical and derive the rest from magnitude: the larger horizontal
  // is the span, the smaller is the thickness.
  const majorH = Math.max(length, width);
  const minorH = Math.min(length, width);

  const liesFlat = height <= minorH;
  const [spanX, spanY, depth] = liesFlat
    ? [majorH, minorH, height]   // lying down: footprint is both horizontals
    : [majorH, height, minorH];  // standing up: thickness is the small horizontal

  const shape = toShape(points, spanX, spanY);
  const bevel = Math.min(depth * 0.12, Math.min(spanX, spanY) * 0.02);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(depth - bevel * 2, depth * 0.5),
    bevelEnabled: bevel > 0.0005,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 12,
  });

  // Extrusion runs along +Z; lay it down so depth becomes height.
  if (liesFlat) geometry.rotateX(-Math.PI / 2);
  geometry.center();
  geometry.computeVertexNormals();

  return tagOnyx(new THREE.Mesh(geometry, onyxMaterialFor(item)));
}

/**
 * Trays and canoes: an open vessel with a recessed well.
 *
 * Built as a wall ring plus a floor slab rather than by subtracting one solid
 * from another -- three.js has no boolean operations, and `Shape.holes` cuts a
 * through-hole, not a recess. Two meshes give a real open well with no CSG
 * dependency.
 */
export function createTrayMesh(
  item: InventoryItemData,
  profile: OutlineProfile,
  outline?: THREE.Vector2[],
): THREE.Group {
  const { length, width, height } = dimensionsOf(item);
  const points = outline?.length ? normalizeOutline(outline) : profile.points;
  if (!points.length) return new THREE.Group().add(createPlaceholderMesh(item));

  const group = new THREE.Group();
  const recess = profile.recess ?? 0.55;
  const floorDepth = height * (1 - recess);

  // The canoe profile is a lens elongated along X, so the long axis has to be
  // the larger horizontal. JM-043 records width=100 as its long axis and
  // length=24 as its short one, which is the opposite of the column names.
  const spanX = Math.max(length, width);
  const spanY = Math.min(length, width);

  const outer = toShape(points, spanX, spanY);
  const innerPoints = insetPoints(points, 0.86);

  // Walls: full height, hollow through the middle.
  const wallShape = toShape(points, spanX, spanY);
  const hole = new THREE.Path();
  innerPoints.forEach(([x, y], i) => {
    const px = x * spanX;
    const py = y * spanY;
    if (i === 0) hole.moveTo(px, py);
    else hole.lineTo(px, py);
  });
  hole.closePath();
  wallShape.holes.push(hole);

  const walls = new THREE.ExtrudeGeometry(wallShape, {
    depth: height,
    bevelEnabled: true,
    bevelThickness: height * 0.06,
    bevelSize: spanY * 0.01,
    bevelSegments: 2,
    curveSegments: 12,
  });
  walls.rotateX(-Math.PI / 2);
  walls.computeVertexNormals();
  group.add(tagOnyx(new THREE.Mesh(walls, onyxMaterialFor(item, true))));

  // Floor: a shallow slab filling the base.
  const floor = new THREE.ExtrudeGeometry(outer, {
    depth: floorDepth,
    bevelEnabled: false,
    curveSegments: 12,
  });
  floor.rotateX(-Math.PI / 2);
  floor.computeVertexNormals();
  group.add(tagOnyx(new THREE.Mesh(floor, onyxMaterialFor(item))));

  groundAndCentre(group);
  return group;
}

/**
 * Mirrors: a beveled stone frame around a reflective face.
 *
 * The face is the one surface in the catalogue that is not stone, so it gets
 * polished metal instead of the onyx material and is deliberately NOT tagged
 * `onyxSurface` -- mapping the item's texture onto it would stop it reflecting.
 */
export function createMirrorMesh(
  item: InventoryItemData,
  profile: OutlineProfile,
  outline?: THREE.Vector2[],
): THREE.Group {
  const { length, width, height } = dimensionsOf(item);
  const points = outline?.length ? normalizeOutline(outline) : profile.points;
  if (!points.length) return new THREE.Group().add(createPlaceholderMesh(item));

  // A mirror hangs on a wall, so height is the vertical span and the thickness
  // is whichever horizontal is smaller. EM-005 records length=10 (the
  // thickness) with width=100 and height=100: taking length as a face span
  // would build a 10cm-wide, 1m-tall slot instead of a 1m disc.
  const spanX = Math.max(length, width);
  const spanY = height;
  const depth = Math.min(length, width);

  const group = new THREE.Group();
  const innerPoints = insetPoints(points, 0.74);

  const frameShape = toShape(points, spanX, spanY);
  const hole = new THREE.Path();
  innerPoints.forEach(([x, y], i) => {
    const px = x * spanX;
    const py = y * spanY;
    if (i === 0) hole.moveTo(px, py);
    else hole.lineTo(px, py);
  });
  hole.closePath();
  frameShape.holes.push(hole);

  const frame = new THREE.ExtrudeGeometry(frameShape, {
    depth,
    bevelEnabled: true,
    bevelThickness: depth * 0.25,
    bevelSize: Math.min(spanX, spanY) * 0.015,
    bevelSegments: 3,
    curveSegments: 16,
  });
  frame.center();
  frame.computeVertexNormals();
  group.add(tagOnyx(new THREE.Mesh(frame, onyxMaterialFor(item))));

  const glass = new THREE.Mesh(
    new THREE.ShapeGeometry(toShape(innerPoints, spanX, spanY), 16),
    createMirrorGlassMaterial(),
  );
  glass.position.z = depth * 0.2;
  glass.receiveShadow = true;
  group.add(glass);

  groundAndCentre(group);
  return group;
}

/** Last resort: the original grey box, for the 15 items with no usable signal. */
export function createPlaceholderMesh(item: InventoryItemData): THREE.Mesh {
  const { length, width, height } = dimensionsOf(item);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(length, height, width),
    new THREE.MeshPhysicalMaterial({
      color: 0x808080,
      roughness: 0.4,
      metalness: 0.2,
      transparent: true,
      opacity: 0.9,
      transmission: 0.2,
    }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export interface BuiltMesh {
  object: THREE.Mesh | THREE.Group;
  strategy: GeometryStrategy;
  /** How the geometry was derived, for the UI badge and for honest labelling. */
  source: 'parametric' | 'silhouette' | 'placeholder';
}

/**
 * Async from the outset: Phases 2-4 add mask fetching, hull carving and GLB
 * loading here, none of which are synchronous. Keeping the signature stable now
 * means the call site in ThreeDView.tsx does not change again.
 */
export async function buildMeshForItem(
  item: InventoryItemData,
  outline?: THREE.Vector2[],
): Promise<BuiltMesh> {
  const strategy = resolveGeometryStrategy(item);
  const profile: Profile | null = profileFor(item);

  if (strategy === 'placeholder' || !profile) {
    return { object: createPlaceholderMesh(item), strategy, source: 'placeholder' };
  }

  const source = outline?.length ? 'silhouette' : 'parametric';

  if (profile.kind === 'lathe') {
    return { object: createLatheMesh(item, profile, outline), strategy, source };
  }

  switch (strategy) {
    case 'tray':
      return { object: createTrayMesh(item, profile, outline), strategy, source };
    case 'mirror':
      return { object: createMirrorMesh(item, profile, outline), strategy, source };
    default:
      return { object: createExtrudeMesh(item, profile, outline), strategy, source };
  }
}

/**
 * Dispose a mesh or a group.
 *
 * The previous disposal path assumed a single `Mesh` with one geometry and one
 * material. Groups (trays, mirrors, and later GLB and hull results) would have
 * leaked their children's GPU buffers on every item switch.
 */
export function disposeObject(object: THREE.Object3D): void {
  object.traverse(child => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;

    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!material) continue;
      const m = material as THREE.MeshPhysicalMaterial;
      m.map?.dispose();
      m.emissiveMap?.dispose();
      m.dispose();
    }
  });
}
