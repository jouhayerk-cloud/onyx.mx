/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */
// Copyright 2024 Google LLC

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at

//     https://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { useAtom, useAtomValue, useSetAtom } from 'jotai/react';
import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
// FIX: Added .js extension for Vite compatibility with Three.js examples.
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
// FIX: Added .js extension for Vite compatibility with Three.js examples.
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
// FIX: Added .js extension for Vite compatibility with Three.js examples.
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { is3DViewerOpenAtom, is3DWorkspaceDetailsOpenAtom, is3DWorkspaceInventoryOpenAtom, is3DWorkspaceOpenAtom, SelectedItemDataAtom } from '../../lib/atoms';
import { SCRIPT_URL } from '../../lib/consts';
import { InventoryItem, InventoryItemData, Crate, CameraView } from '../../lib/Types';
import { MarketInventoryView } from '../catalog/MarketInventoryView';
import { fetchImageBatch, imageCache } from '../../lib/utils';

// ============ HELPER FUNCTIONS (from ThreeDCanvas.tsx & ThreeDWorkspace.tsx) ============

const loadTextureAsync = (url: string): Promise<THREE.Texture> => {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(url, resolve, undefined, reject);
  });
};

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

const createGradientTexture = (cssGradient: string) => {
    const canvas = document.createElement('canvas');
    const width = 512;
    const height = 512;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D context for gradient texture.');

    const gradientRegex = /(linear|radial)-gradient\(([^)]+)\)/;
    const match = cssGradient.match(gradientRegex);

    if (!match) {
        ctx.fillStyle = cssGradient.match(/#[0-9a-f]{6}/i)?.[0] || '#ffffff';
        ctx.fillRect(0, 0, width, height);
    } else {
        const type = match[1];
        const argsStr = match[2];
        const colorStops = argsStr.match(/#[0-9a-f]{6}/gi) || [];
        
        let gradient;
        if (type === 'linear') {
            const angleMatch = argsStr.match(/(\d+)deg/);
            const angle = angleMatch ? parseInt(angleMatch[1], 10) * Math.PI / 180 : Math.PI / 2; // Default 90deg
            const x0 = width * 0.5 * (1 - Math.cos(angle));
            const y0 = height * 0.5 * (1 - Math.sin(angle));
            const x1 = width * 0.5 * (1 + Math.cos(angle));
            const y1 = height * 0.5 * (1 + Math.sin(angle));
            gradient = ctx.createLinearGradient(x0, y0, x1, y1);
        } else { // radial
            gradient = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, width/2);
        }

        colorStops.forEach((color, index) => {
            gradient.addColorStop(index / (colorStops.length - 1), color);
        });
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

const createCanoeMesh = (itemData: InventoryItemData): THREE.Mesh => {
    const { spatialMasks, widthCm = '1', lengthCm = '1', heightCm = '0.1' } = itemData;

    if (!spatialMasks) throw new Error("Missing mask data.");
    const masks = JSON.parse(spatialMasks);
    const mask = masks[0];
    if (!mask || !mask.points) throw new Error("No valid points found in mask data.");

    const rawPoints = mask.points.map((p: { x: number, y: number }) => new THREE.Vector2(p.x, p.y));

    if (THREE.ShapeUtils.isClockWise(rawPoints)) {
        rawPoints.reverse();
    }
    
    const cleanPoints: THREE.Vector2[] = [];
    const epsilon = 0.0001;
    for (let i = 0; i < rawPoints.length; i++) {
        const current = rawPoints[i];
        const next = rawPoints[(i + 1) % rawPoints.length];
        if (current.distanceTo(next) > epsilon) {
            cleanPoints.push(current);
        }
    }
    const finalPoints = cleanPoints.length > 10 ? cleanPoints : rawPoints;

    const bounds = new THREE.Box2().setFromPoints(finalPoints);
    const size = new THREE.Vector2();
    bounds.getSize(size);
    if (size.x === 0 || size.y === 0) throw new Error("SVG path has no area.");
    
    const targetLength = parseFloat(lengthCm) / 100;
    const targetWidth = parseFloat(widthCm) / 100;
    const targetHeight = parseFloat(heightCm) / 100 || 0.11;
    
    let scaleX: number, scaleY: number;
    if (size.x > size.y) {
        scaleX = targetLength / size.x;
        scaleY = targetWidth / size.y;
    } else {
        scaleX = targetWidth / size.x;
        scaleY = targetLength / size.y;
    }

    const outlinePoints = finalPoints.map(p => {
        const centeredX = p.x - bounds.min.x - size.x / 2;
        const centeredY = p.y - bounds.min.y - size.y / 2;
        return new THREE.Vector2(centeredX * scaleX, centeredY * scaleY);
    });
    
    const vertices: number[] = [];
    const indices: number[] = [];
    const uvs: number[] = [];
    const numPoints = outlinePoints.length;
    
    const wallThickness = 0.004;
    const verticalSegments = 60;
    
    const outlineNormals: THREE.Vector2[] = [];
    for (let i = 0; i < numPoints; i++) {
        const prev = outlinePoints[(i - 1 + numPoints) % numPoints];
        const current = outlinePoints[i];
        const next = outlinePoints[(i + 1) % numPoints];
        
        const tangent1 = new THREE.Vector2().subVectors(current, prev).normalize();
        const tangent2 = new THREE.Vector2().subVectors(next, current).normalize();
        const avgTangent = new THREE.Vector2().addVectors(tangent1, tangent2).normalize();
        
        const normal = new THREE.Vector2(-avgTangent.y, avgTangent.x);
        
        const center = new THREE.Vector2(0, 0);
        const toCenter = new THREE.Vector2().subVectors(center, current).normalize();
        if (normal.dot(toCenter) < 0) {
            normal.negate();
        }
        
        outlineNormals.push(normal);
    }

    for (let i = 0; i <= verticalSegments; i++) {
        const t = i / verticalSegments;
        
        const angle = t * Math.PI / 2;
        const depth_curve = Math.sin(angle);
        const z = -depth_curve * targetHeight;
        
        const taper_factor = Math.pow(1 - t, 0.3);
        const width_curve = Math.cos(angle * 1.2);
        const base_scale = 0.50 + (0.50 * width_curve);
        const scale = base_scale * (0.85 + 0.15 * taper_factor);

        // Outer loop
        outlinePoints.forEach((p, j) => {
            const scaledP = p.clone().multiplyScalar(scale);
            vertices.push(scaledP.x, scaledP.y, z);
        });

        // Inner loop
        outlinePoints.forEach((p, j) => {
            const normal = outlineNormals[j];
            const outerP = p.clone().multiplyScalar(scale);
            const thicknessScale = wallThickness * (1 + 0.1 * (1 - t));
            const innerP = outerP.clone().addScaledVector(normal, thicknessScale);
            const innerZ = z - (targetHeight * 0.05) * (1-t);
            vertices.push(innerP.x, innerP.y, innerZ);
        });
    }

    // After all vertices are generated, calculate UVs based on a top-down projection.
    const uvBounds = new THREE.Box2();
    for (let i = 0; i < vertices.length; i+=3) {
        uvBounds.expandByPoint(new THREE.Vector2(vertices[i], vertices[i+1]));
    }
    const uvSize = new THREE.Vector2();
    uvBounds.getSize(uvSize);
    if (uvSize.x === 0) uvSize.x = 1;
    if (uvSize.y === 0) uvSize.y = 1;

    for (let i = 0; i < vertices.length; i+=3) {
        const u = (vertices[i] - uvBounds.min.x) / uvSize.x;
        const v = 1 - ((vertices[i+1] - uvBounds.min.y) / uvSize.y);
        uvs.push(u, v);
    }
    
    const loopSize = numPoints * 2;
    
    for (let i = 0; i < verticalSegments; i++) {
        for (let j = 0; j < numPoints; j++) {
            const next_j = (j + 1) % numPoints;
            const p1_out = i * loopSize + j;
            const p2_out = i * loopSize + next_j;
            const p3_out = (i + 1) * loopSize + j;
            const p4_out = (i + 1) * loopSize + next_j;
            indices.push(p1_out, p2_out, p4_out, p1_out, p4_out, p3_out);

            const p1_in = p1_out + numPoints;
            const p2_in = p2_out + numPoints;
            const p3_in = p3_out + numPoints;
            const p4_in = p4_out + numPoints;
            indices.push(p1_in, p4_in, p2_in, p1_in, p3_in, p4_in);
        }
    }
    
    const bottomInnerLoopIndices: number[] = [];
    for (let j = 0; j < numPoints; j++) {
        bottomInnerLoopIndices.push(verticalSegments * loopSize + numPoints + j);
    }
    const bottomPoints = bottomInnerLoopIndices.map(index => new THREE.Vector2(vertices[index * 3], vertices[index * 3 + 1]));
    const bottomFaces = THREE.ShapeUtils.triangulateShape(bottomPoints, []);
    for (const face of bottomFaces) {
        indices.push(
            bottomInnerLoopIndices[face[0]],
            bottomInnerLoopIndices[face[2]],
            bottomInnerLoopIndices[face[1]]
        );
    }

    const topOffset = 0;
    for (let j = 0; j < numPoints; j++) {
        const next_j = (j + 1) % numPoints;
        const p1_out = topOffset + j;
        const p2_out = topOffset + next_j;
        const p1_in = topOffset + numPoints + j;
        const p2_in = topOffset + numPoints + next_j;
        indices.push(p1_out, p2_in, p2_out, p1_out, p1_in, p2_in);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    
    const material = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 0.05,
        metalness: 0.0,
        transmission: 0.95,
        thickness: 0.2,
        ior: 1.5,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1,
        transparent: true,
        opacity: 1.0,
        side: THREE.DoubleSide,
        envMapIntensity: 1.2,
    });
    
    const finalMesh = new THREE.Mesh(geometry, material);
    finalMesh.rotation.x = -Math.PI / 2;
    finalMesh.castShadow = true;
    finalMesh.receiveShadow = true;
    
    return finalMesh;
}

const createFallbackMesh = (itemData: InventoryItemData): THREE.Mesh => {
    const { lengthCm, widthCm, heightCm } = itemData;
    const geometry = new THREE.BoxGeometry(parseFloat(lengthCm || '0.5')/100, parseFloat(heightCm || '0.1')/100, parseFloat(widthCm || '0.2')/100);
    const material = new THREE.MeshPhysicalMaterial({ 
        color: 0x808080, 
        roughness: 0.4, 
        metalness: 0.2,
        transparent: true,
        opacity: 0.9,
        transmission: 0.2,
    });
    return new THREE.Mesh(geometry, material);
}

// ============ HELPER COMPONENTS (from ThreeDWorkspace.tsx) ============

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
        return <div className="aspect-square w-full bg-black/20 rounded-lg flex items-center justify-center"><p className="text-xs text-gray-400">Loading Image...</p></div>;
    }

    if (!dataUrl) {
        return <div className="aspect-square w-full bg-black/20 rounded-lg flex items-center justify-center"><p className="text-xs text-red-400">Failed to load image</p></div>;
    }

    return <img src={dataUrl} alt="Item" className="w-full h-auto rounded-lg object-contain bg-black/20" />;
};


