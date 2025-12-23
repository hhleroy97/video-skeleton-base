'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { useEffect, useMemo, useRef } from 'react';
import type { Hand3DData } from './HandTracking';
import { landmarkToSceneSpace } from './handPose';
import { twistAroundAxis } from './prismMath';

interface PrismHandVisualProps {
  hands: Hand3DData[];
  className?: string;
  controls?: PrismHandControls;
}

export interface PrismHandControls {
  spinBase: number; // rad/sec
  spinPinch: number; // rad/sec added at full pinch
  twistBase: number; // radians
  twistPinch: number; // radians added at full pinch
  hueSpeed: number; // cycles/sec
  opacity: number; // 0..1
  curveTension: number; // 0..1
}

export const DEFAULT_PRISM_HAND_CONTROLS: PrismHandControls = {
  spinBase: 0.45,
  spinPinch: 0.75,
  twistBase: Math.PI * 0.55,
  twistPinch: Math.PI * 1.1,
  hueSpeed: 0.04, // cycles/sec
  opacity: 0.85,
  curveTension: 0.35,
};

// Same landmark connection topology as the skeleton view
const HAND_CONNECTIONS: Array<[number, number]> = [
  // Thumb
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  // Index finger
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  // Middle finger
  [0, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  // Ring finger
  [0, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  // Pinky
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  // Palm
  [5, 9],
  [9, 13],
  [13, 17],
];

function PrismHandScene({ hands, controls }: { hands: Hand3DData[]; controls: PrismHandControls }) {
  const groupRef = useRef<THREE.Group>(null);

  const maxHands = 2;
  const landmarkCount = 21;
  const trailLength = 64; // more points = less quantized/steppy trails

  // history[handIndex][landmarkIndex] = Vector3[]
  const historyRef = useRef<Array<Array<THREE.Vector3[]>>>([]);
  const linesRef = useRef<Array<Array<THREE.Line>>>([]);

  const lineMaterial = useMemo(() => {
    // “Glassy” feel via additive blending + bright gradients
    return new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: controls.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }, [controls.opacity]);

  useEffect(() => {
    if (!groupRef.current) return;

    // Init structures
    historyRef.current = Array.from({ length: maxHands }, () =>
      Array.from({ length: landmarkCount }, () => [])
    );
    linesRef.current = Array.from({ length: maxHands }, () => []);

    // Clear any existing children
    while (groupRef.current.children.length) {
      groupRef.current.remove(groupRef.current.children[0]!);
    }

    for (let handIndex = 0; handIndex < maxHands; handIndex++) {
      const lineList: THREE.Line[] = [];
      for (let lmIndex = 0; lmIndex < landmarkCount; lmIndex++) {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(trailLength * 3);
        const colors = new Float32Array(trailLength * 3);
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const line = new THREE.Line(geometry, lineMaterial);
        line.frustumCulled = false;
        groupRef.current.add(line);
        lineList.push(line);
      }
      linesRef.current[handIndex] = lineList;
    }
  }, [lineMaterial]);

  const tmpAxis = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const tmpCenter = useMemo(() => new THREE.Vector3(), []);
  const tmpP = useMemo(() => new THREE.Vector3(), []);
  const tmpColor = useMemo(() => new THREE.Color(), []);
  const curveRef = useRef(new THREE.CatmullRomCurve3([]));
  const samplesRef = useRef<THREE.Vector3[]>([]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    for (let handIndex = 0; handIndex < maxHands; handIndex++) {
      const hand = hands[handIndex];
      const historyHand = historyRef.current[handIndex];
      const linesHand = linesRef.current[handIndex];
      if (!historyHand || !linesHand) continue;

      if (!hand || hand.landmarks.length < landmarkCount) {
        // Clear trails when no hand (prevents “stuck” streaks)
        for (let i = 0; i < landmarkCount; i++) historyHand[i] = [];
        continue;
      }

      // Scene-space points
      const pts = hand.landmarks.map((lm) => landmarkToSceneSpace(lm, 2));

      // Forearm-ish axis: wrist -> middle MCP (0 -> 9)
      tmpCenter.copy(pts[0] ?? new THREE.Vector3());
      tmpAxis.copy(pts[9] ?? tmpCenter).sub(tmpCenter);
      if (tmpAxis.lengthSq() < 1e-8) tmpAxis.set(0, 1, 0);
      tmpAxis.normalize();

      // Pinch intensity controls twist + brightness
      const pinch = (pts[4] && pts[8]) ? pts[4].distanceTo(pts[8]) : 0.2;
      const pinchFactor = THREE.MathUtils.clamp(1 - pinch * 2.5, 0, 1);

      const baseHue = hand.handedness === 'Left' ? 0.02 : hand.handedness === 'Right' ? 0.62 : 0.12;
      // Softer motion: less intense spin + twist
      const spin = controls.spinBase + pinchFactor * controls.spinPinch; // rad/sec
      const twistStrength = controls.twistBase + pinchFactor * controls.twistPinch;

      for (let lmIndex = 0; lmIndex < landmarkCount; lmIndex++) {
        const p = pts[lmIndex];
        if (!p) continue;

        // push history
        const h = historyHand[lmIndex];
        h.push(p.clone());
        if (h.length > trailLength) h.shift();

        const line = linesHand[lmIndex];
        const geom = line.geometry as THREE.BufferGeometry;
        const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;
        const colAttr = geom.getAttribute('color') as THREE.BufferAttribute;

        // Less quantized: resample a smooth curve across history
        // (instead of using the raw discrete points directly)
        if (h.length >= 4) {
          curveRef.current.points = h;
          curveRef.current.closed = false;
          curveRef.current.curveType = 'catmullrom';
          curveRef.current.tension = THREE.MathUtils.clamp(controls.curveTension, 0, 1);
          samplesRef.current = curveRef.current.getPoints(trailLength - 1);
        } else {
          samplesRef.current = h.slice();
        }

        // write from tail -> head (oldest -> newest)
        for (let k = 0; k < trailLength; k++) {
          const age = trailLength <= 1 ? 0 : k / (trailLength - 1); // 0 tail .. 1 head
          const src = samplesRef.current[Math.min(samplesRef.current.length - 1, k)];

          if (!src) {
            posAttr.setXYZ(k, 9999, 9999, 9999);
            colAttr.setXYZ(k, 0, 0, 0);
            continue;
          }

          // Spiral: older points twist more; smooth falloff reduces “banding”
          const falloff = Math.pow(1 - age, 1.35);
          // Softer ramp-up: keep tail from spinning disproportionately faster than the head.
          const omega = spin * (0.35 + 0.35 * falloff); // effective angular speed for this point
          const angle = falloff * twistStrength + t * omega;
          tmpP.copy(twistAroundAxis(src, tmpCenter, tmpAxis, angle));

          posAttr.setXYZ(k, tmpP.x, tmpP.y, tmpP.z);

          // Gradient: shifts by landmark, age, and time
          // Tie hue cycling rate to spin speed: faster spinning points change color faster.
          const hueTime = (t * controls.hueSpeed * (1 + omega * 0.25)) % 1;
          const hue = (baseHue + hueTime + lmIndex / landmarkCount * 0.18 + age * 0.08) % 1;
          const sat = 0.55 + pinchFactor * 0.25;
          const light = 0.15 + age * 0.85;
          tmpColor.setHSL(hue, sat, light);
          // tail fade
          tmpColor.multiplyScalar(0.25 + age * 0.95);
          colAttr.setXYZ(k, tmpColor.r, tmpColor.g, tmpColor.b);
        }

        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
      }
    }
  });

  return (
    <>
      <ambientLight intensity={0.25} />
      <directionalLight position={[3, 4, 2]} intensity={1.2} />
      <directionalLight position={[-3, -2, 1]} intensity={0.6} />
      <Environment preset="city" />
      <group ref={groupRef} />
    </>
  );
}

export function PrismHandVisual({ hands, className = '', controls }: PrismHandVisualProps) {
  const mergedControls = useMemo(
    () => ({ ...DEFAULT_PRISM_HAND_CONTROLS, ...(controls ?? {}) }),
    [controls]
  );
  return (
    <div className={`w-full h-full bg-black ${className}`}>
      <Canvas
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
          gl.setClearColor(0x000000, 1);
        }}
      >
        <PerspectiveCamera makeDefault position={[0, 0.2, 2.2]} fov={45} />
        <PrismHandScene hands={hands} controls={mergedControls} />

        <OrbitControls
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          minDistance={1}
          maxDistance={6}
          target={[0, 0, 0]}
        />
      </Canvas>
    </div>
  );
}

