
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/**
 * Onyx Premium Visualizer
 * Optimized with ResizeObserver to ensure full-viewport coverage even when sidebars resize.
 */

const BACKDROP_VS = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const BACKDROP_FS = `
varying vec2 vUv;
uniform float time;
uniform vec3 colorFrom;
uniform vec3 colorTo;
uniform vec3 colorMid;

void main() {
    vec3 c1 = colorFrom;
    vec3 c2 = colorMid;
    vec3 c3 = colorTo;
    vec3 c4 = mix(c1, c3, 0.5) * 1.5;
    float noise = fract(sin(dot(vUv, vec2(12.9898 + time * 0.05, 78.233))) * 43758.5453);
    float m1 = sin(vUv.x * 2.0 + time * 0.1) * 0.5 + 0.5;
    float m2 = cos(vUv.y * 2.0 - time * 0.15) * 0.5 + 0.5;
    vec3 base = mix(c1, c2, m1);
    vec3 accent = mix(c3, c4, m2);
    vec3 finalColor = mix(base, accent, length(vUv - 0.5) * 2.0);
    gl_FragColor = vec4(finalColor + 0.015 * noise, 1.0);
}
`;

const SPHERE_VS = `
varying vec3 vNormal;
varying vec3 vViewPosition;
uniform float time;
uniform float intensity;

void main() {
    vNormal = normalize(normalMatrix * normal);
    vec3 pos = position;
    float d1 = sin(pos.x * 3.0 + time * 2.0) * cos(pos.y * 3.0 + time * 2.0);
    float d2 = sin(pos.z * 5.0 - time * 3.0) * 0.5;
    float displacement = (d1 + d2) * 0.1 * intensity;
    pos += normal * displacement;
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
}
`;

const SPHERE_FS = `
varying vec3 vNormal;
varying vec3 vViewPosition;
uniform float time;
uniform vec3 baseColor;
uniform vec3 accentColor;
uniform vec3 c1;
uniform vec3 c2;
uniform vec3 c3;
uniform vec3 c4;
uniform vec3 c5;
uniform vec3 c6;

vec3 hueShift(vec3 color, float hue) {
    const vec3 k = vec3(0.57735, 0.57735, 0.57735);
    float cosAngle = cos(hue);
    return color * cosAngle + cross(k, color) * sin(hue) + k * dot(k, color) * (1.0 - cosAngle);
}

void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);
    float fresnel = pow(1.0 - dot(normal, viewDir), 2.5);
    float hue = time * 0.3;
    vec3 color1 = hueShift(c1, hue);
    vec3 color2 = hueShift(c3, hue + 2.0);
    vec3 color3 = hueShift(c5, -hue * 0.5);
    vec3 color = mix(mix(color1, color2, sin(time * 0.5) * 0.5 + 0.5), 
                     mix(color3, accentColor, cos(time * 0.7) * 0.5 + 0.5), 
                     fresnel);
    vec3 core = vec3(0.01, 0.02, 0.05); 
    vec3 finalColor = mix(core, color, fresnel * 0.9);
    float glow = pow(fresnel, 3.0) * 2.0;
    float alpha = clamp(0.15 + fresnel * 0.75, 0.0, 1.0);
    gl_FragColor = vec4(finalColor + color * glow, alpha);
}
`;

interface OnyxVisualsProps {
    isProcessing?: boolean;
    tint?: string;
    volume?: number; 
    onStart?: () => void;
    onEnd?: () => void;
}