const DetailRow = ({ label, value }: { label: string, value: any }) => {
    if (!value) return null;
    return (
        <div>
            <p className="text-xs font-bold uppercase text-[var(--text-color-secondary)]">{label}</p>
            <p className="text-sm text-[var(--text-color-primary)]">{value}</p>
        </div>
    );
};

const ItemDetailsDisplay = () => {
    const itemData = useAtomValue(SelectedItemDataAtom);

    if (!itemData) {
        return (
            <div className="flex items-center justify-center h-full">
                <p className="text-sm text-[var(--text-color-secondary)]">No item selected.</p>
            </div>
        );
    }
    const dimensions = [itemData.widthCm, itemData.heightCm, itemData.lengthCm].filter(Boolean).join(' x ');

    return (
        <div className="flex flex-col h-full">
            <div className="p-4 border-b border-[var(--border-color)]">
                 <h2 className="font-bold text-lg">{itemData.shape || 'Item Details'}</h2>
                 <p className="text-sm text-[var(--text-color-secondary)]">{itemData.material}</p>
            </div>
            <div className="grow overflow-y-auto p-4 space-y-4">
                <ItemImage imageUrl={itemData.generatedPngUrl || null} />
                <DetailRow label="Vendor ID" value={itemData.itemId} />
                <DetailRow label="Item #" value={itemData.itemNumber} />
                <DetailRow label="Description" value={itemData.description} />
                <DetailRow label="Short Description" value={itemData.shortDescription} />
                <DetailRow label="Dimensions" value={dimensions ? `${dimensions} cm` : null} />
                <DetailRow label="Weight" value={itemData.weightKg ? `${itemData.weightKg} kg` : null} />
                <DetailRow label="Price" value={itemData.price ? `$${itemData.price} MXN` : null} />
                <DetailRow label="Quantity" value={itemData.quantity} />
                {itemData.color && <div className="flex items-center gap-2">
                     <p className="text-xs font-bold uppercase text-[var(--text-color-secondary)]">Color</p>
                     <div className="w-10 h-5 rounded" style={{background: itemData.color}}></div>
                </div>}
            </div>
        </div>
    );
};

