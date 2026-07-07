import re

with open('src/features/logistics/TruckingModule.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

pattern = r"(const InteractiveTruckViewer: React\.FC<\{.*?\}> = \(\{.*?\}\) => \{.*?const sceneRef = useRef<\{.*?\} \| null>\(null\);)(.*?)(\n    return <div ref=\{containerRef\} className=\"w-full h-full cursor-pointer\" />;\n\};)"

match = re.search(pattern, content, re.DOTALL)
if not match:
    print("Failed to match InteractiveTruckViewer!")
    exit(1)

prefix = match.group(1)
use_effect_code = match.group(2)
suffix = match.group(3)

new_use_effect = """
    // 1. Initialize Scene (Run Once)
    useEffect(() => {
        if (!containerRef.current) return;
        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;

        const scene = new THREE.Scene();
        scene.background = null;

        const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 1000);
        camera.position.set(30, 20, 30);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        containerRef.current.appendChild(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.maxPolarAngle = Math.PI / 2.1;
        controls.minDistance = 5;
        controls.maxDistance = 60;

        scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const sun = new THREE.DirectionalLight(0xffffff, 0.8);
        sun.position.set(20, 40, 20);
        sun.castShadow = true;
        sun.shadow.mapSize.width = 2048;
        sun.shadow.mapSize.height = 2048;
        scene.add(sun);
        
        const bedGeo = new THREE.BoxGeometry(16.15, 0.1, 2.44);
        const bedMat = new THREE.MeshStandardMaterial({ 
            color: 0x1a1c24, 
            metalness: 0.8, 
            roughness: 0.2,
            envMapIntensity: 1.0
        });
        const bed = new THREE.Mesh(bedGeo, bedMat);
        bed.receiveShadow = true;
        bed.position.y = -0.05;
        scene.add(bed);

        const cratesMap = new Map<string, THREE.Mesh>();
        sceneRef.current = { scene, camera, renderer, controls, crates: cratesMap };

        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();

        const handleClick = (event: MouseEvent) => {
            if (!containerRef.current || !sceneRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

            raycaster.setFromCamera(mouse, sceneRef.current.camera);
            const meshes = Array.from(sceneRef.current.crates.values());
            const intersects = raycaster.intersectObjects(meshes);

            if (intersects.length > 0) {
                const mesh = intersects[0].object as THREE.Mesh;
                let foundId = null;
                for (const [id, m] of sceneRef.current.crates.entries()) {
                    if (m === mesh) { foundId = id; break; }
                }
                if (foundId) {
                    onSelect(foundId);
                    const targetTarget = mesh.position.clone();
                    const targetCam = targetTarget.clone().add(new THREE.Vector3(8, 6, 8));
                    gsap.to(sceneRef.current.controls.target, { x: targetTarget.x, y: targetTarget.y, z: targetTarget.z, duration: 1.2, ease: "power3.inOut" });
                    gsap.to(sceneRef.current.camera.position, { x: targetCam.x, y: targetCam.y, z: targetCam.z, duration: 1.2, ease: "power3.inOut" });
                }
            } else {
                onSelect(null);
                gsap.to(sceneRef.current.controls.target, { x: 0, y: 0, z: 0, duration: 1.2, ease: "power3.inOut" });
                gsap.to(sceneRef.current.camera.position, { x: 30, y: 20, z: 30, duration: 1.2, ease: "power3.inOut" });
            }
        };

        containerRef.current.addEventListener('click', handleClick);

        let animationId: number;
        const animate = () => {
            if (!sceneRef.current) return;
            animationId = requestAnimationFrame(animate);
            sceneRef.current.controls.update();
            sceneRef.current.renderer.render(sceneRef.current.scene, sceneRef.current.camera);
        };
        animate();

        let timeoutId: number;
        const handleResize = () => {
            clearTimeout(timeoutId);
            timeoutId = window.setTimeout(() => {
                if (!containerRef.current || !sceneRef.current) return;
                const w = containerRef.current.clientWidth;
                const h = containerRef.current.clientHeight;
                sceneRef.current.camera.aspect = w / h;
                sceneRef.current.camera.updateProjectionMatrix();
                sceneRef.current.renderer.setSize(w, h);
            }, 100) as unknown as number;
        };
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            clearTimeout(timeoutId);
            cancelAnimationFrame(animationId);
            if (containerRef.current) {
                containerRef.current.removeEventListener('click', handleClick);
                if (renderer.domElement && containerRef.current.contains(renderer.domElement)) {
                    containerRef.current.removeChild(renderer.domElement);
                }
            }
            renderer.dispose();
            sceneRef.current = null;
        };
    }, [onSelect]);

    // 2. Sync Meshes (Run on data change)
    useEffect(() => {
        if (!sceneRef.current) return;
        const { scene, crates } = sceneRef.current;

        // Remove deleted crates
        const currentIds = new Set(truckCrates.map(c => c.id));
        for (const [id, mesh] of Array.from(crates.entries())) {
            if (!currentIds.has(id)) {
                scene.remove(mesh);
                crates.delete(id);
            }
        }

        // Add or Update crates
        truckCrates.forEach(c => {
            const pos = positions[c.id];
            if (!pos) return;
            
            const dw = c.width_cm / 100;
            const dl = c.length_cm / 100;
            const dh = (c.height_cm || 100) / 100;
            const isRotated = pos.r === 90;
            
            const targetX = (pos.x / 100) - (16.15 / 2) + (isRotated ? dw : dl) / 2;
            const targetY = (pos.z || 0)/100 + dh/2 + 0.01;
            const targetZ = (pos.y / 100) - (2.44 / 2) + (isRotated ? dl : dw) / 2;
            
            let mesh = crates.get(c.id);
            
            if (!mesh) {
                const geo = new THREE.BoxGeometry(isRotated ? dw : dl, dh, isRotated ? dl : dw);
                const col = vendors[c.vendor_id as keyof typeof vendors]?.color || '#F97316';
                const mat = new THREE.MeshStandardMaterial({ 
                    color: col, metalness: 0.1, roughness: 0.6, transparent: true, opacity: 0.95 
                });
                mesh = new THREE.Mesh(geo, mat);
                mesh.castShadow = true; mesh.receiveShadow = true;
                
                const edges = new THREE.LineSegments(
                    new THREE.EdgesGeometry(geo),
                    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2 })
                );
                mesh.add(edges);
                
                mesh.position.set(targetX, targetY, targetZ);
                scene.add(mesh);
                crates.set(c.id, mesh);
            } else {
                // Update position with GSAP for smooth drag
                gsap.to(mesh.position, { x: targetX, y: targetY, z: targetZ, duration: 0.3, ease: 'power2.out' });
                
                // Update geometry if rotated (simple approach: swap scale)
                if (isRotated) {
                    mesh.scale.set(dl / dw, 1, dw / dl);
                } else {
                    mesh.scale.set(1, 1, 1);
                }
            }
        });
        
    }, [truckCrates, positions]);

    useEffect(() => {
        if (!sceneRef.current) return;
        if (selectedId) {
            const sel = allCrates.find(c => c.id === selectedId);
            if (sel) {
                const itemIds = sel.inventory_ids 
                    ? sel.inventory_ids.split(',').filter(Boolean).map((e: string) => e.split(':')[0])
                    : (sel.inventoryItems || []).map((i: any) => i.row);

                setInventoryArtifactConfig({
                    isOpen: true,
                    itemIds,
                    title: `Crate: ${getCrateDisplayName(sel, allCrates, allInventory).label || sel.id}`,
                    viewMode: 'sidebar'
                });
            }
        } else {
            setInventoryArtifactConfig(prev => ({ ...prev, isOpen: false }));
        }
    }, [selectedId, allCrates, allInventory, setInventoryArtifactConfig]);
"""

new_content = prefix + new_use_effect + suffix

with open('src/features/logistics/TruckingModule.tsx', 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Successfully updated InteractiveTruckViewer!")
