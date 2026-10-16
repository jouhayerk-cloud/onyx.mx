import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { InventoryItem } from '../../lib/Types';
import { normalizeInventoryData } from '../../lib/utils';
import { gsap } from 'gsap';
import { tr } from '../../lib/i18n';
import { CrateCutfileStencilView, getContainerClassification, WarehouseContainerOption } from './CrateCutfileStencilView';

interface PackingPosition {
    x: number; // in cm
    y: number; // in cm
    z: number; // in cm
    rotation: number; // 0, 90, 180, 270
    isFlipped: boolean;
}

interface CrateSeparator {
    id: string;
    y: number; // height in cm
    label?: string;
}

export interface CratePackingWorkspaceProps {
    width: number;
    length: number;
    height: number;
    items: { item: InventoryItem; position: PackingPosition }[];
    separators?: CrateSeparator[];
    onUpdatePosition?: (itemId: string, pos: PackingPosition) => void;
    activeItemId?: string | null;
    crateName?: string;
    crateType?: string;
    viewMode?: '3d' | 'stencil' | 'dual';
    onViewModeChange?: (mode: '3d' | 'stencil' | 'dual') => void;
    hideModeSwitcher?: boolean;
    availableContainers?: WarehouseContainerOption[];
    selectedContainerId?: string;
    onSelectContainer?: (id: string) => void;
    thickness?: number;
    onThicknessChange?: (th: number) => void;
    burn?: number;
    onBurnChange?: (b: number) => void;
}

