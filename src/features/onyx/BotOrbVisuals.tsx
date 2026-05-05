
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// Shaders ported from AudioOrb
const sphereVS = `
#define STANDARD
varying vec3 vViewPosition;
#ifdef USE_TRANSMISSION
  varying vec3 vWorldPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>

uniform float time;
uniform vec4 inputData;
uniform vec4 outputData;

vec3 calc( vec3 pos ) {
  vec3 dir = normalize( pos );
  return pos +
    1. * inputData.x * inputData.y * dir * (.5 + .5 * sin(inputData.z * pos.x + time)) +
    1. * outputData.x * outputData.y * dir * (.5 + .5 * sin(outputData.z * pos.y + time))
  ;
}

vec3 spherical( float r, float theta, float phi ) {
  return r * vec3(
    cos( theta ) * cos( phi ),
    sin( theta ) * cos( phi ),
    sin( phi )
  );
}

void main() {
  #include <uv_vertex>
  #include <color_vertex>
  #include <morphinstance_vertex>
  #include <morphcolor_vertex>
  #include <batching_vertex>
  #include <beginnormal_vertex>
  #include <morphnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>
  #include <normal_vertex>
  #include <begin_vertex>

  float inc = 0.001;
  float r = length( position );
  float theta = ( uv.x + 0.5 ) * 2. * PI;
  float phi = -( uv.y + 0.5 ) * PI;

  vec3 np = calc( spherical( r, theta, phi )  );
  vec3 tangent = normalize( calc( spherical( r, theta + inc, phi ) ) - np );
  vec3 bitangent = normalize( calc( spherical( r, theta, phi + inc ) ) - np );
  transformedNormal = -normalMatrix * normalize( cross( tangent, bitangent ) );
  vNormal = normalize( transformedNormal );
  transformed = np;

  #include <morphtarget_vertex>
  #include <skinning_vertex>
  #include <displacementmap_vertex>
  #include <project_vertex>
  #include <logdepthbuf_vertex>
  #include <clipping_planes_vertex>
  vViewPosition = - mvPosition.xyz;
  #include <worldpos_vertex>
  #include <shadowmap_vertex>
  #include <fog_vertex>
  #ifdef USE_TRANSMISSION
    vWorldPosition = worldPosition.xyz;
  #endif
}
`;

const backdropVS = `
precision highp float;
attribute vec3 position;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
}
`;

const backdropFS = `
precision highp float;
layout(location = 0) out vec4 fragmentColor;
uniform vec2 resolution;
uniform float rand;
void main() {
  float aspectRatio = resolution.x / resolution.y; 
  vec2 vUv = gl_FragCoord.xy / resolution;
  float noise = (fract(sin(dot(vUv, vec2(12.9898 + rand,78.233)*2.0)) * 43758.5453));
  vUv -= .5;
  vUv.x *= aspectRatio;
  float d = 4. * length(vUv);
  vec3 from = vec3(3.) / 255.;
  vec3 to = vec3(16., 12., 20.) / 2550.;
  fragmentColor = vec4(mix(from, to, d) + .005 * noise, 1.);
}
`;

export class Analyser {
    private analyser: AnalyserNode;
    private dataArray: Uint8Array;

    constructor(node: AudioNode) {
        this.analyser = node.context.createAnalyser();
        this.analyser.fftSize = 32;
        this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        node.connect(this.analyser);
    }

    update() {
        this.analyser.getByteFrequencyData(this.dataArray);
    }

    get data() {
        return this.dataArray;
    }
}

interface BotOrbVisualsProps {
    inputNode: AudioNode | null;
    outputNode: AudioNode | null;
    volumeOverride?: number;
    isProcessing?: boolean;
}