export const OnyxVisuals: React.FC<OnyxVisualsProps> = ({ isProcessing = false, tint, volume = 0, onStart, onEnd }) => {
    const mountRef = useRef<HTMLDivElement>(null);
    const procRef = useRef(isProcessing);
    const tintRef = useRef(tint);
    const volumeRef = useRef(volume);

    useEffect(() => { procRef.current = isProcessing; }, [isProcessing]);
    useEffect(() => { tintRef.current = tint; }, [tint]);
    useEffect(() => { volumeRef.current = volume; }, [volume]);

    useEffect(() => {
        if (!mountRef.current) return;
        const mount = mountRef.current;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, mount.clientWidth / mount.clientHeight, 0.1, 1000);
        camera.position.z = 4.5; // Farther camera = smaller orb

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(mount.clientWidth, mount.clientHeight);
        renderer.setClearColor(0x000000, 0);
        mount.appendChild(renderer.domElement);

        const pmremGenerator = new THREE.PMREMGenerator(renderer);
        pmremGenerator.compileEquirectangularShader();
        const envScene = new THREE.Scene();
        const envLight = new THREE.PointLight(0xffffff, 100);
        envLight.position.set(5, 5, 5);
        envScene.add(envLight);

        const backdropGeo = new THREE.IcosahedronGeometry(10, 2);
        const backdropMat = new THREE.ShaderMaterial({
            vertexShader: BACKDROP_VS,
            fragmentShader: BACKDROP_FS,
            uniforms: {
                time: { value: 0 },
                colorFrom: { value: new THREE.Color('#0A1A2F') },
                colorMid: { value: new THREE.Color('#0D2A4A') },
                colorTo: { value: new THREE.Color('#00AEEF') }
            },
            side: THREE.BackSide
        });
        const backdrop = new THREE.Mesh(backdropGeo, backdropMat);
        scene.add(backdrop);

        const geometry = new THREE.IcosahedronGeometry(1, 64);
        const material = new THREE.ShaderMaterial({
            vertexShader: SPHERE_VS,
            fragmentShader: SPHERE_FS,
            transparent: true,
            uniforms: {
                time: { value: 0 },
                intensity: { value: 0.05 },
                baseColor: { value: new THREE.Color('#00AEEF') },
                accentColor: { value: new THREE.Color('#FF00FF') },
                c1: { value: new THREE.Color('#000000') },
                c2: { value: new THREE.Color('#000000') },
                c3: { value: new THREE.Color('#000000') },
                c4: { value: new THREE.Color('#000000') },
                c5: { value: new THREE.Color('#000000') },
                c6: { value: new THREE.Color('#000000') }
            }
        });

        const sphere = new THREE.Mesh(geometry, material);
        scene.add(sphere);

        const renderPass = new RenderPass(scene, camera);
        const bloomPass = new UnrealBloomPass(
            new THREE.Vector2(mount.clientWidth, mount.clientHeight),
            2.5, 0.5, 0.7
        );

        const composer = new EffectComposer(renderer);
        composer.addPass(renderPass);
        composer.addPass(bloomPass);

        let time = 0;
        let frameId: number;

        const animate = () => {
            frameId = requestAnimationFrame(animate);
            time += 0.015;

            const root = getComputedStyle(document.documentElement);
            const c1 = new THREE.Color(root.getPropertyValue('--c1').trim() || '#000000');
            const c2 = new THREE.Color(root.getPropertyValue('--c2').trim() || '#0A1A2F');
            const c3 = new THREE.Color(root.getPropertyValue('--c3').trim() || '#00AEEF');
            const c4 = new THREE.Color(root.getPropertyValue('--c4').trim() || '#030712');
            const c5 = new THREE.Color(root.getPropertyValue('--c5').trim() || '#0D2A4A');
            const c6 = new THREE.Color(root.getPropertyValue('--c6').trim() || '#000000');

            backdropMat.uniforms.colorFrom.value.lerp(c1, 0.08);
            backdropMat.uniforms.colorMid.value.lerp(c2, 0.08);
            backdropMat.uniforms.colorTo.value.lerp(c3, 0.08);
            
            material.uniforms.c1.value.lerp(c1, 0.05);
            material.uniforms.c2.value.lerp(c2, 0.05);
            material.uniforms.c3.value.lerp(c3, 0.05);
            material.uniforms.c4.value.lerp(c4, 0.05);
            material.uniforms.c5.value.lerp(c5, 0.05);
            material.uniforms.c6.value.lerp(c6, 0.05);
            
            const currentTint = tintRef.current || getComputedStyle(document.documentElement).getPropertyValue('--main-color') || '#00AEEF';
            const targetColor = new THREE.Color(currentTint);
            const secondaryColor = new THREE.Color(targetColor).offsetHSL(0.15, 0, 0); 
            
            material.uniforms.baseColor.value.lerp(targetColor, 0.05);
            material.uniforms.accentColor.value.lerp(secondaryColor, 0.05);
            
            material.uniforms.time.value = time;
            backdropMat.uniforms.time.value = time;
            
            const baseIntensity = procRef.current ? 0.35 : 0.1;
            material.uniforms.intensity.value = baseIntensity + (volumeRef.current * 0.8);

            sphere.rotation.y += 0.005 + (volumeRef.current * 0.04);
            sphere.rotation.x += 0.002 + (volumeRef.current * 0.02);

            composer.render();
        };
        animate();

        // FIX: Use ResizeObserver instead of window resize for sidebar awareness
        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                if (width === 0 || height === 0) return;
                
                camera.aspect = width / height;
                camera.updateProjectionMatrix();
                renderer.setSize(width, height);
                composer.setSize(width, height);
                bloomPass.setSize(width, height);
            }
        });
        resizeObserver.observe(mount);

        return () => {
            cancelAnimationFrame(frameId);
            resizeObserver.disconnect();
            if (mount.contains(renderer.domElement)) {
                mount.removeChild(renderer.domElement);
            }
            renderer.dispose();
            geometry.dispose();
            material.dispose();
        };
    }, []);

    return (
        <div 
            ref={mountRef} 
            onMouseDown={onStart}
            onMouseUp={onEnd}
            onMouseLeave={onEnd}
            className="w-full h-full cursor-pointer transition-opacity duration-1000 overflow-hidden"
            style={{ touchAction: 'none' }}
        />
    );
};
