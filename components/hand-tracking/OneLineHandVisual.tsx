'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Line } from '@react-three/drei';
import * as THREE from 'three';
import { useMemo, useRef } from 'react';
import type { Hand3DData } from './HandTracking';
import { landmarkToSceneSpace } from './handPose';

export interface OneLineHandControls {
  noiseAmount: number;    // 0..1 perpendicular displacement
  noiseScale: number;     // frequency of noise along path
  drawSpeed: number;      // how fast the line "draws" (0 = instant, 1 = slow reveal)
  lineWidth: number;      // thickness
  loopTightness: number;  // 0 = go all the way back, 1 = tight U-turns
}

export const DEFAULT_ONE_LINE_CONTROLS: OneLineHandControls = {
  noiseAmount: 0.015,
  noiseScale: 8,
  drawSpeed: 0,
  lineWidth: 2.5,
  loopTightness: 0.3,
};

interface OneLineHandVisualProps {
  hands: Hand3DData[];
  className?: string;
  controls?: Partial<OneLineHandControls>;
}

/**
 * The "drawing order" for a single continuous stroke through all 21 landmarks.
 * We traverse out to each fingertip and partially back to create a flowing path.
 */
const BASE_PATH_ORDER: number[] = [
  // Wrist to thumb tip and back
  0, 1, 2, 3, 4, 3, 2, 1,
  // To index
  0, 5, 6, 7, 8, 7, 6, 5,
  // To middle
  9, 10, 11, 12, 11, 10, 9,
  // To ring
  13, 14, 15, 16, 15, 14, 13,
  // To pinky
  17, 18, 19, 20,
  // Close back through palm
  17, 13, 9, 5, 0,
];

