

import { useAtom, useAtomValue, useSetAtom } from 'jotai/react';
import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';

import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { is3DViewerOpenAtom, is3DWorkspaceDetailsOpenAtom, is3DWorkspaceInventoryOpenAtom, is3DWorkspaceOpenAtom, SelectedItemDataAtom, SelectedItemRowAtom, inventoryAtom, exchangeRateAtom } from '../../lib/atoms';
import { SCRIPT_URL } from '../../lib/consts';
import { InventoryItem, InventoryItemData, Crate, CameraView } from '../../lib/Types';
import { MarketInventoryView } from '../catalog/MarketInventoryView';
import { fetchImageBatch, imageCache } from '../../lib/utils';
import { tr } from '../../lib/i18n';
import { buildMeshForItem, createPlaceholderMesh, disposeObject, onyxSurfacesOf } from './meshGenerators';
import { applyTexture, createGradientTexture } from './onyxMaterial';
import { resolveGeometryStrategy, strategyLabel } from './geometryStrategy';
import {
  DEFAULT_SCENE_ID,
  SCENE_ENVIRONMENTS,
  getSceneEnvironment,
  loadSceneEnvironment,
} from './sceneEnvironments';

const loadDriveImageAsDataUrl = async (driveUrl: string): Promise<string | null> => {
    if (!driveUrl) return null;
    const match = driveUrl.match(/id=([\w-]+)/);
    const fileId = match ? match[1] : null;
    if (!fileId) return driveUrl;

    if (imageCache.has(fileId)) {
        return imageCache.get(fileId)!;
    }

    try {
        const data = await fetchImageBatch(fileId);
        const dataUrl = `data:${data.mimeType};base64,${data.base64}`;
        imageCache.set(fileId, dataUrl);
        return dataUrl;
    } catch (e) {
        console.error('Failed to load Drive image:', driveUrl, e);
        return null;
    }
};

const ItemImage = ({ imageUrl }: { imageUrl: string | null }) => {
    const [dataUrl, setDataUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!imageUrl) {
            setIsLoading(false);
            setDataUrl(null);
            return;
        }
        let isActive = true;
        setIsLoading(true);
        loadDriveImageAsDataUrl(imageUrl).then(url => {
            if (isActive && url) {
                setDataUrl(url);
            }
            setIsLoading(false);
        });
        return () => { isActive = false; };
    }, [imageUrl]);

    if (!imageUrl) {
        return null;
    }

    if (isLoading) {
        return (
            <div className="threed-well threed-well--square">
                <p className="threed-well-note">{tr("Loading Image...")}</p>
            </div>
        );
    }

    if (!dataUrl) {
        return (
            <div className="threed-well threed-well--square">
                <p className="threed-well-note is-error">{tr("Failed to load image")}</p>
            </div>
        );
    }

    return (
        <div className="threed-well">
            <img loading="lazy" src={dataUrl} alt={tr("Item")} className="threed-detail-img" />
        </div>
    );
};

const DetailRow = ({ label, value }: { label: string, value: any }) => {
    if (!value) return null;
    return (
        <div className="threed-dl">
            <p className="threed-dl-k">{label}</p>
            <p className="threed-dl-v">{value}</p>
        </div>
    );
};

const ItemDetailsDisplay = () => {
    const itemData = useAtomValue(SelectedItemDataAtom);

    if (!itemData) {
        return (
            <div className="threed-detail">
                <div className="threed-detail-body">
                    <div className="threed-empty">
                        <span className="threed-empty-head">{tr("No item selected.")}</span>
                        <span className="threed-empty-sub">
                            {tr("Open the inventory panel and pick a piece to see its record here.")}
                        </span>
                    </div>
                </div>
            </div>
        );
    }
    const dimensions = [itemData.widthCm, itemData.heightCm, itemData.lengthCm].filter(Boolean).join(' x ');

    return (
        <div className="threed-detail">
            <div className="threed-detail-head">
                 <h2 className="threed-detail-title">{itemData.shape || tr("Item Details")}</h2>
                 <p className="threed-detail-sub">{itemData.material}</p>
            </div>
            <div className="threed-detail-body">
                <ItemImage imageUrl={itemData.generatedPngUrl || null} />
                <DetailRow label={tr("Vendor ID")} value={itemData.itemId} />
                <DetailRow label={tr("Item #")} value={itemData.itemNumber} />
                <DetailRow label={tr("Description")} value={itemData.description} />
                <DetailRow label={tr("Short Description")} value={itemData.shortDescription} />
                <DetailRow label={tr("Dimensions")} value={dimensions ? `${dimensions} cm` : null} />
                <DetailRow label={tr("Weight")} value={itemData.weightKg ? `${itemData.weightKg} kg` : null} />
                <DetailRow label={tr("Price")} value={itemData.price ? `$${itemData.price} MXN` : null} />
                <DetailRow label={tr("Quantity")} value={itemData.quantity} />
                {itemData.color && <div className="threed-swatch-row">
                     <p className="threed-dl-k">{tr("Color")}</p>
                     {/* Material colour is a printed physical standard — rule 3
                         keeps it exactly as the row records it. */}
                     <div className="threed-swatch" style={{background: itemData.color}}></div>
                </div>}
            </div>
        </div>
    );
};

