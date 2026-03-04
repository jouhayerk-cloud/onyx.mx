
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { useAtom, useSetAtom, useAtomValue, useStore } from 'jotai/react';
import {
    workbookShippingCratesAtom,
    shippingTruckDimsAtom,
    workbookShippingCameraViewAtom,
    workbookSelectedCrateIdAtom,
    workbookShippingViewModeAtom,
    workbookIsShippingSidebarCollapsedAtom,
    workbookAreCrateInfoLabelsVisibleAtom,
    workbookTempCratePositionAtom,
    workbookCratesVersionAtom,
    userAtom,
    WAREHOUSE_DIMS,
    themeAtom,
} from '../../lib/atoms';
import { SCRIPT_URL, vendors } from '../../lib/consts';
import { WorkbookShippingControl } from './WorkbookShippingControl';
import toast from 'react-hot-toast';
import { gsap } from 'gsap';
import { Crate } from '../../lib/Types';

const getTextColorForBg = (hexColor: string | undefined): string => {
    if (!hexColor) return '#000000';
    try {
        const rgb = parseInt(hexColor.substring(1), 16);
        const r = (rgb >> 16) & 0xff;
        const g = (rgb >> 8) & 0xff;
        const b = (rgb >> 0) & 0xff;
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        return luma < 128 ? '#FFFFFF' : '#000000';
    } catch {
        return '#000000';
    }
}

const themeColors: { [key: string]: { bg: number, fog: number } } = {
    concrete: { bg: 0x222222, fog: 0x222222 },
    nacar: { bg: 0xdbe2e1, fog: 0xdbe2e1 },
    orange: { bg: 0xd4cec6, fog: 0xd4cec6 },
    cherry: { bg: 0xe7d8d7, fog: 0xe7d8d7 },
    forest: { bg: 0x2a3025, fog: 0x2a3025 },
    terra: { bg: 0x343e40, fog: 0x343e40 },
    calcite: { bg: 0x415e8e, fog: 0x415e8e },
    fluorite: { bg: 0x4c5069, fog: 0x4c5069 },
};