// ============ 3D CANVAS COMPONENT (from ThreeDCanvas.tsx) ============

export const ThreeDCanvas: React.FC<{ cameraYOffset?: number }> = ({ cameraYOffset = 0 }) => {
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

    new RGBELoader()
      .load('https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/4k/belfast_sunset_puresky_4k.hdr', function (texture) {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        scene.background = texture;
        scene.environment = texture;
      });

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
    let currentMesh: THREE.Mesh | null = null;
    
    const updateScene = async () => {
        if (currentMesh) {
            scene.remove(currentMesh);
            currentMesh.geometry.dispose();
            if (Array.isArray(currentMesh.material)) {
                currentMesh.material.forEach(m => m.dispose());
            } else {
                currentMesh.material.dispose();
            }
        }
        
        const existingMessage = mount.querySelector('.threed-message');
        if (existingMessage) mount.removeChild(existingMessage);
        
        const messageDiv = document.createElement('div');
        messageDiv.className = 'threed-message p-4 text-xs absolute inset-0 flex items-center justify-center text-center';
        mount.appendChild(messageDiv);

        try {
            if (itemData && (itemData.spatialMasks || itemData.generatedSvgUrl)) {
                messageDiv.textContent = 'Generating 3D model...';
                
                if(itemData.shape?.toLowerCase().includes('canoe')) {
                    currentMesh = createCanoeMesh(itemData);
                } else {
                    messageDiv.textContent = 'Creating fallback model...';
                    currentMesh = createFallbackMesh(itemData);
                }
                
                scene.add(currentMesh);

                let texture: THREE.Texture | null = null;
                if (itemData.generatedPngUrl) {
                    messageDiv.textContent = 'Loading texture...';
                    const dataUrl = await loadDriveImageAsDataUrl(itemData.generatedPngUrl);
                    if (dataUrl) {
                        texture = await loadTextureAsync(dataUrl);
                        texture.colorSpace = THREE.SRGBColorSpace;
                    }
                } else if (itemData.color && (itemData.color.includes('gradient') || itemData.color.includes('#'))) {
                    messageDiv.textContent = 'Creating procedural texture...';
                    texture = createGradientTexture(itemData.color);
                }
                
                if (currentMesh.material instanceof THREE.MeshPhysicalMaterial) {
                    if (currentMesh.material.map) currentMesh.material.map.dispose();
                    currentMesh.material.map = texture;

                    if (texture) {
                        currentMesh.material.color.set(0xffffff);
                        if(itemData.shape?.toLowerCase().includes('canoe')) {
                            currentMesh.material.transmission = 0.85; // slightly less transmission with texture
                        }
                    } else {
                        currentMesh.material.color.set(new THREE.Color(itemData.color || 0xffffff));
                         if(itemData.shape?.toLowerCase().includes('canoe')) {
                            currentMesh.material.transmission = 0.95; // full transmission for solid color
                        }
                    }
                    currentMesh.material.needsUpdate = true;
                }
                
                const box = new THREE.Box3().setFromObject(currentMesh);
                const size = box.getSize(new THREE.Vector3());
                const center = box.getCenter(new THREE.Vector3());
                
                const hoverHeight = 5 * 0.0254; // 5 inches in meters
                currentMesh.position.y = hoverHeight - box.min.y;
                currentMesh.position.x = -center.x;
                currentMesh.position.z = -center.z;
                
                
                const maxDim = Math.max(size.x, size.y, size.z);
                const distance = 2.0 * (maxDim / (2 * Math.atan(Math.PI * camera.fov / 360)));
                const direction = new THREE.Vector3(0, 0.5, 1).normalize();
                
                camera.position.copy(center).add(direction.multiplyScalar(distance));
                camera.position.y += size.y / 2;
                baseCameraPosRef.current = camera.position.clone();
                controls.target.copy(center);
                
                messageDiv.style.display = 'none';

            } else {
                 messageDiv.textContent = itemData ? 'This item does not have the required mask data for a 3D preview.' : 'Select an item from the inventory to view it in 3D.';
            }
        } catch (error) {
            console.error('3D View Error:', error);
            messageDiv.textContent = `Error rendering 3D model: ${error instanceof Error ? error.message : String(error)}`;
            messageDiv.className += ' text-red-400';
            if (itemData) {
                currentMesh = createFallbackMesh(itemData);
                scene.add(currentMesh);
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

    const handleResize = () => {
        camera.aspect = mount.clientWidth / mount.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      controls.dispose();
      scene.traverse(object => {
        if (object instanceof THREE.Mesh) {
          if (object.geometry) object.geometry.dispose();
          if (Array.isArray(object.material)) {
            object.material.forEach(material => {
              if (material.map) material.map.dispose();
              material.dispose();
            });
          } else if (object.material) {
            if ((object.material as any).map) (object.material as any).map.dispose();
            (object.material as any).dispose();
          }
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [itemData]);

  return <div ref={mountRef} className="w-full h-full relative" />;
}

// ============ EXPORTED VIEWER COMPONENT (from ThreeDViewer.tsx) ============
export function ThreeDViewer() {
  const [isOpen, setIsOpen] = useAtom(is3DViewerOpenAtom);
  const [cameraYOffset, setCameraYOffset] = useState(0);
  
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex flex-col items-center justify-center backdrop-blur-sm">
      <button onClick={() => setIsOpen(false)} className="absolute top-4 right-4 text-white text-3xl z-20">&times;</button>
      
      <div className="absolute top-4 left-1/2 -translate-x-1/2 glass-panel p-2 px-4 w-full max-w-sm z-10">
        <div className="flex items-center gap-3">
            <label htmlFor="height-slider" className="text-sm font-semibold">Camera Height</label>
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
    </div>
  );
}


// ============ EXPORTED WORKSPACE COMPONENT (from ThreeDWorkspace.tsx) ============
export function ThreeDWorkspace() {
    const setIsOpen = useSetAtom(is3DWorkspaceOpenAtom);
    const [isInventoryOpen, setIsInventoryOpen] = useAtom(is3DWorkspaceInventoryOpenAtom);
    const [isDetailsOpen, setIsDetailsOpen] = useAtom(is3DWorkspaceDetailsOpenAtom);
    const [cameraYOffset, setCameraYOffset] = useState(0);
    
    const handleItemSelect = (item: InventoryItem, dataUrl: string) => {
        setIsInventoryOpen(false);
    };

    return (
        <div className="fixed inset-0 bg-black/80 z-40 backdrop-blur-sm">
            {/* 3D Canvas Area - takes full space */}
            <div className="w-full h-full">
                <ThreeDCanvas cameraYOffset={cameraYOffset} />
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
                    <label htmlFor="height-slider" className="text-sm font-semibold">Camera Height</label>
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
                    className="button !p-2.5 !min-h-0"
                    title={isInventoryOpen ? 'Hide Inventory' : 'Show Inventory'}
                >
                    <svg className="w-5 h-5 transform -scale-x-100"><use href="#layout-sidebar-right"></use></svg>
                </button>
            </div>

            {/* Top-Right Controls: Details Toggle & Close */}
            <div className="absolute top-4 right-4 flex gap-2 z-50">
                 <button
                    onClick={() => setIsDetailsOpen(!isDetailsOpen)}
                    className="button !p-2.5 !min-h-0"
                    title={isDetailsOpen ? 'Hide Details' : 'Show Details'}
                >
                    <svg className="w-5 h-5"><use href="#layout-sidebar-right"></use></svg>
                </button>
                <button
                    onClick={() => setIsOpen(false)}
                    className="button !p-2.5 !min-h-0 !bg-red-500/50 hover:!bg-red-500"
                    title="Close Showroom"
                >
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                       <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                   </svg>
                </button>
            </div>
        </div>
    );
}