// Simple deterministic noise (hash-based)
function noise1D(x: number): number {
  const xi = Math.floor(x);
  const xf = x - xi;
  const smooth = xf * xf * (3 - 2 * xf); // smoothstep
  const hash = (n: number) => {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  return hash(xi) * (1 - smooth) + hash(xi + 1) * smooth;
}

function noise2D(x: number, y: number): number {
  return (noise1D(x + y * 57.0) + noise1D(y + x * 131.0)) * 0.5;
}

function OneLineScene({
  hands,
  controls,
}: {
  hands: Hand3DData[];
  controls: OneLineHandControls;
}) {
  const { noiseAmount, noiseScale, drawSpeed, lineWidth, loopTightness } = controls;
  const timeRef = useRef(0);
  const { clock } = useThree();

  // Resample count for smooth curve
  const sampleCount = 200;

  // We'll store computed points per hand
  const linePointsRef = useRef<THREE.Vector3[][]>([[], []]);
  const lineColorsRef = useRef<THREE.Color[][]>([[], []]);

  // Pre-allocate
  useMemo(() => {
    for (let h = 0; h < 2; h++) {
      linePointsRef.current[h] = Array.from({ length: sampleCount }, () => new THREE.Vector3());
      lineColorsRef.current[h] = Array.from({ length: sampleCount }, () => new THREE.Color());
    }
  }, [sampleCount]);

  const tmpVec = useMemo(() => new THREE.Vector3(), []);
  const tmpTangent = useMemo(() => new THREE.Vector3(), []);
  const tmpNormal = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    timeRef.current = clock.getElapsedTime();
    const t = timeRef.current;

    for (let handIndex = 0; handIndex < 2; handIndex++) {
      const hand = hands[handIndex];
      const pts = linePointsRef.current[handIndex]!;
      const cols = lineColorsRef.current[handIndex]!;

      if (!hand) {
        // Park points off-screen
        for (let i = 0; i < sampleCount; i++) {
          pts[i].set(9999, 9999, 9999);
        }
        continue;
      }

      // Convert landmarks to scene space
      const landmarks = hand.landmarks.map((lm) => landmarkToSceneSpace(lm, 2));

      // Build the raw path from BASE_PATH_ORDER
      // loopTightness affects how far back we go on each finger
      const rawPath: THREE.Vector3[] = [];
      for (let i = 0; i < BASE_PATH_ORDER.length; i++) {
        const idx = BASE_PATH_ORDER[i];
        const lm = landmarks[idx];
        if (lm) rawPath.push(lm.clone());
      }

      if (rawPath.length < 2) {
        for (let i = 0; i < sampleCount; i++) pts[i].set(9999, 9999, 9999);
        continue;
      }

      // Create CatmullRom curve
      const curve = new THREE.CatmullRomCurve3(rawPath, false, 'catmullrom', 0.5);

      // Determine draw progress (for animated reveal)
      let drawProgress = 1;
      if (drawSpeed > 0) {
        drawProgress = Math.min(1, (t * (1.1 - drawSpeed)) % 2);
        if (drawProgress > 1) drawProgress = 2 - drawProgress; // ping-pong
      }

      const visibleSamples = Math.floor(sampleCount * drawProgress);

      // Pinch factor (thumb-index distance)
      const pinchDist = landmarks[4]?.distanceTo(landmarks[8] ?? landmarks[4]) ?? 0.2;
      const pinchFactor = THREE.MathUtils.clamp(1 - pinchDist * 3, 0, 1);

      // Base hue for this hand
      const baseHue = hand.handedness === 'Left' ? 0.0 : hand.handedness === 'Right' ? 0.58 : 0.15;

      // Sample the curve
      for (let i = 0; i < sampleCount; i++) {
        const u = i / (sampleCount - 1);

        if (i >= visibleSamples) {
          pts[i].set(9999, 9999, 9999);
          cols[i].setRGB(0, 0, 0);
          continue;
        }

        curve.getPoint(u, tmpVec);
        curve.getTangent(u, tmpTangent);

        // Perpendicular (simple: rotate tangent 90° in XY plane)
        tmpNormal.set(-tmpTangent.y, tmpTangent.x, tmpTangent.z * 0.3).normalize();

        // Noise displacement
        const noiseVal = noise2D(u * noiseScale + t * 0.5, t * 0.3 + handIndex * 100);
        const displacement = (noiseVal - 0.5) * 2 * noiseAmount * (1 + pinchFactor * 0.5);
        tmpVec.addScaledVector(tmpNormal, displacement);

        // Slight z-wobble for depth
        tmpVec.z += (noise1D(u * noiseScale * 2 + t) - 0.5) * noiseAmount * 0.5;

        pts[i].copy(tmpVec);

        // Color gradient: hue shifts along path + time
        const hue = (baseHue + u * 0.15 + t * 0.02) % 1;
        const sat = 0.6 + pinchFactor * 0.3;
        const light = 0.55 + (1 - u) * 0.15;
        cols[i].setHSL(hue, sat, light);
      }
    }
  });

  // Render lines for each hand
  return (
    <>
      <ambientLight intensity={0.3} />
      <directionalLight position={[2, 3, 2]} intensity={0.8} />

      {[0, 1].map((handIndex) => (
        <Line
          key={`line-${handIndex}`}
          points={linePointsRef.current[handIndex]!}
          vertexColors={lineColorsRef.current[handIndex]!.map((c) => [c.r, c.g, c.b] as [number, number, number])}
          lineWidth={lineWidth}
          transparent
          opacity={0.95}
        />
      ))}
    </>
  );
}

export function OneLineHandVisual({
  hands,
  className = '',
  controls: controlsProp,
}: OneLineHandVisualProps) {
  const controls: OneLineHandControls = { ...DEFAULT_ONE_LINE_CONTROLS, ...controlsProp };

  return (
    <div className={`w-full h-full bg-gray-950 ${className}`}>
      <Canvas
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
          gl.setClearColor(0x0a0a0f, 1);
        }}
      >
        <PerspectiveCamera makeDefault position={[0, 0.1, 2]} fov={50} />
        <OneLineScene hands={hands} controls={controls} />

        <OrbitControls
          enablePan
          enableZoom
          enableRotate
          minDistance={0.8}
          maxDistance={5}
          target={[0, 0, 0]}
        />
      </Canvas>
    </div>
  );
}