export function WorkbookShippingView() {
    const canvasContainerRef = useRef<HTMLDivElement>(null);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useAtom(workbookIsShippingSidebarCollapsedAtom);

    const ThreeScene = () => {
        const mountRef = useRef<HTMLDivElement>(null);
        const setCrates = useSetAtom(workbookShippingCratesAtom);
        const cratesVersion = useAtomValue(workbookCratesVersionAtom);
        const user = useAtomValue(userAtom);
        const store = useStore();

        useEffect(() => {
            const fetchCrates = async () => {
                try {
                    const response = await fetch(SCRIPT_URL, {
                        method: 'POST', body: JSON.stringify({ action: 'getCrates', user, source: 'workbook' }),
                    });
                    const result = await response.json();
                    if (result.status === 'success') {
                        setCrates(result.data);
                    } else {
                        throw new Error(result.message);
                    }
                } catch (error: any) {
                    toast.error(`Failed to load workbook crates: ${error.message}`);
                }
            };
            fetchCrates();
        }, [cratesVersion, user, setCrates]);

        useEffect(() => {
            if (!mountRef.current) return;
            const mount = mountRef.current;
            mount.innerHTML = '';

            let animationFrameId: number;

            const theme = store.get(themeAtom);
            const colors = themeColors[theme] || themeColors.concrete;

            const scene = new THREE.Scene();
            scene.background = new THREE.Color(colors.bg);
            scene.fog = new THREE.Fog(colors.fog, 20, 50);

            const camera = new THREE.PerspectiveCamera(50, mount.clientWidth / mount.clientHeight, 0.1, 1000);

            const renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(mount.clientWidth, mount.clientHeight);
            renderer.setPixelRatio(window.devicePixelRatio);
            mount.appendChild(renderer.domElement);

            const labelRenderer = new CSS2DRenderer();
            labelRenderer.setSize(mount.clientWidth, mount.clientHeight);
            labelRenderer.domElement.style.position = 'absolute';
            labelRenderer.domElement.style.top = '0px';
            labelRenderer.domElement.style.pointerEvents = 'none';
            mount.appendChild(labelRenderer.domElement);

            const controls = new OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;

            scene.add(new THREE.AmbientLight(0x666666));
            const dirLight = new THREE.DirectionalLight(0xffffff, 1);
            dirLight.position.set(20, 30, 15);
            scene.add(dirLight);

            const raycaster = new THREE.Raycaster();
            const mouse = new THREE.Vector2();

            const crateMeshes = new Map<string, THREE.Group>();
            const crateLabels = new Map<string, CSS2DObject>();

            const WAREHOUSE_DIMS_VAL = store.get(WAREHOUSE_DIMS);
            const truckDims = store.get(shippingTruckDimsAtom);

            const warehouseFloor = new THREE.GridHelper(WAREHOUSE_DIMS_VAL.depth, WAREHOUSE_DIMS_VAL.depth / (WAREHOUSE_DIMS_VAL.width / 2), 0x555555, 0x444444);
            scene.add(warehouseFloor);

            const truckContainer = new THREE.LineSegments(
                new THREE.EdgesGeometry(new THREE.BoxGeometry(truckDims.length, truckDims.height, truckDims.width)),
                new THREE.LineBasicMaterial({ color: 0xaaaaaa })
            );
            const truckPositionZ = (WAREHOUSE_DIMS_VAL.depth / 2) + (truckDims.width / 2) + 0.5;
            truckContainer.position.set(0, truckDims.height / 2, truckPositionZ);
            scene.add(truckContainer);

            const createCrateSideTexture = (crate: Crate) => {
                const canvas = document.createElement('canvas');
                const size = 512;
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d')!;
                const vendorColor = crate.vendorId ? (vendors[crate.vendorId as keyof typeof vendors]?.color || '#999999') : '#999999';
                ctx.fillStyle = vendorColor;
                ctx.fillRect(0, 0, size, size);
                const textColor = getTextColorForBg(vendorColor);
                ctx.fillStyle = textColor;
                ctx.textAlign = 'center';
                ctx.font = 'bold 52px "DM Sans"';
                ctx.fillText(crate.id, size / 2, 70);
                ctx.font = '32px "DM Sans"';
                ctx.fillText(`Weight: ${crate.weight.toFixed(1)} kg`, size / 2, 120);
                ctx.textAlign = 'left';
                ctx.font = 'bold 28px "DM Sans"';
                let yPos = 180;
                ctx.fillText(`Contents: (${crate.inventoryItems.length})`, 30, yPos);
                yPos += 40;
                ctx.font = '24px "DM Sans"';
                crate.inventoryItems.slice(0, 8).forEach(item => {
                    if (yPos > size - 40) return;
                    ctx.fillText(`${item.itemId}-${item.itemNumber}: ${item.shape}`, 40, yPos);
                    yPos += 34;
                });
                if (crate.inventoryItems.length > 8) ctx.fillText(`...and ${crate.inventoryItems.length - 8} more`, 40, yPos);
                return new THREE.CanvasTexture(canvas);
            };

            const createCrateMesh = (crate: Crate) => {
                const group = new THREE.Group();
                const geometry = new THREE.BoxGeometry(crate.w, crate.h, crate.d);
                const sideTexture = createCrateSideTexture(crate);
                const infoMaterial = new THREE.MeshLambertMaterial({ map: sideTexture });
                const baseMaterial = new THREE.MeshLambertMaterial({ color: crate.vendorId ? (vendors[crate.vendorId as keyof typeof vendors]?.color || '#999999') : '#999999' });
                const mesh = new THREE.Mesh(geometry, [infoMaterial, infoMaterial, baseMaterial, baseMaterial, infoMaterial, infoMaterial]);
                mesh.name = 'crate_mesh_body';
                group.add(mesh);
                group.userData.crateId = crate.id;
                crateMeshes.set(crate.id, group);
                scene.add(group);
            };

            const createCrateLabel = (crate: Crate) => {
                const div = document.createElement('div');
                div.className = 'crate-content-label';
                div.innerHTML = `<h4>${crate.id}</h4><p class="crate-stats"><strong>${crate.inventoryItems.length} items</strong> | ${crate.weight.toFixed(1)}kg</p>`;
                const label = new CSS2DObject(div);
                crateLabels.set(crate.id, label);
                scene.add(label);
            };

            const animate = () => {
                animationFrameId = requestAnimationFrame(animate);
                controls.update();
                renderer.render(scene, camera);
                labelRenderer.render(scene, camera);
            };

            const onCanvasClick = (event: MouseEvent) => {
                const rect = renderer.domElement.getBoundingClientRect();
                mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
                mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
                raycaster.setFromCamera(mouse, camera);
                const intersects = raycaster.intersectObjects(scene.children, true);
                const clickedCrate = intersects.find(i => i.object.name === 'crate_mesh_body');
                store.set(workbookSelectedCrateIdAtom, clickedCrate ? clickedCrate.object.parent?.userData.crateId : null);
            };

            const handleResize = () => {
                camera.aspect = mount.clientWidth / mount.clientHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(mount.clientWidth, mount.clientHeight);
                labelRenderer.setSize(mount.clientWidth, mount.clientHeight);
            };

            mount.addEventListener('click', onCanvasClick);
            window.addEventListener('resize', handleResize);
            const unsub = store.sub(workbookShippingCratesAtom, () => {
                const crates = store.get(workbookShippingCratesAtom);
                const allCrateIdsInState = new Set(crates.map(c => c.id));
                const allCrateMeshesInScene = new Set(crateMeshes.keys());
                for (const crateId of allCrateMeshesInScene) {
                    if (!allCrateIdsInState.has(crateId)) {
                        scene.remove(crateMeshes.get(crateId)!);
                        crateMeshes.delete(crateId);
                        scene.remove(crateLabels.get(crateId)!);
                        crateLabels.delete(crateId);
                    }
                }
                crates.forEach(crate => {
                    if (!crateMeshes.has(crate.id)) {
                        createCrateMesh(crate);
                        createCrateLabel(crate);
                    }
                });
            });

            const updateVisuals = () => {
                const crates = store.get(workbookShippingCratesAtom);
                const selectedId = store.get(workbookSelectedCrateIdAtom);
                const tempPos = store.get(workbookTempCratePositionAtom);
                const labelsVisible = store.get(workbookAreCrateInfoLabelsVisibleAtom);

                crates.forEach(crate => {
                    const meshGroup = crateMeshes.get(crate.id);
                    const label = crateLabels.get(crate.id);
                    if (!meshGroup || !label) return;

                    let position = new THREE.Vector3(crate.x, crate.y + crate.h / 2, crate.z);
                    if (crate.id === selectedId && tempPos && crate.location === 'truck') {
                        position.set(tempPos.x, tempPos.y + crate.h / 2, tempPos.z + truckContainer.position.z);
                    }
                    meshGroup.position.copy(position);
                    meshGroup.rotation.y = crate.rotationY || 0;
                    label.position.set(position.x, 0, position.z);

                    label.visible = labelsVisible && crate.location === 'warehouse';

                    const mesh = meshGroup.children[0] as THREE.Mesh;
                    const isSelected = crate.id === selectedId;
                    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

                    materials.forEach(m => {
                        if ((m as THREE.Material).hasOwnProperty('wireframe')) {
                            (m as THREE.MeshLambertMaterial).wireframe = false;
                        }
                        m.opacity = 1;
                        m.transparent = false;
                        const emissiveMaterial = m as THREE.MeshLambertMaterial;
                        if (emissiveMaterial.emissive) {
                            emissiveMaterial.emissive.setHex(isSelected ? 0x555555 : 0x000000);
                        }
                    });
                });
            };

            const updateCamera = () => {
                const view = store.get(workbookShippingCameraViewAtom);
                const viewMode = store.get(workbookShippingViewModeAtom);
                const selectedId = store.get(workbookSelectedCrateIdAtom);
                const crates = store.get(workbookShippingCratesAtom);
                const selectedCrate = crates.find(c => c.id === selectedId);

                let target = new THREE.Vector3(0, 1, 0);
                let distance = 20;

                if (viewMode === 'truck') {
                    target.set(0, truckDims.height / 2, truckContainer.position.z);
                    distance = truckDims.length * 1.2;
                }

                if (selectedCrate) {
                    target.set(selectedCrate.x, selectedCrate.y + selectedCrate.h / 2, selectedCrate.z);
                    const isRotated = selectedCrate.rotationY && Math.abs(selectedCrate.rotationY - Math.PI / 2) < 0.01;
                    const w = isRotated ? selectedCrate.d : selectedCrate.w;
                    const d = isRotated ? selectedCrate.w : selectedCrate.d;
                    distance = Math.max(w, selectedCrate.h, d) * 3;
                }

                let position = new THREE.Vector3();
                switch (view) {
                    case 'top': position.set(target.x, target.y + distance, target.z + 0.001); break;
                    case 'side': position.set(target.x + distance, target.y, target.z); break;
                    case 'front': position.set(target.x, target.y, target.z + distance); break;
                    default: position.set(target.x + distance * 0.7, target.y + distance * 0.6, target.z + distance * 0.7); break;
                }

                gsap.to(camera.position, { ...position, duration: 0.8, ease: "power2.inOut" });
                gsap.to(controls.target, { ...target, duration: 0.8, ease: "power2.inOut" });
            };

            const unsubTheme = store.sub(themeAtom, () => {
                const newTheme = store.get(themeAtom);
                const newColors = themeColors[newTheme] || themeColors.concrete;
                const newBgColor = new THREE.Color(newColors.bg);
                gsap.to(scene.background as THREE.Color, { r: newBgColor.r, g: newBgColor.g, b: newBgColor.b, duration: 0.5 });
                const newFogColor = new THREE.Color(newColors.fog);
                gsap.to(scene.fog!.color, { r: newFogColor.r, g: newFogColor.g, b: newFogColor.b, duration: 0.5 });
            });
            updateCamera();

            const unsub1 = store.sub(workbookShippingCratesAtom, updateVisuals);
            const unsub2 = store.sub(workbookSelectedCrateIdAtom, updateVisuals);
            const unsub3 = store.sub(workbookTempCratePositionAtom, updateVisuals);
            const unsub4 = store.sub(workbookAreCrateInfoLabelsVisibleAtom, updateVisuals);

            const unsubCam1 = store.sub(workbookShippingCameraViewAtom, updateCamera);
            const unsubCam2 = store.sub(workbookShippingViewModeAtom, updateCamera);
            const unsubCam3 = store.sub(workbookSelectedCrateIdAtom, updateCamera);

            animate();

            return () => {
                unsub(); unsub1(); unsub2(); unsub3(); unsub4();
                unsubCam1(); unsubCam2(); unsubCam3();
                unsubTheme();
                window.removeEventListener('resize', handleResize);
                mount.removeEventListener('click', onCanvasClick);
                cancelAnimationFrame(animationFrameId);
                controls.dispose();
                scene.traverse(obj => {
                    if (obj instanceof THREE.Mesh) {
                        obj.geometry.dispose();
                        if (Array.isArray(obj.material)) {
                            obj.material.forEach(m => {
                                if (m.map) m.map.dispose();
                                m.dispose();
                            });
                        } else if (obj.material) {
                            if ((obj.material as any).map) (obj.material as any).map.dispose();
                            (obj.material as any).dispose();
                        }
                    }
                });
                renderer.dispose();
                labelRenderer.domElement.remove();
                if (mount) mount.innerHTML = '';
            };
        }, [cratesVersion, user, setCrates, store]);

        return <div ref={mountRef} className="w-full h-full" />;
    };

    return (
        <div className={`shipping-view-container ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
            <WorkbookShippingControl isVisible={!isSidebarCollapsed} />
            <main className="shipping-main">
                <button
                    onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                    className="button shipping-sidebar-toggle !p-2.5 !min-h-0"
                    title={isSidebarCollapsed ? 'Show Controls' : 'Hide Controls'}
                >
                    <svg className={`w-5 h-5 transition-transform ${isSidebarCollapsed ? '' : 'transform rotate-180'}`}><use href="#layout-sidebar-right"></use></svg>
                </button>
                <div ref={canvasContainerRef} id="canvasContainer" className="w-full h-full">
                    <ThreeScene />
                </div>
            </main>
        </div>
    );
}