export const CratePackingWorkspace: React.FC<CratePackingWorkspaceProps> = ({
    width = 60,
    length = 60,
    height = 60,
    items = [],
    separators = [],
    onUpdatePosition,
    activeItemId,
    crateName,
    crateType,
    viewMode: controlledViewMode,
    onViewModeChange,
    hideModeSwitcher = false,
    availableContainers,
    selectedContainerId,
    onSelectContainer,
    thickness,
    onThicknessChange,
    burn,
    onBurnChange
}) => {
    // Viewport Modes: '3d' | 'stencil' | 'dual'
    const [internalViewMode, setInternalViewMode] = useState<'3d' | 'stencil' | 'dual'>('3d');
    const viewMode = controlledViewMode !== undefined ? controlledViewMode : internalViewMode;
    const [isMobile, setIsMobile] = useState<boolean>(() => {
        if (typeof window !== 'undefined') {
            return window.innerWidth < 768;
        }
        return false;
    });

    // Bi-directional Hover and Selection tracking
    const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
    const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

    // Responsive screen width listener: fallback gracefully on <768px per Apple HIG
    useEffect(() => {
        const handleWindowResize = () => {
            setIsMobile(window.innerWidth < 768);
        };
        window.addEventListener('resize', handleWindowResize);
        return () => window.removeEventListener('resize', handleWindowResize);
    }, []);

    const effectiveViewMode = (isMobile && viewMode === 'dual') ? '3d' : viewMode;
    const effectiveHighlightId = hoveredItemId || selectedItemId || activeItemId || null;

    const containerRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<{
        scene: THREE.Scene;
        camera: THREE.OrthographicCamera;
        renderer: THREE.WebGLRenderer;
        controls: OrbitControls;
        itemsMap: Map<string, THREE.Mesh>;
        raycaster: THREE.Raycaster;
        mouse: THREE.Vector2;
        draggedMesh: THREE.Mesh | null;
        dragPlane: THREE.Mesh;
        offset: THREE.Vector3;
        highlightBox: THREE.BoxHelper;
    } | null>(null);

    // Units: 1 unit = 1 cm
    useEffect(() => {
        if (!containerRef.current) return;

        const w = containerRef.current.clientWidth || 800;
        const h = containerRef.current.clientHeight || 600;

        const scene = new THREE.Scene();
        scene.background = null;

        const aspect = w / h;
        const d = Math.max(width, height, length) * 1.2;
        const camera = new THREE.OrthographicCamera(
            -d * aspect, d * aspect, d, -d, 1, 10000
        );
        camera.position.set(width * 2, height * 2, -length * 2); 
        camera.lookAt(width / 2, height / 2, length / 2);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(w, h);
        renderer.setPixelRatio(window.devicePixelRatio);
        containerRef.current.appendChild(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.target.set(width / 2, height / 2, length / 2);
        
        // Lights
        scene.add(new THREE.AmbientLight(0xffffff, 0.45));
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.85);
        dirLight.position.set(100, 200, -100);
        scene.add(dirLight);

        // --- Crate Shell (Bottom, Back, Sides) ---
        const createGridTexture = () => {
            const size = 128;
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d')!;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.lineWidth = 2;
            ctx.strokeRect(0, 0, size, size);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(size / 2, 0); ctx.lineTo(size / 2, size);
            ctx.moveTo(0, size / 2); ctx.lineTo(size, size / 2);
            ctx.stroke();
            const tex = new THREE.CanvasTexture(canvas);
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            return tex;
        };
        const gridTex = createGridTexture();

        const wallMat = new THREE.MeshStandardMaterial({ 
            map: gridTex, 
            transparent: true, 
            opacity: 0.8, 
            side: THREE.DoubleSide,
            color: 0x111111,
            metalness: 0.2,
            roughness: 0.8
        });

        // Bottom
        const bottom = new THREE.Mesh(new THREE.PlaneGeometry(width, length), wallMat);
        bottom.rotation.x = -Math.PI / 2;
        bottom.position.set(width / 2, 0, length / 2);
        (bottom.material as THREE.MeshStandardMaterial).map!.repeat.set(width / 10, length / 10);
        scene.add(bottom);

        // Back
        const back = new THREE.Mesh(new THREE.PlaneGeometry(width, height), wallMat);
        back.position.set(width / 2, height / 2, length);
        (back.material as THREE.MeshStandardMaterial).map!.repeat.set(width / 10, height / 10);
        scene.add(back);

        // Left Side
        const left = new THREE.Mesh(new THREE.PlaneGeometry(length, height), wallMat);
        left.rotation.y = Math.PI / 2;
        left.position.set(0, height / 2, length / 2);
        (left.material as THREE.MeshStandardMaterial).map!.repeat.set(length / 10, height / 10);
        scene.add(left);

        // Right Side
        const right = new THREE.Mesh(new THREE.PlaneGeometry(length, height), wallMat);
        right.rotation.y = -Math.PI / 2;
        right.position.set(width, height / 2, length / 2);
        (right.material as THREE.MeshStandardMaterial).map!.repeat.set(length / 10, height / 10);
        scene.add(right);

        // --- Interaction Logic & Highlighting Helper ---
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        const dragPlane = new THREE.Mesh(
            new THREE.PlaneGeometry(1000, 1000),
            new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
        );
        scene.add(dragPlane);

        // Emissive cyan wireframe box helper for hovered/selected item
        const dummyMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
        const highlightBox = new THREE.BoxHelper(dummyMesh, 0x22d3ee);
        highlightBox.visible = false;
        highlightBox.renderOrder = 999;
        (highlightBox.material as THREE.LineBasicMaterial).depthTest = false;
        scene.add(highlightBox);

        sceneRef.current = { 
            scene, camera, renderer, controls, 
            itemsMap: new Map(), raycaster, mouse, 
            draggedMesh: null, dragPlane, offset: new THREE.Vector3(),
            highlightBox
        };

        const animate = () => {
            requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        };
        animate();

        // Responsive dynamic resize without distortion
        const handleResize = () => {
            if (!containerRef.current || !sceneRef.current) return;
            const curW = containerRef.current.clientWidth;
            const curH = containerRef.current.clientHeight;
            if (curW <= 0 || curH <= 0) return;

            const curAspect = curW / curH;
            const curD = Math.max(width, height, length) * 1.2;
            camera.left = -curD * curAspect;
            camera.right = curD * curAspect;
            camera.top = curD;
            camera.bottom = -curD;
            camera.updateProjectionMatrix();
            renderer.setSize(curW, curH);
        };

        const resizeObserver = new ResizeObserver(() => {
            handleResize();
        });
        resizeObserver.observe(containerRef.current);
        window.addEventListener('resize', handleResize);

        return () => {
            resizeObserver.disconnect();
            window.removeEventListener('resize', handleResize);
            renderer.dispose();
            if (containerRef.current?.contains(renderer.domElement)) {
                containerRef.current.removeChild(renderer.domElement);
            }
        };
    }, []); // Only on mount

    // --- Mode Switcher Handler with Event Dispatch ---
    const handleViewModeChange = (mode: '3d' | 'stencil' | 'dual') => {
        setInternalViewMode(mode);
        onViewModeChange?.(mode);
        // Dispatch window resize events so camera and renderer adapt immediately
        window.dispatchEvent(new Event('resize'));
        requestAnimationFrame(() => {
            window.dispatchEvent(new Event('resize'));
        });
        setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, 80);
    };

    // Watch viewMode changes to trigger smooth resize
    useEffect(() => {
        const timer = setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, 50);
        return () => clearTimeout(timer);
    }, [viewMode]);

    // --- Synchronize Items Meshes ---
    useEffect(() => {
        if (!sceneRef.current) return;
        const { scene, itemsMap } = sceneRef.current;

        // Cleanup removed items
        const itemIds = new Set(items.map(i => String(i.item.row)));
        itemsMap.forEach((mesh, id) => {
            if (!itemIds.has(id)) {
                scene.remove(mesh);
                itemsMap.delete(id);
            }
        });

        // Add/Update items
        items.forEach(({ item, position }) => {
            const id = String(item.row);
            const norm = normalizeInventoryData(item.data);
            
            // Cuboid Size + 3cm padding (1.5cm each side)
            const padding = 3;
            const iw = (Number(norm.widthCm) || 10) + padding;
            const il = (Number(norm.lengthCm) || 10) + padding;
            const ih = (Number(norm.heightCm) || 10) + padding;

            let mesh = itemsMap.get(id);
            if (!mesh) {
                const geometry = new THREE.BoxGeometry(iw, ih, il);
                const color = (item.data as any).vendor_id?.startsWith('825') ? 0xf97316 : 0x3b82f6;
                const material = new THREE.MeshStandardMaterial({ 
                    color, 
                    transparent: true, 
                    opacity: 0.7, 
                    metalness: 0.3, 
                    roughness: 0.4,
                    emissive: color,
                    emissiveIntensity: 0.1
                });
                mesh = new THREE.Mesh(geometry, material);
                mesh.userData = { id, baseColor: color };
                
                // Add Edges
                const edges = new THREE.LineSegments(
                    new THREE.EdgesGeometry(geometry),
                    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 })
                );
                edges.userData = { isEdges: true };
                mesh.add(edges);
                
                scene.add(mesh);
                itemsMap.set(id, mesh);
            }

            // Position (center of mass)
            const targetPos = new THREE.Vector3(
                position.x + iw / 2,
                position.y + ih / 2,
                position.z + il / 2
            );
            
            // Smoothly move
            gsap.to(mesh.position, {
                x: targetPos.x,
                y: targetPos.y,
                z: targetPos.z,
                duration: 0.5,
                ease: "power2.out"
            });
            
            // Rotation
            mesh.rotation.y = (position.rotation * Math.PI) / 180;
            if (position.isFlipped) mesh.rotation.x = Math.PI;
            else mesh.rotation.x = 0;
        });
    }, [items]);

    // --- Emissive Cyan Edge and Wireframe Highlight Synchronization ---
    useEffect(() => {
        if (!sceneRef.current) return;
        const { itemsMap, highlightBox } = sceneRef.current;

        let activeMesh: THREE.Mesh | null = null;

        itemsMap.forEach((mesh, id) => {
            const isHighlighted = (id === effectiveHighlightId);
            const isHovered = (id === hoveredItemId);
            const baseColor = mesh.userData?.baseColor ?? 0x3b82f6;
            const mat = mesh.material as THREE.MeshStandardMaterial;

            if (isHighlighted) {
                activeMesh = mesh;
                // Emissive Cyan Edge & Glow highlight
                mat.emissive.setHex(0x06b6d4); // Cyan
                mat.emissiveIntensity = isHovered ? 0.45 : 0.6;
                mat.opacity = 0.95;
            } else {
                mat.emissive.setHex(baseColor);
                mat.emissiveIntensity = 0.1;
                mat.opacity = 0.7;
            }

            // Edges highlight
            mesh.children.forEach(child => {
                if (child instanceof THREE.LineSegments && child.userData?.isEdges) {
                    const lineMat = child.material as THREE.LineBasicMaterial;
                    if (isHighlighted) {
                        lineMat.color.setHex(0x22d3ee); // Cyan-400
                        lineMat.opacity = 1.0;
                    } else {
                        lineMat.color.setHex(0xffffff);
                        lineMat.opacity = 0.3;
                    }
                }
            });
        });

        // Update wireframe box highlight helper
        if (activeMesh && highlightBox) {
            highlightBox.setFromObject(activeMesh);
            highlightBox.visible = true;
        } else if (highlightBox) {
            highlightBox.visible = false;
        }
    }, [items, effectiveHighlightId, hoveredItemId, selectedItemId, activeItemId]);

    // --- Synchronize Separators ---
    useEffect(() => {
        if (!sceneRef.current) return;
        const { scene } = sceneRef.current;

        // Cleanup existing separators
        scene.children.filter(c => c.userData?.isSeparator).forEach(c => scene.remove(c));

        separators.forEach(sep => {
            const geometry = new THREE.PlaneGeometry(width, length);
            const material = new THREE.MeshStandardMaterial({ 
                color: 0xffffff, 
                transparent: true, 
                opacity: 0.2, 
                side: THREE.DoubleSide,
                metalness: 0.8,
                roughness: 0.2
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.set(width / 2, sep.y, length / 2);
            mesh.userData = { isSeparator: true, id: sep.id };
            
            // Edge line
            const edges = new THREE.LineSegments(
                new THREE.EdgesGeometry(geometry),
                new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.5, transparent: true })
            );
            mesh.add(edges);
            
            scene.add(mesh);
        });
    }, [separators, width, length]);

    // --- Pointer Events: Drag, Hover Raycasting & Selection ---
    const onPointerDown = (e: React.PointerEvent) => {
        if (!sceneRef.current || !containerRef.current) return;
        const { scene, camera, raycaster, mouse, dragPlane, offset } = sceneRef.current;
        
        const rect = containerRef.current.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(scene.children, true);
        
        const itemHit = intersects.find(i => i.object.parent?.userData?.id || i.object.userData?.id);
        if (itemHit) {
            const mesh = (itemHit.object.userData?.id ? itemHit.object : itemHit.object.parent) as THREE.Mesh;
            const hitId = String(mesh.userData.id);
            setSelectedItemId(prev => (prev === hitId ? null : hitId));

            sceneRef.current.draggedMesh = mesh;
            sceneRef.current.controls.enabled = false;
            
            // Align drag plane to camera
            dragPlane.position.copy(mesh.position);
            dragPlane.lookAt(camera.position);
            
            // Calculate offset
            const planeIntersects = raycaster.intersectObject(dragPlane);
            if (planeIntersects.length > 0) {
                offset.copy(planeIntersects[0].point).sub(mesh.position);
            }
        } else {
            // Clicked background: clear selection
            setSelectedItemId(null);
        }
    };

    const onPointerMove = (e: React.PointerEvent) => {
        if (!sceneRef.current || !containerRef.current) return;
        const { camera, raycaster, mouse, draggedMesh, dragPlane, offset, scene, highlightBox } = sceneRef.current;

        const rect = containerRef.current.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        if (draggedMesh) {
            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObject(dragPlane);
            
            if (intersects.length > 0) {
                const newPos = intersects[0].point.sub(offset);
                
                // Snapping and Grid Bounds
                const id = draggedMesh.userData.id;
                const item = items.find(i => String(i.item.row) === id);
                if (!item) return;
                
                const norm = normalizeInventoryData(item.item.data);
                const padding = 3;
                const iw = (Number(norm.widthCm) || 10) + padding;
                const il = (Number(norm.lengthCm) || 10) + padding;
                const ih = (Number(norm.heightCm) || 10) + padding;

                // Clamp to Crate
                newPos.x = Math.max(iw / 2, Math.min(width - iw / 2, newPos.x));
                newPos.z = Math.max(il / 2, Math.min(length - il / 2, newPos.z));
                
                // Snap to Y (Floor or Separator)
                const availableY = [0, ...separators.map(s => s.y)];
                let snapY = 0;
                let minDist = Infinity;
                availableY.forEach(y => {
                    const d = Math.abs(newPos.y - (y + ih / 2));
                    if (d < minDist) {
                        minDist = d;
                        snapY = y;
                    }
                });
                newPos.y = snapY + ih / 2;

                // Grid Snapping (optional 1cm)
                newPos.x = Math.round(newPos.x);
                newPos.z = Math.round(newPos.z);

                draggedMesh.position.copy(newPos);
                if (highlightBox && highlightBox.visible) {
                    highlightBox.setFromObject(draggedMesh);
                }
                
                // Update parent state
                onUpdatePosition?.(id, {
                    x: newPos.x - iw / 2,
                    y: newPos.y - ih / 2,
                    z: newPos.z - il / 2,
                    rotation: item.position.rotation,
                    isFlipped: item.position.isFlipped
                });
            }
        } else {
            // Raycast hover detection when not dragging
            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(scene.children, true);
            const itemHit = intersects.find(i => i.object.parent?.userData?.id || i.object.userData?.id);
            const hitId = itemHit ? String(itemHit.object.userData?.id || itemHit.object.parent?.userData?.id) : null;
            if (hitId !== hoveredItemId) {
                setHoveredItemId(hitId);
            }
        }
    };

    const onPointerUp = () => {
        if (!sceneRef.current) return;
        sceneRef.current.draggedMesh = null;
        sceneRef.current.controls.enabled = true;
    };

    const onPointerLeave = () => {
        onPointerUp();
        setHoveredItemId(null);
    };

    const containerClassification = useMemo(() => {
        return getContainerClassification(crateType, width, length, height);
    }, [crateType, width, length, height]);

    return (
        <div className="ui-root w-full h-full min-h-[400px] relative overflow-hidden flex flex-col md:flex-row bg-[#060810] select-none text-white font-sans">
            {/* Top-centered Floating Mode Switcher & Classification Pill */}
            {!hideModeSwitcher && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 p-1 bg-black/80 backdrop-blur-xl border border-white/10 rounded-full shadow-2xl">
                    {/* Classification Tag */}
                    <div className={`hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${containerClassification.bg} ${containerClassification.border} ${containerClassification.color}`}>
                        <span>{containerClassification.icon}</span>
                        <span>{containerClassification.badge}</span>
                    </div>

                    <div className="flex items-center">
                        {/* 📦 3D Isometric Crate */}
                        <button
                            type="button"
                            onClick={() => handleViewModeChange('3d')}
                            className={`px-3.5 py-1.5 rounded-full text-xs transition-all duration-200 flex items-center gap-1.5 cursor-pointer ${
                                effectiveViewMode === '3d'
                                    ? 'bg-white/20 text-white shadow-[0_0_15px_rgba(255,255,255,0.15)] border border-white/30 font-bold'
                                    : 'text-white/50 hover:text-white/80 hover:bg-white/5 border border-transparent font-medium'
                            }`}
                        >
                            <span>📦</span>
                            <span>{tr("3D Isometric Crate")}</span>
                        </button>

                        {/* 📐 2D Laser Stencil */}
                        <button
                            type="button"
                            onClick={() => handleViewModeChange('stencil')}
                            className={`px-3.5 py-1.5 rounded-full text-xs transition-all duration-200 flex items-center gap-1.5 cursor-pointer ${
                                effectiveViewMode === 'stencil'
                                    ? 'bg-cyan-500/20 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.25)] border border-cyan-400/40 font-bold'
                                    : 'text-white/50 hover:text-white/80 hover:bg-white/5 border border-transparent font-medium'
                            }`}
                        >
                            <span>📐</span>
                            <span>{tr("2D Laser Stencil")}</span>
                        </button>

                        {/* ◫ Dual Split View (Hidden on mobile <768px per Apple HIG) */}
                        <button
                            type="button"
                            onClick={() => handleViewModeChange('dual')}
                            className={`hidden md:flex px-3.5 py-1.5 rounded-full text-xs transition-all duration-200 items-center gap-1.5 cursor-pointer ${
                                effectiveViewMode === 'dual'
                                    ? 'bg-gradient-to-r from-blue-500/25 to-cyan-500/25 text-cyan-200 shadow-[0_0_15px_rgba(6,182,212,0.3)] border border-cyan-400/50 font-bold'
                                    : 'text-white/50 hover:text-white/80 hover:bg-white/5 border border-transparent font-medium'
                            }`}
                            title={tr("Dual View: Side-by-side 3D Crate and 2D Laser Stencil")}
                        >
                            <span className="text-sm leading-none">◫</span>
                            <span>{tr("Dual Split View")}</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Left / Primary Pane: 3D Viewport (100% in 3d, 60% in dual, hidden in stencil) */}
            <div 
                ref={containerRef} 
                className={`relative transition-all duration-300 cursor-crosshair group ${
                    effectiveViewMode === 'dual' 
                        ? 'w-full md:w-[60%] h-full min-h-[400px] border-b md:border-b-0 md:border-r border-white/10' 
                        : effectiveViewMode === '3d' 
                        ? 'w-full h-full min-h-[400px] block' 
                        : 'hidden'
                }`}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerLeave}
            >
                {/* 3D Viewport Sub-header / Badge */}
                <div className="absolute top-4 left-4 z-20 flex items-center gap-2 px-3 py-1 bg-black/60 backdrop-blur-md border border-white/10 rounded-xl pointer-events-none">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                    <span className="text-[10px] font-black uppercase tracking-wider text-white/70">
                        {effectiveViewMode === 'dual' ? tr("3D Spatial View (60%)") : tr("3D Isometric Crate Studio")}
                    </span>
                    <span className={`ml-1 text-[9px] font-mono px-1.5 py-0.2 rounded border ${containerClassification.bg} ${containerClassification.border} ${containerClassification.color}`}>
                        {containerClassification.badge}
                    </span>
                </div>

                {/* Legend Overlay */}
                <div className="absolute top-4 right-4 flex flex-col gap-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-20">
                    <div className="flex items-center gap-3 px-3 py-1.5 bg-black/50 backdrop-blur-md border border-white/10 rounded-xl">
                        <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">{tr("Orbit")}</span>
                        <span className="text-[9px] font-mono text-white/80">{tr("L-MOUSE")}</span>
                    </div>
                    <div className="flex items-center gap-3 px-3 py-1.5 bg-black/50 backdrop-blur-md border border-white/10 rounded-xl">
                        <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">{tr("Pan")}</span>
                        <span className="text-[9px] font-mono text-white/80">{tr("R-MOUSE")}</span>
                    </div>
                    <div className="flex items-center gap-3 px-3 py-1.5 bg-black/50 backdrop-blur-md border border-white/10 rounded-xl">
                        <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">{tr("Move")}</span>
                        <span className="text-[9px] font-mono text-white/80">{tr("DRAG ITEM")}</span>
                    </div>
                </div>

                {/* Active / Hovered item status bar in 3D */}
                {effectiveHighlightId && (
                    <div className="absolute bottom-4 left-4 z-20 flex items-center gap-2 px-3 py-1.5 bg-black/70 backdrop-blur-md border border-cyan-400/40 rounded-xl pointer-events-none">
                        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                        <span className="text-[11px] font-mono text-cyan-300 font-bold">
                            {tr("Active")}: Item #{effectiveHighlightId}
                        </span>
                    </div>
                )}
            </div>

            {/* Right / Secondary Pane: 2D Laser Stencil Viewport (100% in stencil, 40% in dual, hidden in 3d) */}
            {(effectiveViewMode === 'stencil' || effectiveViewMode === 'dual') && (
                <div 
                    className={`relative transition-all duration-300 ${
                        effectiveViewMode === 'dual' 
                            ? 'w-full md:w-[40%] h-full min-h-[400px]' 
                            : 'w-full h-full min-h-[400px]'
                    }`}
                >
                    {effectiveViewMode === 'dual' && (
                        <div className="absolute top-4 right-4 z-20 flex items-center gap-2 px-3 py-1 bg-black/60 backdrop-blur-md border border-white/10 rounded-xl pointer-events-none">
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                            <span className="text-[10px] font-black uppercase tracking-wider text-cyan-300/80">
                                {tr("2D Stencil (40%)")}
                            </span>
                        </div>
                    )}
                    <CrateCutfileStencilView
                        width={width}
                        length={length}
                        height={height}
                        items={items}
                        separators={separators}
                        crateName={crateName}
                        highlightedItemId={effectiveHighlightId || undefined}
                        onHoverItem={setHoveredItemId}
                        onSelectItem={setSelectedItemId}
                        availableContainers={availableContainers}
                        selectedContainerId={selectedContainerId}
                        onSelectContainer={onSelectContainer}
                        thickness={thickness}
                        onThicknessChange={onThicknessChange}
                        burn={burn}
                        onBurnChange={onBurnChange}
                    />
                </div>
            )}
        </div>
    );
};
