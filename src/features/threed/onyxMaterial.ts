/**
 * The canonical Mexican Onyx material, in one place.
 *
 * Every parameter here comes from `AR/Onyx_PBR_Specification.md`. Before this
 * module the values were inlined in ThreeDView.tsx and only ever applied to the
 * one shape that had a generator, so a second generator would have meant a
 * second copy of the numbers.
 *
 * The thing that makes onyx read as onyx rather than as tinted plastic is
 * volumetric transmission: light enters the surface, travels through the stone
 * picking up the warm attenuation tint, and leaves somewhere else. That needs
 * `transmission` AND `thickness` AND `attenuationColor` together -- transmission
 * alone just makes it transparent.
 */
import * as THREE from 'three';

/** Straight from the PBR spec table. Exported so the GLB bake can match it. */
export const ONYX_PBR = {
  ior: 1.5,
  roughness: 0.15,
  metalness: 0.0,
  specularIntensity: 1.0,
  transmission: 0.75,
  attenuationColor: '#fff4d6',
  attenuationDistance: 0.5,
  emissiveColor: '#ffaa55',
  emissiveIntensity: 2.5,
} as const;

export interface OnyxMaterialOptions {
  /** Base colour when no texture is applied. */
  color?: THREE.ColorRepresentation;
  /**
   * Virtual light path length through the stone, in metres. Derived from the
   * item's smallest real dimension by `thicknessForItem` -- a 4cm bowl wall and
   * a 40cm slab attenuate very differently, and a fixed value makes one of them
   * look wrong.
   */
  thickness?: number;
  /** Lathe interiors and open shades are seen from both sides. */
  doubleSided?: boolean;
  wireframe?: boolean;
}

/**
 * Smallest real dimension, in metres, as the light path length.
 *
 * Clamped at both ends: below ~8mm transmission goes to pure glass and the
 * stone reads as acrylic; above ~30cm the attenuation swallows all the light
 * and the piece goes black.
 */
export function thicknessForItem(item: {
  heightCm?: string;
  widthCm?: string;
  lengthCm?: string;
}): number {
  const dims = [item.heightCm, item.widthCm, item.lengthCm]
    .map(v => parseFloat(v || ''))
    .filter(v => Number.isFinite(v) && v > 0);

  if (!dims.length) return 1.5;
  return THREE.MathUtils.clamp(Math.min(...dims) / 100, 0.008, 0.3);
}

export function createOnyxMaterial(options: OnyxMaterialOptions = {}): THREE.MeshPhysicalMaterial {
  const {
    color = 0xffffff,
    thickness = 1.5,
    doubleSided = false,
    wireframe = false,
  } = options;

  return new THREE.MeshPhysicalMaterial({
    color,
    ior: ONYX_PBR.ior,
    roughness: ONYX_PBR.roughness,
    metalness: ONYX_PBR.metalness,
    specularIntensity: ONYX_PBR.specularIntensity,
    transmission: ONYX_PBR.transmission,
    thickness,
    attenuationColor: new THREE.Color(ONYX_PBR.attenuationColor),
    attenuationDistance: ONYX_PBR.attenuationDistance,
    side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    transparent: true,
    wireframe,
  });
}

/** Polished metal for a mirror's reflective face. Not stone -- no transmission. */
export function createMirrorGlassMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: 0xf2f4f6,
    metalness: 1.0,
    roughness: 0.05,
    envMapIntensity: 1.4,
  });
}

/**
 * Apply an extracted texture to an onyx material, or fall back to a flat colour.
 *
 * Tinting a textured surface double-darkens it, so `color` goes white whenever a
 * map is present and only carries the item colour when there is no map.
 */
export function applyTexture(
  material: THREE.MeshPhysicalMaterial,
  texture: THREE.Texture | null,
  fallbackColor?: string,
): void {
  if (material.map && material.map !== texture) material.map.dispose();

  if (texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    material.map = texture;
    material.color.set(0xffffff);
  } else {
    material.map = null;
    material.color.set(new THREE.Color(fallbackColor || 0xffffff));
  }

  material.needsUpdate = true;
}

/**
 * The internal glow.
 *
 * Previously this keyed off `itemData.usdzUrl` -- a stand-in the old code
 * admitted to in a comment -- so an item glowed because someone had uploaded an
 * AR file, which has nothing to do with whether an emissive map exists. It now
 * takes the map explicitly.
 *
 * Per the PBR spec the map is an INVERTED grayscale albedo, so the thin
 * translucent veins (dark in albedo) are the parts that light up.
 */
export async function applyEmissiveMap(
  material: THREE.MeshPhysicalMaterial,
  emissiveUrl: string,
): Promise<void> {
  const texture = await new Promise<THREE.Texture | null>(resolve => {
    new THREE.TextureLoader().load(emissiveUrl, resolve, undefined, () => resolve(null));
  });

  if (!texture) return;

  texture.colorSpace = THREE.SRGBColorSpace;
  if (material.emissiveMap) material.emissiveMap.dispose();
  material.emissiveMap = texture;
  material.emissive.set(ONYX_PBR.emissiveColor);
  material.emissiveIntensity = ONYX_PBR.emissiveIntensity;
  material.needsUpdate = true;
}

/**
 * Render a CSS gradient string into a texture.
 *
 * Moved verbatim from ThreeDView.tsx (L46-89) apart from the error handling:
 * the old version threw when the canvas had no 2D context, which killed the
 * whole render for a cosmetic fallback. It now returns null and the caller
 * falls back to a flat colour.
 */
export function createGradientTexture(cssGradient: string): THREE.CanvasTexture | null {
  const canvas = document.createElement('canvas');
  const width = 512;
  const height = 512;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const match = cssGradient.match(/(linear|radial)-gradient\(([^)]+)\)/);

  if (!match) {
    ctx.fillStyle = cssGradient.match(/#[0-9a-f]{6}/i)?.[0] || '#ffffff';
    ctx.fillRect(0, 0, width, height);
  } else {
    const [, type, argsStr] = match;
    const colorStops = argsStr.match(/#[0-9a-f]{6}/gi) || [];

    let gradient: CanvasGradient;
    if (type === 'linear') {
      const angleMatch = argsStr.match(/(\d+)deg/);
      const angle = angleMatch ? (parseInt(angleMatch[1], 10) * Math.PI) / 180 : Math.PI / 2;
      gradient = ctx.createLinearGradient(
        width * 0.5 * (1 - Math.cos(angle)),
        height * 0.5 * (1 - Math.sin(angle)),
        width * 0.5 * (1 + Math.cos(angle)),
        height * 0.5 * (1 + Math.sin(angle)),
      );
    } else {
      gradient = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width / 2);
    }

    // A single-stop gradient divides by zero on `index / (length - 1)`.
    if (colorStops.length === 1) {
      ctx.fillStyle = colorStops[0];
      ctx.fillRect(0, 0, width, height);
    } else if (colorStops.length > 1) {
      colorStops.forEach((color, index) => {
        gradient.addColorStop(index / (colorStops.length - 1), color);
      });
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
