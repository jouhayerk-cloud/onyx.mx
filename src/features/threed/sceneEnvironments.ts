/**
 * Selectable HDRI environments for the Showroom.
 *
 * Replaces the single hardcoded `belfast_sunset_puresky_4k.hdr` load in
 * ThreeDView.tsx. Environment choice matters more for onyx than for most
 * materials: with `transmission` at 0.75 the stone is lit almost entirely by
 * what surrounds it, so the same piece reads completely differently under a
 * sunset sky and in a neutral studio. A dark environment is the only way to see
 * the internal glow at all.
 */
import * as THREE from 'three';
import type { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

export interface SceneEnvironment {
  id: string;
  /** English label; `tr()` resolves the Spanish at render time. */
  label: string;
  /** Null renders a flat background instead of an HDRI. */
  hdriUrl: string | null;
  backgroundColor?: string;
  /** Multiplier applied to every onyx material's `envMapIntensity`. */
  intensity: number;
}

const POLYHAVEN = 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/4k';

export const SCENE_ENVIRONMENTS: readonly SceneEnvironment[] = [
  {
    id: 'sunset',
    label: 'Outdoor Sunset',
    hdriUrl: `${POLYHAVEN}/belfast_sunset_puresky_4k.hdr`,
    intensity: 1.2,
  },
  {
    id: 'studio',
    label: 'Studio',
    hdriUrl: `${POLYHAVEN}/studio_small_09_4k.hdr`,
    intensity: 1.0,
  },
  {
    id: 'gallery',
    label: 'Gallery',
    hdriUrl: `${POLYHAVEN}/museum_of_ethnography_4k.hdr`,
    intensity: 0.85,
  },
  {
    id: 'dark',
    label: 'Dark Void',
    hdriUrl: null,
    backgroundColor: '#0a0a0a',
    intensity: 0.3,
  },
];

/** The current default, matching the previous hardcoded behaviour. */
export const DEFAULT_SCENE_ID = 'sunset';

export function getSceneEnvironment(id: string): SceneEnvironment {
  return SCENE_ENVIRONMENTS.find(s => s.id === id) ?? SCENE_ENVIRONMENTS[0];
}

/**
 * Swap the scene's environment.
 *
 * Disposes the outgoing equirectangular texture -- a 4K HDRI is roughly 30MB of
 * GPU memory, so leaking one per switch would be felt quickly.
 *
 * Returns a promise so callers can sequence against the load, and so a rapid
 * series of switches can discard stale results rather than letting a slow load
 * overwrite a newer choice.
 */
export function loadSceneEnvironment(
  scene: THREE.Scene,
  environmentId: string,
  loader: RGBELoader,
): Promise<SceneEnvironment> {
  const environment = getSceneEnvironment(environmentId);

  const disposePrevious = () => {
    const previous = scene.environment;
    if (previous && previous !== scene.background) previous.dispose();
    if (scene.background instanceof THREE.Texture) scene.background.dispose();
  };

  if (!environment.hdriUrl) {
    disposePrevious();
    scene.environment = null;
    scene.background = new THREE.Color(environment.backgroundColor || '#0a0a0a');
    return Promise.resolve(environment);
  }

  return new Promise(resolve => {
    loader.load(
      environment.hdriUrl!,
      texture => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        disposePrevious();
        scene.background = texture;
        scene.environment = texture;
        resolve(environment);
      },
      undefined,
      () => {
        // A failed HDRI should not leave an empty void with no explanation of
        // scale; fall back to a neutral grey so the piece stays readable.
        scene.background = new THREE.Color('#1a1a1c');
        scene.environment = null;
        resolve(environment);
      },
    );
  });
}