export const ThreeDCanvas: React.FC<{
  cameraYOffset?: number;
  sceneId?: string;
  wireframe?: boolean;
}> = ({ cameraYOffset = 0, sceneId = DEFAULT_SCENE_ID, wireframe = false }) => {
  const itemData = useAtomValue(SelectedItemDataAtom);
  const mountRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const baseCameraPosRef = useRef<THREE.Vector3 | null>(null);

  useEffect(() => {
    if (cameraRef.current && baseCameraPosRef.current) {
        cameraRef.current.position.y = baseCameraPosRef.current.y + cameraYOffset;
    }
  }, [cameraYOffset]);

  useEffect(() => {
    if (!mountRef.current) return;

    const mount = mountRef.current;
    while(mount.firstChild) { mount.removeChild(mount.firstChild); }

    const scene = new THREE.Scene();
    const rgbeLoader = new RGBELoader();
    void loadSceneEnvironment(scene, sceneId, rgbeLoader);

    const camera = new THREE.PerspectiveCamera(50, mount.clientWidth / mount.clientHeight, 0.1, 100);
    cameraRef.current = camera;
    
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);
    
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = true;

    const hemiLight = new THREE.HemisphereLight(0x888899, 0x444455, 1.5);
    scene.add(hemiLight);
    const spotLight = new THREE.SpotLight(0xffffff, 4);
    spotLight.angle = Math.PI / 6;
    spotLight.penumbra = 1;
    spotLight.decay = 2;
    spotLight.distance = 50;
    spotLight.castShadow = true;
    scene.add(spotLight);

    let animationFrameId: number;
    let currentObject: THREE.Object3D | null = null;

    const updateScene = async () => {
        if (currentObject) {
            scene.remove(currentObject);
            disposeObject(currentObject);
            currentObject = null;
        }

        const existingMessage = mount.querySelector('.threed-message');
        if (existingMessage) mount.removeChild(existingMessage);

        // Positioning and ground live in styles/threed.css. This used to be
        // `absolute inset-0` bare text sitting straight on a 4K sunset HDRI,
        // with nothing behind it to read against.
        const messageDiv = document.createElement('div');
        messageDiv.className = 'threed-message';
        mount.appendChild(messageDiv);

        try {
            // Geometry now comes from the item's type and dimensions, so an item
            // no longer needs mask data to render. That gate used to exclude
            // every item without a mask -- 388 of 497 rows -- and the ones it let
            // through still fell to a grey box unless their shape said "canoe",
            // which none of them do.
            if (itemData) {
                messageDiv.textContent = tr('Generating 3D model...');

                const built = await buildMeshForItem(itemData);
                currentObject = built.object;
                scene.add(currentObject);

                // `generatedPngUrl` is NOT a cutout. It points at the same Drive
                // file as spatial_masks.angle_0 on all 109 rows that have one,
                // and those files are AI background-REPLACEMENT renders from the
                // wizard's default 'bgreplace' (STUDIO) mode: full-frame RGB
                // JPEGs, no alpha, complete with the painted-in backdrop and
                // whatever neighbouring piece was in shot.
                //
                // Mapping that onto geometry wraps studio backdrop and stray
                // objects around the stone. The procedural gradient is a poorer
                // likeness but an honest one, and it never shows another item's
                // photograph on this item's surface.
                //
                // Restore texture mapping here once real segmented cutouts are
                // being persisted -- read from that column, not from this one.
                let texture: THREE.Texture | null = null;
                if (itemData.color && (itemData.color.includes('gradient') || itemData.color.includes('#'))) {
                    messageDiv.textContent = tr('Creating procedural texture...');
                    texture = createGradientTexture(itemData.color);
                }

                // A group (tray, mirror) has several stone surfaces; a lathe has
                // one. Both are handled the same way, and the mirror's glass is
                // deliberately skipped so it keeps reflecting.
                const surfaces = onyxSurfacesOf(currentObject);
                const envIntensity = getSceneEnvironment(sceneId).intensity;
                for (const surface of surfaces) {
                    const material = surface.material as THREE.MeshPhysicalMaterial;
                    applyTexture(material, texture, itemData.color);
                    material.envMapIntensity = envIntensity;
                    material.wireframe = wireframe;
                }

                const box = new THREE.Box3().setFromObject(currentObject);
                const size = box.getSize(new THREE.Vector3());
                const center = box.getCenter(new THREE.Vector3());
                
                const hoverHeight = 5 * 0.0254; // 5 inches in meters
                currentObject.position.y = hoverHeight - box.min.y;
                currentObject.position.x = -center.x;
                currentObject.position.z = -center.z;


                const maxDim = Math.max(size.x, size.y, size.z);
                const distance = 2.0 * (maxDim / (2 * Math.atan(Math.PI * camera.fov / 360)));
                const direction = new THREE.Vector3(0, 0.5, 1).normalize();
                
                camera.position.copy(center).add(direction.multiplyScalar(distance));
                camera.position.y += size.y / 2;
                baseCameraPosRef.current = camera.position.clone();
                controls.target.copy(center);
                
                messageDiv.style.display = 'none';

            } else {
                 messageDiv.textContent = tr('Select an item from the inventory to view it in 3D.');
            }
        } catch (error) {
            console.error('3D View Error:', error);
            messageDiv.textContent = `${tr('Error rendering 3D model:')} ${error instanceof Error ? error.message : String(error)}`;
            // text-red-400 is #f87171 — 2.1:1 on the light slab, and no better
            // over a bright sky. The error chip carries its own ground.
            messageDiv.className += ' is-error';
            if (itemData) {
                currentObject = createPlaceholderMesh(itemData);
                scene.add(currentObject);
            }
        }
    };

    updateScene();
    
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      spotLight.position.set(camera.position.x + 1, camera.position.y + 1, camera.position.z + 1);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    let timeoutId: number;
    const handleResize = () => {
        clearTimeout(timeoutId);
        timeoutId = window.setTimeout(() => {
        camera.aspect = mount.clientWidth / mount.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(mount.clientWidth, mount.clientHeight);
    }, 100) as unknown as number;
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
            clearTimeout(timeoutId);
      cancelAnimationFrame(animationFrameId);
      controls.dispose();
      disposeObject(scene);
      // A 4K HDRI is ~30MB on the GPU and is not owned by any mesh, so
      // disposeObject's traverse does not reach it.
      if (scene.environment) scene.environment.dispose();
      if (scene.background instanceof THREE.Texture) scene.background.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [itemData, sceneId, wireframe]);

  return <div ref={mountRef} className="threed-canvas-mount" />;
}

export function ThreeDViewer() {
  const [isOpen, setIsOpen] = useAtom(is3DViewerOpenAtom);
  const [cameraYOffset, setCameraYOffset] = useState(0);
  const itemData = useAtomValue(SelectedItemDataAtom);
  
  if (!isOpen) return null;

  return (
    <div className="threed-scrim fixed inset-0 z-50 flex flex-col items-center justify-center">
      <button onClick={() => setIsOpen(false)} className="absolute top-4 right-4 text-white text-3xl z-20">&times;</button>
      
      <div className="absolute top-4 left-1/2 -translate-x-1/2 glass-panel p-2 px-4 w-full max-w-sm z-10">
        <div className="flex items-center gap-3">
            <label htmlFor="height-slider" className="text-sm font-semibold">{tr("Camera Height")}</label>
            <input 
                id="height-slider"
                type="range" 
                min="-2" 
                max="2" 
                step="0.1" 
                value={cameraYOffset} 
                onChange={(e) => setCameraYOffset(parseFloat(e.target.value))}
                className="w-full"
            />
             <span className="text-sm font-mono w-16 text-center">{cameraYOffset.toFixed(2)}</span>
        </div>
      </div>
      
      <div className="w-full h-full relative">
        <ThreeDCanvas cameraYOffset={cameraYOffset} />
      </div>

      {itemData?.usdzUrl && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50">
           <a 
             rel="ar" 
             href={itemData.usdzUrl}
             className="button bg-indigo-600! hover:bg-indigo-500! p-4! px-8! flex items-center gap-3 shadow-2xl animate-pulse"
           >
             <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
               <path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.8L19.4 8 12 11.2 4.6 8 12 4.8zM4 15.2V9.3L11 12.8v5.9L4 15.2zm16 0L13 18.7v-5.9l7-3.5v5.9z"/>
             </svg>
             <span className="font-bold uppercase tracking-widest">{tr("View in Room (AR)")}</span>
           </a>
        </div>
      )}
    </div>
  );
}