export const BotOrbVisuals: React.FC<BotOrbVisualsProps> = ({ inputNode, outputNode, volumeOverride = 0, isProcessing = false }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const requestRef = useRef<number>(null);

    useEffect(() => {
        if (!canvasRef.current || !containerRef.current) return;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x050505);

        const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
        camera.position.set(2, -2, 5);

        const renderer = new THREE.WebGLRenderer({
            canvas: canvasRef.current,
            antialias: true,
            alpha: true
        });

        const inputAnalyser = inputNode ? new Analyser(inputNode) : null;
        const outputAnalyser = outputNode ? new Analyser(outputNode) : null;

        const backdrop = new THREE.Mesh(
            new THREE.IcosahedronGeometry(10, 5),
            new THREE.RawShaderMaterial({
                uniforms: {
                    resolution: { value: new THREE.Vector2(1, 1) },
                    rand: { value: 0 },
                },
                vertexShader: backdropVS,
                fragmentShader: backdropFS,
                glslVersion: THREE.GLSL3,
                side: THREE.BackSide
            })
        );
        scene.add(backdrop);

        const sphereMaterial = new THREE.MeshStandardMaterial({
            color: 0x000000,
            metalness: 0.9,
            roughness: 0.05,
            emissive: 0x000020,
            emissiveIntensity: 3.0,
        });

        sphereMaterial.onBeforeCompile = (shader) => {
            shader.uniforms.time = { value: 0 };
            shader.uniforms.inputData = { value: new THREE.Vector4() };
            shader.uniforms.outputData = { value: new THREE.Vector4() };
            sphereMaterial.userData.shader = shader;
            shader.vertexShader = sphereVS;
        };

        const sphere = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 24), sphereMaterial);
        scene.add(sphere);

        const renderPass = new RenderPass(scene, camera);
        const bloomPass = new UnrealBloomPass(new THREE.Vector2(512, 512), 5.0, 0.5, 0.0);
        const composer = new EffectComposer(renderer);
        composer.addPass(renderPass);
        composer.addPass(bloomPass);

        let rotation = new THREE.Vector3();
        let prevTime = performance.now();

        const animate = () => {
            requestRef.current = requestAnimationFrame(animate);

            if (inputAnalyser) inputAnalyser.update();
            if (outputAnalyser) outputAnalyser.update();

            const t = performance.now();
            const dt = (t - prevTime) / 16.6;
            prevTime = t;

            backdrop.material.uniforms.rand.value = Math.random() * 1000;

            if (sphereMaterial.userData.shader) {
                const inData = inputAnalyser ? inputAnalyser.data : [0, 0, 0];
                const outData = outputAnalyser ? outputAnalyser.data : [0, 0, 0];

                // Use volumeOverride if no nodes are provided (Stable Mode)
                const outVol = outputNode ? outData[0] / 255 : volumeOverride;
                const inVol = inputNode ? inData[0] / 255 : (isProcessing ? 0.05 : 0);

                const scale = 1 + (isProcessing ? 0.2 : 0) + 0.3 * outVol + 0.1 * inVol;
                sphere.scale.setScalar(scale);
                
                rotation.x += dt * 0.01 * (outVol + 0.1);
                rotation.y += dt * 0.015 * (inVol + (isProcessing ? 0.2 : 0.05));
                
                sphere.rotation.set(rotation.x, rotation.y, rotation.z);

                sphereMaterial.userData.shader.uniforms.time.value += dt * 0.05 * (outVol + 0.1);
                sphereMaterial.userData.shader.uniforms.inputData.value.set(
                    inVol,
                    (0.1 * inData[1]) / 255,
                    (10 * inData[2]) / 255,
                    0
                );
                sphereMaterial.userData.shader.uniforms.outputData.value.set(
                    2 * outVol,
                    (0.1 * outData[1]) / 255,
                    (10 * outData[2]) / 255,
                    0
                );

                // Pulse emissive intensity during processing
                if (isProcessing) {
                    sphereMaterial.emissiveIntensity = 3.0 + Math.sin(t * 0.005) * 1.5;
                } else {
                    sphereMaterial.emissiveIntensity = 2.0 + outVol * 3.0;
                }
            }

            composer.render();
        };

        const handleResize = () => {
            if (!containerRef.current) return;
            const { clientWidth: w, clientHeight: h } = containerRef.current;
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
            composer.setSize(w, h);
            backdrop.material.uniforms.resolution.value.set(w, h);
        };

        window.addEventListener('resize', handleResize);
        handleResize();
        animate();

        return () => {
            window.removeEventListener('resize', handleResize);
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
            renderer.dispose();
            scene.clear();
        };
    }, [inputNode, outputNode]);

    return (
        <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-black/40 backdrop-blur-3xl rounded-3xl border border-white/10 shadow-2xl">
            <canvas ref={canvasRef} className="w-full h-full" />
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/60 to-transparent" />
        </div>
    );
};
