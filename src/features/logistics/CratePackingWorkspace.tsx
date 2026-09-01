import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { InventoryItem } from '../../lib/Types';
import { normalizeInventoryData } from '../../lib/utils';
import { gsap } from 'gsap';
import { tr } from '../../lib/i18n';

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

interface CratePackingWorkspaceProps {
    width: number;
    length: number;
    height: number;
    items: { item: InventoryItem; position: PackingPosition }[];
    separators?: CrateSeparator[];
    onUpdatePosition?: (itemId: string, pos: PackingPosition) => void;
    activeItemId?: string | null;
}

export const CratePackingWorkspace: React.FC<CratePackingWorkspaceProps> = ({
    width = 60,
    length = 60,
    height = 60,
    items = [],
    separators = [],
    onUpdatePosition,
    activeItemId
}) => {
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
    } | null>(null);

    // Units: 1 unit = 1 cm
    
    useEffect(() => {
        if (!containerRef.current) return;

        const w = containerRef.current.clientWidth;
        const h = containerRef.current.clientHeight;

        const scene = new THREE.Scene();
        scene.background = null;

        const aspect = w / h;
        const d = Math.max(width, height, length) * 1.2;
        const camera = new THREE.OrthographicCamera(
            -d * aspect, d * aspect, d, -d, 1, 10000
        );
        camera.position.set(width * 2, height * 2, -length * 2); 
        camera.lookAt(width/2, height/2, length/2);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(w, h);
        renderer.setPixelRatio(window.devicePixelRatio);
        containerRef.current.appendChild(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.target.set(width / 2, height / 2, length / 2);
        
        // Lights
        scene.add(new THREE.AmbientLight(0xffffff, 0.4));
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
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
            ctx.moveTo(size/2, 0); ctx.lineTo(size/2, size);
            ctx.moveTo(0, size/2); ctx.lineTo(size, size/2);
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

        // --- Interaction Logic ---
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        const dragPlane = new THREE.Mesh(
            new THREE.PlaneGeometry(1000, 1000),
            new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
        );
        scene.add(dragPlane);

        sceneRef.current = { 
            scene, camera, renderer, controls, 
            itemsMap: new Map(), raycaster, mouse, 
            draggedMesh: null, dragPlane, offset: new THREE.Vector3() 
        };

        const animate = () => {
            requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        };
        animate();

        let timeoutId: number;
        const handleResize = () => {
            clearTimeout(timeoutId);
            timeoutId = window.setTimeout(() => {
            if (!containerRef.current) return;
            const w = containerRef.current.clientWidth;
            const aspect = w / h;
            const d = Math.max(width, height, length) * 1.2;
            camera.left = -d * aspect;
            camera.right = d * aspect;
            camera.top = d;
            camera.bottom = -d;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
        }, 100) as unknown as number;
        };
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            clearTimeout(timeoutId);
            renderer.dispose();
            if (containerRef.current?.contains(renderer.domElement)) {
                containerRef.current.removeChild(renderer.domElement);
            }
        };
    }, []); // Only on mount

    // --- Synchronize Items ---
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
                mesh.userData = { id };
                
                // Add Edges
                const edges = new THREE.LineSegments(
                    new THREE.EdgesGeometry(geometry),
                    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 })
                );
                mesh.add(edges);
                
                scene.add(mesh);
                itemsMap.set(id, mesh);
            }

            // Position (center of mass)
            // position.x/y/z is the anchor (corner), so we add half-size
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

            // Highlight active
            const mat = mesh.material as THREE.MeshStandardMaterial;
            mat.opacity = activeItemId === id ? 0.9 : 0.7;
            mat.emissiveIntensity = activeItemId === id ? 0.3 : 0.1;
        });
    }, [items, activeItemId]);

    // --- Synchronize Separators ---
    useEffect(() => {
        if (!sceneRef.current) return;
        const { scene } = sceneRef.current;

        // Cleanup existing separators
        scene.children.filter(c => c.userData.isSeparator).forEach(c => scene.remove(c));

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

    // --- Events ---
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
        }
    };

    const onPointerMove = (e: React.PointerEvent) => {
        if (!sceneRef.current || !containerRef.current || !sceneRef.current.draggedMesh) return;
        const { camera, raycaster, mouse, draggedMesh, dragPlane, offset } = sceneRef.current;

        const rect = containerRef.current.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

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
            newPos.x = Math.max(iw/2, Math.min(width - iw/2, newPos.x));
            newPos.z = Math.max(il/2, Math.min(length - il/2, newPos.z));
            
            // Snap to Y (Floor or Separator)
            const availableY = [0, ...separators.map(s => s.y)];
            let snapY = 0;
            let minDist = Infinity;
            availableY.forEach(y => {
                const d = Math.abs(newPos.y - (y + ih/2));
                if (d < minDist) {
                    minDist = d;
                    snapY = y;
                }
            });
            newPos.y = snapY + ih/2;

            // Grid Snapping (optional 1cm)
            newPos.x = Math.round(newPos.x);
            newPos.z = Math.round(newPos.z);

            draggedMesh.position.copy(newPos);
            
            // Update parent state
            onUpdatePosition?.(id, {
                x: newPos.x - iw/2,
                y: newPos.y - ih/2,
                z: newPos.z - il/2,
                rotation: item.position.rotation,
                isFlipped: item.position.isFlipped
            });
        }
    };

    const onPointerUp = () => {
        if (!sceneRef.current) return;
        sceneRef.current.draggedMesh = null;
        sceneRef.current.controls.enabled = true;
    };

    return (
        <div 
            ref={containerRef} 
            className="w-full h-full min-h-[400px] relative cursor-crosshair group"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
        >
            {/* Legend Overlay */}
            <div className="absolute top-4 right-4 flex flex-col gap-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex items-center gap-3 px-4 py-2 bg-black/40 backdrop-blur-md border border-white/10 rounded-xl">
                    <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">{tr("Orbit")}</span>
                    <span className="text-[10px] font-mono text-white/80">{tr("L-MOUSE")}</span>
                </div>
                <div className="flex items-center gap-3 px-4 py-2 bg-black/40 backdrop-blur-md border border-white/10 rounded-xl">
                    <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">{tr("Pan")}</span>
                    <span className="text-[10px] font-mono text-white/80">{tr("R-MOUSE")}</span>
                </div>
                <div className="flex items-center gap-3 px-4 py-2 bg-black/40 backdrop-blur-md border border-white/10 rounded-xl">
                    <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">{tr("Move")}</span>
                    <span className="text-[10px] font-mono text-white/80">{tr("DRAG ITEM")}</span>
                </div>
            </div>
        </div>
    );
};