export function ThreeDWorkspace() {
    const setIsOpen = useSetAtom(is3DWorkspaceOpenAtom);
    const [isInventoryOpen, setIsInventoryOpen] = useAtom(is3DWorkspaceInventoryOpenAtom);
    const [isDetailsOpen, setIsDetailsOpen] = useAtom(is3DWorkspaceDetailsOpenAtom);
    const [cameraYOffset, setCameraYOffset] = useState(0);
    const itemData = useAtomValue(SelectedItemDataAtom);
    
    const handleItemSelect = (item: InventoryItem, dataUrl: string) => {
        setIsInventoryOpen(false);
    };

    return (
        <div className="threed-scrim threed-scrim--deep fixed inset-0 z-40">
            {/* 3D Canvas Area - takes full space */}
            <div className="w-full h-full relative">
                <ThreeDCanvas cameraYOffset={cameraYOffset} />
                
                {itemData?.usdzUrl && (
                    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50">
                        <a 
                            rel="ar" 
                            href={itemData.usdzUrl}
                            className="button bg-indigo-600! hover:bg-indigo-500! p-4! px-8! flex items-center gap-3 shadow-2xl animate-pulse"
                        >
                            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.8L19.4 8 12 11.2 4.6 8 12 4.8zM4 15.2V9.3L11 12.8v5.9L4 15.2zm16 0L13 18.7v-5.9l7-3.5v5.9z"/>
                            </svg>
                            <span className="font-bold uppercase tracking-widest text-white">{tr("View in Room (AR)")}</span>
                        </a>
                    </div>
                )}
            </div>

            {/* Inventory Panel - Absolute positioned overlay */}
            <div className={`absolute top-0 left-0 h-full transition-transform duration-300 ease-in-out ${isInventoryOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="w-[280px] h-full">
                    <MarketInventoryView onItemSelect={handleItemSelect} />
                </div>
            </div>

            {/* Details Panel - Absolute positioned overlay */}
            <div className={`absolute top-0 right-0 h-full transition-transform duration-300 ease-in-out ${isDetailsOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                <div className="w-[420px] h-full glass-panel">
                    <ItemDetailsDisplay />
                </div>
            </div>

            {/* Top-Center Controls: Camera Height */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 glass-panel p-2 px-4 w-full max-w-sm z-50">
                <div className="flex items-center gap-3">
                    <label htmlFor="height-slider" className="text-sm font-semibold">{tr("Camera Height")}</label>
                    <input 
                        id="height-slider"
                        type="range" 
                        min="-2" 
                        max="2" 
                        step="0.1" 
                        value={cameraYOffset} 
                        onChange={(e) => setCameraYOffset(parseFloat(e.target.value))}
                        className="w-full"
                    />
                    <span className="text-sm font-mono w-16 text-center">{cameraYOffset.toFixed(2)}</span>
                </div>
            </div>
            
            {/* Top-Left Controls: Inventory Toggle */}
            <div className="absolute top-4 left-4 z-50">
                 <button
                    onClick={() => setIsInventoryOpen(!isInventoryOpen)}
                    className="button p-2.5! min-h-0!"
                    title={isInventoryOpen ? 'Hide Inventory' : 'Show Inventory'}
                >
                    <svg className="w-5 h-5 transform -scale-x-100"><use href="#layout-sidebar-right"></use></svg>
                </button>
            </div>

            {/* Top-Right Controls: Details Toggle & Close */}
            <div className="absolute top-4 right-4 flex gap-2 z-50">
                 <button
                    onClick={() => setIsDetailsOpen(!isDetailsOpen)}
                    className="button p-2.5! min-h-0!"
                    title={isDetailsOpen ? 'Hide Details' : 'Show Details'}
                >
                    <svg className="w-5 h-5"><use href="#layout-sidebar-right"></use></svg>
                </button>
                <button
                    onClick={() => setIsOpen(false)}
                    className="button p-2.5! min-h-0! bg-red-500/50! hover:bg-red-500!"
                    title={tr("Close Showroom")}
                >
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                       <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                   </svg>
                </button>
            </div>
        </div>
    );
}

function ThreeDCatalogGrid({ onSelect }: { onSelect: (item: InventoryItem) => void }) {
    const inventory = useAtomValue(inventoryAtom);
    const exchangeRate = useAtomValue(exchangeRateAtom);
    
    // An item is renderable when we can build geometry for it, which no longer
    // requires mask data: type plus dimensions is enough. The old filter
    // demanded a mask, a PNG or an AR file, which excluded items that now
    // render perfectly well -- and admitted the 336 whose `spatial_masks` is an
    // empty `{}` on the strength of a column that holds nothing.
    const validItems = inventory.filter(item => {
        const d = item.data;
        const s = (d.status || '').toUpperCase();
        // 'ACQUIRED' is a real status elsewhere in the app, but it is not what
        // the acquisition stock actually carries: 467 of the 497 rows are
        // 'Acquisition'. Matching only AVAILABLE/ACQUIRED left this catalogue
        // showing 14 items at best. AcquisitionsView sets the precedent for
        // treating the acquisition spellings as one state.
        const isStatusValid = s === 'AVAILABLE' || s === 'ACQUIRED'
            || s === 'ACQUISITION' || s === 'ACQUISITIONS';
        const isRenderable = d.usdzUrl || d.glbUrl || d.generatedPngUrl
            || resolveGeometryStrategy(d) !== 'placeholder';
        return isStatusValid && isRenderable;
    });

    return (
        <div className="threed-catalog">
            <div className="threed-catalog-head">
                <h1 className="threed-title">{tr("3D & AR Artifact Catalog")}</h1>
                <p className="threed-count">
                    {validItems.length} {validItems.length === 1 ? tr("piece") : tr("pieces")}
                </p>
            </div>
            {validItems.length === 0 ? (
                <div className="threed-empty">
                    <span className="threed-empty-head">{tr("No 3D Models Configured")}</span>
                    <span className="threed-empty-sub">
                        {tr("A piece appears here once it has a type or dimensions to build geometry from, or a captured model file.")}
                    </span>
                </div>
            ) : (
                <div className="threed-grid">
                    {validItems.map((item) => {
                        const strategy = resolveGeometryStrategy(item.data);
                        const hasCapture = Boolean(item.data.usdzUrl || item.data.glbUrl);
                        return (
                            <button
                                key={item.id || item.row}
                                type="button"
                                onClick={() => onSelect(item)}
                                className="threed-card"
                            >
                                <span className="threed-card-well">
                                    {item.data.generatedPngUrl ? (
                                        <img loading="lazy" src={item.data.generatedPngUrl} className="threed-card-img" alt={item.data.shape} />
                                    ) : (
                                        <span className="threed-card-noimg">{tr("No photo")}</span>
                                    )}
                                    {/* Both badges are DATA: how the mesh gets
                                        built, and whether a captured file
                                        exists. Rule 3 — the colour rides on the
                                        slab and is the same in every theme. */}
                                    <span className="threed-badges">
                                        <span className="threed-badge" data-geo={strategy}>
                                            {tr(strategyLabel(strategy))}
                                        </span>
                                        {hasCapture && (
                                            <span className="threed-badge threed-badge--ar">
                                                {tr("AR Ready")}
                                            </span>
                                        )}
                                    </span>
                                </span>
                                <span className="threed-card-foot">
                                    <span className="threed-card-idwrap">
                                        <b className="threed-card-name">{item.data.shape}</b>
                                        <span className="threed-card-id">{item.data.itemId}</span>
                                    </span>
                                    {item.data.price && (
                                        <span className="threed-card-price">
                                            ${(parseFloat(String(item.data.price)) / exchangeRate).toFixed(2)}
                                        </span>
                                    )}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

/** The AR cube, drawn once for both states of the entry point below. */
const ArGlyph = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.8L19.4 8 12 11.2 4.6 8 12 4.8zM4 15.2V9.3L11 12.8v5.9L4 15.2zm16 0L13 18.7v-5.9l7-3.5v5.9z"/>
    </svg>
);

/**
 * The AR / usdz entry point.
 *
 * `usdzUrl` is empty on the large majority of the catalogue -- the GLB/usdz
 * pipeline is not built yet -- and the previous markup rendered NOTHING when
 * it was missing, so the one control that answers "can I put this in my room?"
 * was simply absent, with no way to tell "no file" from "button broken".
 *
 * There are two labelled states now: an action when a captured file exists,
 * and a readout when it does not, naming what is on screen instead (a mesh
 * generated from the piece's type and dimensions, with the same strategy badge
 * the catalogue card carries).
 */
const ArEntry = ({ itemData }: { itemData: InventoryItemData | null }) => {
    if (itemData?.usdzUrl) {
        return (
            <a rel="ar" href={itemData.usdzUrl} className="threed-ar">
                <ArGlyph className="threed-ar-icon" />
                <span className="threed-ar-head">{tr("View in Room (AR)")}</span>
            </a>
        );
    }

    if (!itemData) {
        return (
            <div className="threed-ar threed-ar--empty">
                <ArGlyph className="threed-ar-icon" />
                <span className="threed-ar-lines">
                    <span className="threed-ar-head">{tr("Nothing on stage")}</span>
                    <span className="threed-ar-sub">
                        {tr("Pick a piece from the inventory panel to place it in the showroom.")}
                    </span>
                </span>
            </div>
        );
    }

    const strategy = resolveGeometryStrategy(itemData);

    return (
        <div className="threed-ar threed-ar--empty">
            <ArGlyph className="threed-ar-icon" />
            <span className="threed-ar-lines">
                <span className="threed-ar-head">{tr("No AR model yet")}</span>
                <span className="threed-ar-sub">
                    {tr("This piece has no captured .usdz file, so it cannot be placed in a room. What you are seeing is a mesh generated from its type and dimensions.")}
                </span>
            </span>
            <span className="threed-badge" data-geo={strategy}>
                {tr(strategyLabel(strategy))}
            </span>
        </div>
    );
};

export function ThreeDAppView() {
    const [isInventoryOpen, setIsInventoryOpen] = useAtom(is3DWorkspaceInventoryOpenAtom);
    const [isDetailsOpen, setIsDetailsOpen] = useAtom(is3DWorkspaceDetailsOpenAtom);
    const [cameraYOffset, setCameraYOffset] = useState(0);
    const itemData = useAtomValue(SelectedItemDataAtom);

    const [sceneId, setSceneId] = useState(DEFAULT_SCENE_ID);
    const [wireframe, setWireframe] = useState(false);

    const [activeTab, setActiveTab] = useState<'catalog' | 'showroom'>('catalog');
    const setItemRow = useSetAtom(SelectedItemRowAtom);
    const setItemData = useSetAtom(SelectedItemDataAtom);

    // Auto-open inventory if nothing is selected
    useEffect(() => {
         if (!itemData && activeTab === 'showroom') setIsInventoryOpen(true);
    }, [itemData, setIsInventoryOpen, activeTab]);

    const handleItemSelect = (item: InventoryItem, dataUrl?: string) => {
        setIsInventoryOpen(false);
    };

    const handleCatalogSelect = (item: InventoryItem) => {
        setItemRow(item.row);
        setItemData(item.data);
        setActiveTab('showroom');
    };

    return (
        <div id="threed" className="threed-root">
            {/* ── Tabs ────────────────────────────────────────────────────
                aria-pressed, not a colour class: it is what makes the engaged
                tab carve INTO the slab and take the ON tint, and it is also
                what a screen reader reads. The label stays --slab-ink — on
                Aqua the accent is 1.7:1 against its own ON fill. */}
            <div className="threed-tabs">
                <button
                    type="button"
                    onClick={() => setActiveTab('catalog')}
                    className="threed-tab"
                    aria-pressed={activeTab === 'catalog'}
                >
                    {tr("3D Catalog")}
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('showroom')}
                    className="threed-tab"
                    aria-pressed={activeTab === 'showroom'}
                >
                    {tr("Showroom")}
                </button>
            </div>

            {/* Active View Router */}
            {activeTab === 'catalog' ? (
                <ThreeDCatalogGrid onSelect={handleCatalogSelect} />
            ) : (
                <div className="threed-showroom">
                    {/* The viewport is a canvas, so it takes no relief at all.
                        The stage around it is the well that holds it. */}
                    <div className="threed-stage">
                        <ThreeDCanvas cameraYOffset={cameraYOffset} sceneId={sceneId} wireframe={wireframe} />
                    </div>

                    {/* Inventory panel */}
                    <div className={`threed-panel threed-panel--left ${isInventoryOpen ? '' : 'is-closed'}`}>
                        <div className="threed-panel-inner">
                            <MarketInventoryView onItemSelect={handleItemSelect} />
                        </div>
                    </div>

                    {/* Details panel */}
                    <div className={`threed-panel threed-panel--right ${isDetailsOpen ? '' : 'is-closed'}`}>
                        <div className="threed-panel-inner glass-panel">
                            <ItemDetailsDisplay />
                        </div>
                    </div>

                    {/* Camera height. The figure is a readout: pressed, mono,
                        tabular, and no hover — an instrument, not a control. */}
                    <div className="threed-hud threed-hud--top">
                        <label htmlFor="app-height-slider" className="threed-hud-label">{tr("Camera Height")}</label>
                        <input
                            id="app-height-slider"
                            type="range"
                            min="-2"
                            max="2"
                            step="0.1"
                            value={cameraYOffset}
                            onChange={(e) => setCameraYOffset(parseFloat(e.target.value))}
                            className="threed-slider"
                        />
                        <span className="threed-readout">{cameraYOffset.toFixed(2)}</span>
                    </div>

                    <button
                        type="button"
                        onClick={() => setIsInventoryOpen(!isInventoryOpen)}
                        className="threed-key threed-key--inventory"
                        aria-pressed={isInventoryOpen}
                        title={isInventoryOpen ? tr('Hide Inventory') : tr('Show Inventory')}
                    >
                        <svg className="transform -scale-x-100"><use href="#layout-sidebar-right"></use></svg>
                    </button>

                    <button
                        type="button"
                        onClick={() => setIsDetailsOpen(!isDetailsOpen)}
                        className="threed-key threed-key--details"
                        aria-pressed={isDetailsOpen}
                        title={isDetailsOpen ? tr('Hide Details') : tr('Show Details')}
                    >
                        <svg><use href="#layout-sidebar-right"></use></svg>
                    </button>

                    {/* Scene environment and mesh inspection. Onyx is lit
                        almost entirely by its surroundings at transmission
                        0.75, so the environment is a material control, not
                        decoration -- the dark scene is the only one that shows
                        the internal glow. */}
                    <div className="threed-dock threed-dock--left">
                        <div className="threed-field">
                            <label htmlFor="scene-picker" className="threed-field-label">
                                {tr("Scene")}
                            </label>
                            <select
                                id="scene-picker"
                                value={sceneId}
                                onChange={(e) => setSceneId(e.target.value)}
                                className="threed-select"
                            >
                                {SCENE_ENVIRONMENTS.map(env => (
                                    <option key={env.id} value={env.id}>
                                        {tr(env.label)}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <button
                            type="button"
                            onClick={() => setWireframe(!wireframe)}
                            className="threed-toggle"
                            aria-pressed={wireframe}
                            title={tr("Toggle mesh wireframe")}
                        >
                            {wireframe ? tr("Wireframe") : tr("Realistic")}
                        </button>
                    </div>

                    <div className="threed-ar-dock">
                        <ArEntry itemData={itemData} />
                    </div>
                </div>
            )}
        </div>
    );
}
