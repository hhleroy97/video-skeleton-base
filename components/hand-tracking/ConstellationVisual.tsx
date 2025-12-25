'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Points, PointMaterial } from '@react-three/drei';
import * as THREE from 'three';
import { useMemo, useRef } from 'react';
import type { Hand3DData } from './HandTracking';
import { landmarkToSceneSpace } from './handPose';
import { fillTrailSegments } from './trailMath';
import type { ConstellationPaletteId } from './constellationPalettes';
import { getConstellationHues } from './constellationPalettes';

export interface ConstellationControls {
  starBrightness: number;      // 0..1 base star intensity
  nebulaIntensity: number;     // 0..1 nebula bloom visibility
  nebulaRadius: number;        // 0.1..2.5 spatial radius of the nebula cloud
  nebulaParticleCount: number; // 50..1200 number of nebula particles ("spheres")
  nebulaParticleSize: number;  // 0.01..0.3 visual point size
  palette: ConstellationPaletteId; // color palette (affects nebula/stars/lines hues)
  constellationOpacity: number; // 0..1 connecting lines
  cosmicDepth: number;         // 0..1 background star density
  twinkleSpeed: number;        // 0..2 star shimmer rate
  showHandSkeleton: boolean;   // show an explicit hand skeleton overlay
  // Flocking physics
  attractionStrength: number;  // 0..3 how strongly particles are attracted to landmarks
  separationStrength: number;  // 0..2 how strongly particles repel each other
  separationRadius: number;    // 0.02..0.15 distance at which separation kicks in
  motionRepulsion: number;     // 0..15 how strongly moving landmarks push particles
  damping: number;             // 0.8..0.99 velocity decay per frame
  // Galaxy-in-hand field
  coreAttraction: number;      // 0..4 pull toward palm core
  orbitStrength: number;       // 0..4 tangential swirl around palm axis
  armCount: number;            // 1..6 number of spiral arms
  armStrength: number;         // 0..4 how strongly particles are pulled toward arms
  armWidth: number;            // 0.05..1.5 smaller = sharper arms
  spiralPitch: number;         // -2..2 pitch (ln(r) coefficient) for logarithmic spiral
  patternSpeed: number;        // -3..3 spiral pattern rotation speed
  turbulence: number;          // 0..2 noise force in the disk
  // Trails (drawing)
  showNebulaTrails: boolean;
  trailLength: number;         // 2..40
  trailOpacity: number;        // 0..1
}

export const DEFAULT_CONSTELLATION_CONTROLS: ConstellationControls = {
  starBrightness: 0.8,
  nebulaIntensity: 0.5,
  nebulaRadius: 0.9,
  nebulaParticleCount: 150, // Reduced from 260 for better performance
  nebulaParticleSize: 0.11,
  palette: 'classic',
  constellationOpacity: 0.3,
  cosmicDepth: 0.6,
  twinkleSpeed: 1.0,
  showHandSkeleton: false,
  // Flocking defaults
  attractionStrength: 1.2,
  separationStrength: 0.8,
  separationRadius: 0.06,
  motionRepulsion: 8.0,
  damping: 0.90,
  // Galaxy defaults
  coreAttraction: 1.2,
  orbitStrength: 1.6,
  armCount: 3,
  armStrength: 1.4,
  armWidth: 0.35,
  spiralPitch: 0.65,
  patternSpeed: 0.6,
  turbulence: 0.35,
  showNebulaTrails: false,
  trailLength: 14,
  trailOpacity: 0.25,
};

interface ConstellationVisualProps {
  hands: Hand3DData[];
  className?: string;
  controls?: Partial<ConstellationControls>;
}

// Hand skeleton connections (landmark pairs)
const HAND_CONNECTIONS: [number, number][] = [
  // Thumb
  [0, 1], [1, 2], [2, 3], [3, 4],
  // Index
  [0, 5], [5, 6], [6, 7], [7, 8],
  // Middle
  [0, 9], [9, 10], [10, 11], [11, 12],
  // Ring
  [0, 13], [13, 14], [14, 15], [15, 16],
  // Pinky
  [0, 17], [17, 18], [18, 19], [19, 20],
  // Palm cross-connections
  [5, 9], [9, 13], [13, 17],
];

// Procedural noise for nebula effect
function noise3D(x: number, y: number, z: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233 + z * 45.164) * 43758.5453;
  return n - Math.floor(n);
}

function fbm(x: number, y: number, z: number, octaves: number = 4): number {
  let value = 0;
  let amplitude = 0.5;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * noise3D(x, y, z);
    x *= 2;
    y *= 2;
    z *= 2;
    amplitude *= 0.5;
  }
  return value;
}

// Create a circular star texture with bright core and soft glow
function createStarTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Radial gradient: bright core with soft glow
  const gradient = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2
  );
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.1, 'rgba(255, 255, 255, 0.95)');
  gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.5)');
  gradient.addColorStop(0.6, 'rgba(255, 255, 255, 0.15)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// Shared star texture (created once)
let sharedStarTexture: THREE.CanvasTexture | null = null;
function getStarTexture(): THREE.CanvasTexture {
  if (!sharedStarTexture) {
    sharedStarTexture = createStarTexture();
  }
  return sharedStarTexture;
}

// Background stars component
function BackgroundStars({ count, depth }: { count: number; depth: number }) {
  const starTexture = useMemo(() => getStarTexture(), []);

  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Distribute in a sphere around the scene
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 3 + Math.random() * 5;
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
    }
    return pos;
  }, [count]);

  const sizes = useMemo(() => {
    const s = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      s[i] = 0.5 + Math.random() * 1.5;
    }
    return s;
  }, [count]);

  return (
    <Points positions={positions}>
      <PointMaterial
        map={starTexture}
        transparent
        color="#ffffff"
        size={0.04 * depth}
        sizeAttenuation
        depthWrite={false}
        opacity={0.5 * depth}
        blending={THREE.AdditiveBlending}
      />
    </Points>
  );
}

// Create a circular gradient texture for soft nebula particles
function createNebulaTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Radial gradient: bright center, soft fade to transparent edges
  const gradient = ctx.createRadialGradient(
    size / 2, size / 2, 0,           // Inner circle (center)
    size / 2, size / 2, size / 2     // Outer circle (edge)
  );
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.8)');
  gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.3)');
  gradient.addColorStop(0.8, 'rgba(255, 255, 255, 0.1)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// Flocking physics props
interface FlockingProps {
  attractionStrength: number;
  separationStrength: number;
  separationRadius: number;
  motionRepulsion: number;
  damping: number;
}

interface GalaxyProps {
  coreCenter: THREE.Vector3;
  orbitAxis: THREE.Vector3;
  coreAttraction: number;
  orbitStrength: number;
  armCount: number;
  armStrength: number;
  armWidth: number;
  spiralPitch: number;
  patternSpeed: number;
  turbulence: number;
  time: number;
}

// Physics-based nebula with flocking attraction and movement repulsion
function NebulaCloud({
  landmarks,
  prevLandmarks,
  intensity,
  hue,
  saturation,
  lightness,
  flocking,
  galaxy,
  trails,
  nebula,
}: {
  landmarks: THREE.Vector3[];
  prevLandmarks: THREE.Vector3[];
  intensity: number;
  hue: number;
  saturation: number;
  lightness: number;
  flocking: FlockingProps;
  galaxy: GalaxyProps;
  trails: {
    enabled: boolean;
    length: number;
    opacity: number;
  };
  nebula: {
    radius: number;
    particleCount: number;
    particleSize: number;
  };
}) {
  const pointsRef = useRef<THREE.Points>(null);
  const geomRef = useRef<THREE.BufferGeometry>(null);
  const particleCount = Math.min(1200, Math.max(50, Math.floor(nebula.particleCount)));

  // Create the circular gradient texture once
  const nebulaTexture = useMemo(() => createNebulaTexture(), []);

  // Physics state - positions and velocities in world space
  const particleState = useRef<{
    positions: Float32Array;
    velocities: Float32Array;
    colors: Float32Array;
    sizes: Float32Array;
    initialized: boolean;
  }>({
    positions: new Float32Array(particleCount * 3),
    velocities: new Float32Array(particleCount * 3),
    colors: new Float32Array(particleCount * 3),
    sizes: new Float32Array(particleCount),
    initialized: false,
  });

  // Store hue variations per particle (stable across re-renders)
  const hueOffsetsRef = useRef<Float32Array | null>(null);
  // Store saturation/lightness variations per particle
  const satOffsetsRef = useRef<Float32Array | null>(null);
  const lightOffsetsRef = useRef<Float32Array | null>(null);
  if (!hueOffsetsRef.current) {
    hueOffsetsRef.current = new Float32Array(particleCount);
    satOffsetsRef.current = new Float32Array(particleCount);
    lightOffsetsRef.current = new Float32Array(particleCount);
    for (let i = 0; i < particleCount; i++) {
      hueOffsetsRef.current[i] = (Math.random() - 0.5) * 0.25;
      satOffsetsRef.current[i] = (Math.random() - 0.5) * 0.2;
      lightOffsetsRef.current[i] = (Math.random() - 0.5) * 0.15;
    }
  }

  // Track current color params to detect changes
  const lastColorParamsRef = useRef({ hue: -1, saturation: -1, lightness: -1 });
  const colorsDirtyRef = useRef(true);

  // Initialize particles ONCE (no dependencies that change)
  useMemo(() => {
    const state = particleState.current;

    for (let i = 0; i < particleCount; i++) {
      // Start particles scattered around the origin
      const r = Math.pow(Math.random(), 0.5) * Math.max(0.05, nebula.radius);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      state.positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      state.positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      state.positions[i * 3 + 2] = r * Math.cos(phi);

      // Zero initial velocity
      state.velocities[i * 3] = 0;
      state.velocities[i * 3 + 1] = 0;
      state.velocities[i * 3 + 2] = 0;

      // Variable sizes
      state.sizes[i] = 0.03 + Math.random() * 0.1;
    }
    state.initialized = true;
    colorsDirtyRef.current = true; // ensure colors get set on first frame
  }, [particleCount, nebula.radius]);

  // Temp vectors for physics calculations
  const tmpVec = useMemo(() => new THREE.Vector3(), []);
  const tmpForce = useMemo(() => new THREE.Vector3(), []);
  const tmpLandmarkVel = useMemo(() => new THREE.Vector3(), []);
  const tmpVec2 = useMemo(() => new THREE.Vector3(), []);
  const tmpVec3 = useMemo(() => new THREE.Vector3(), []);
  const tmpAxis = useMemo(() => new THREE.Vector3(), []);
  const tmpU = useMemo(() => new THREE.Vector3(), []);
  const tmpV = useMemo(() => new THREE.Vector3(), []);

  const anchoredRef = useRef(false);

  // Trails (history + line geometry)
  const trailsGeomRef = useRef<THREE.BufferGeometry>(null);
  const trailsHistoryRef = useRef<Float32Array | null>(null);
  const trailsSegmentsRef = useRef<Float32Array | null>(null);
  const lastTrailLengthRef = useRef<number>(0);

  // Fixed timestep accumulator for consistent physics
  const accumulatorRef = useRef(0);
  const FIXED_DT = 1 / 60; // 60 Hz physics
  const MAX_STEPS = 3; // Prevent spiral of death

  // Spatial hash for O(n) flocking separation
  const spatialHashRef = useRef<Map<string, number[]>>(new Map());

  // Helper to compute spatial hash key
  const getCellKey = (x: number, y: number, z: number, cellSize: number): string => {
    const cx = Math.floor(x / cellSize);
    const cy = Math.floor(y / cellSize);
    const cz = Math.floor(z / cellSize);
    return `${cx},${cy},${cz}`;
  };

  useFrame((_, delta) => {
    const state = particleState.current;
    if (!state.initialized) return;

    // Check if color params changed - if so, recalculate all colors
    const lastParams = lastColorParamsRef.current;
    if (lastParams.hue !== hue || lastParams.saturation !== saturation || lastParams.lightness !== lightness) {
      lastParams.hue = hue;
      lastParams.saturation = saturation;
      lastParams.lightness = lightness;
      colorsDirtyRef.current = true;
    }

    if (colorsDirtyRef.current) {
      const color = new THREE.Color();
      const hueOffsets = hueOffsetsRef.current!;
      const satOffsets = satOffsetsRef.current!;
      const lightOffsets = lightOffsetsRef.current!;

      for (let i = 0; i < particleCount; i++) {
        const h = (hue + hueOffsets[i] + 1) % 1;
        const s = Math.max(0, Math.min(1, saturation + satOffsets[i]));
        const l = Math.max(0, Math.min(1, lightness + lightOffsets[i]));
        color.setHSL(h, s, l);
        state.colors[i * 3] = color.r;
        state.colors[i * 3 + 1] = color.g;
        state.colors[i * 3 + 2] = color.b;
      }
      colorsDirtyRef.current = false;

      // Mark color buffer as needing update
      if (geomRef.current && geomRef.current.attributes.color) {
        (geomRef.current.attributes.color as THREE.BufferAttribute).needsUpdate = true;
      }
    }

    // Fixed timestep accumulator
    accumulatorRef.current += Math.min(delta, 0.1); // Cap incoming delta
    let steps = 0;
    const dt = FIXED_DT;

    // Physics constants from controls
    const { attractionStrength, separationStrength, separationRadius, motionRepulsion, damping } = flocking;
    const maxSpeed = 1.5;             // Maximum particle speed
    const attractionRadius = 0.5;     // How far attraction reaches
    const repulsionRadius = 0.25;     // How close before landmark motion repulsion kicks in

    // Galaxy field inputs
    const {
      coreCenter,
      orbitAxis,
      coreAttraction,
      orbitStrength,
      armCount,
      armStrength,
      armWidth,
      spiralPitch,
      patternSpeed,
      turbulence,
      time,
    } = galaxy;

    // Anchor particle cloud near the palm core once we have a stable core
    if (!anchoredRef.current) {
      // Shift the whole cloud toward the current coreCenter (keeps continuity)
      const cx = coreCenter.x, cy = coreCenter.y, cz = coreCenter.z;
      for (let i = 0; i < particleCount; i++) {
        state.positions[i * 3] += cx;
        state.positions[i * 3 + 1] += cy;
        state.positions[i * 3 + 2] += cz;
      }
      anchoredRef.current = true;
    }

    // Build a stable orthonormal basis (u,v) for the disk plane
    tmpAxis.copy(orbitAxis);
    if (tmpAxis.lengthSq() < 1e-6) tmpAxis.set(0, 0, 1);
    tmpAxis.normalize();
    // pick a non-parallel vector to seed basis
    tmpU.set(1, 0, 0);
    if (Math.abs(tmpU.dot(tmpAxis)) > 0.8) tmpU.set(0, 1, 0);
    tmpU.crossVectors(tmpAxis, tmpU).normalize(); // u ⟂ axis
    tmpV.crossVectors(tmpAxis, tmpU).normalize(); // v ⟂ axis and u

    // Compute landmark velocities (for repulsion) - only once per frame
    const landmarkVelocities: THREE.Vector3[] = [];
    for (let li = 0; li < landmarks.length; li++) {
      const curr = landmarks[li];
      const prev = prevLandmarks[li];
      if (curr && prev) {
        tmpLandmarkVel.subVectors(curr, prev).divideScalar(dt);
        landmarkVelocities.push(tmpLandmarkVel.clone());
      } else {
        landmarkVelocities.push(new THREE.Vector3());
      }
    }

    // Fixed timestep physics loop
    while (accumulatorRef.current >= FIXED_DT && steps < MAX_STEPS) {
      accumulatorRef.current -= FIXED_DT;
      steps++;

      // Build spatial hash for O(n) separation (cell size = separation radius)
      const cellSize = separationRadius * 2;
      const spatialHash = spatialHashRef.current;
      spatialHash.clear();

      for (let i = 0; i < particleCount; i++) {
        const key = getCellKey(
          state.positions[i * 3],
          state.positions[i * 3 + 1],
          state.positions[i * 3 + 2],
          cellSize
        );
        let bucket = spatialHash.get(key);
        if (!bucket) {
          bucket = [];
          spatialHash.set(key, bucket);
        }
        bucket.push(i);
      }

      // Update each particle
    for (let i = 0; i < particleCount; i++) {
      const px = state.positions[i * 3];
      const py = state.positions[i * 3 + 1];
      const pz = state.positions[i * 3 + 2];

      tmpForce.set(0, 0, 0);

      // Find nearest landmark for attraction and check for repulsion
      let nearestDist = Infinity;
      let nearestLandmark: THREE.Vector3 | null = null;

      for (let li = 0; li < landmarks.length; li++) {
        const lm = landmarks[li];
        if (!lm) continue;

        tmpVec.set(lm.x - px, lm.y - py, lm.z - pz);
        const dist = tmpVec.length();

        // Track nearest for attraction
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestLandmark = lm;
        }

        // Repulsion from fast-moving landmarks
        const lmVel = landmarkVelocities[li];
        const lmSpeed = lmVel?.length() ?? 0;

        if (dist < repulsionRadius && lmSpeed > 0.1) {
          // Push particle away from landmark, scaled by landmark speed
          const repulsionDir = tmpVec.clone().normalize().multiplyScalar(-1);
          const repulsionMag = motionRepulsion * lmSpeed * (1 - dist / repulsionRadius);
          tmpForce.addScaledVector(repulsionDir, repulsionMag);
        }
      }

      // Attraction to nearest landmark
      if (nearestLandmark && nearestDist < attractionRadius && nearestDist > 0.02) {
        tmpVec.set(
          nearestLandmark.x - px,
          nearestLandmark.y - py,
          nearestLandmark.z - pz
        ).normalize();

        // Attraction force (stronger when farther, weaker when very close)
        const attractMag = attractionStrength * (nearestDist / attractionRadius);
        tmpForce.addScaledVector(tmpVec, attractMag);
      }

      // GALAXY: core attraction + orbit swirl in disk plane
      tmpVec2.set(px - coreCenter.x, py - coreCenter.y, pz - coreCenter.z); // rVec (from core to particle)
      const r = tmpVec2.length();
      if (r > 1e-4) {
        // Core pull (weaken slightly near the core to avoid singularity)
        tmpForce.addScaledVector(tmpVec2.normalize().multiplyScalar(-1), coreAttraction * Math.min(1, r / 0.25));

        // Tangential swirl: axis × rVec
        tmpVec3.crossVectors(tmpAxis, tmpVec2).normalize();
        const swirlFalloff = 1 / (0.2 + r); // strong near core, fades outward
        tmpForce.addScaledVector(tmpVec3, orbitStrength * swirlFalloff);

        // Spiral arm field: pull toward a logarithmic spiral “target” at the same radius
        // Compute polar angle in disk plane
        const x = (px - coreCenter.x) * tmpU.x + (py - coreCenter.y) * tmpU.y + (pz - coreCenter.z) * tmpU.z;
        const y = (px - coreCenter.x) * tmpV.x + (py - coreCenter.y) * tmpV.y + (pz - coreCenter.z) * tmpV.z;
        const theta = Math.atan2(y, x);
        const safeR = Math.max(0.05, Math.sqrt(x * x + y * y));

        // Choose closest arm by phase
        const k = Math.max(1, Math.round(armCount));
        let bestPhase = Infinity;
        let bestTargetAngle = theta;
        for (let a = 0; a < k; a++) {
          const armOffset = (a / k) * Math.PI * 2;
          const targetAngle = armOffset + spiralPitch * Math.log(safeR) + time * patternSpeed;
          // phase difference wrapped to [-pi, pi]
          const d = THREE.MathUtils.euclideanModulo(theta - targetAngle + Math.PI, Math.PI * 2) - Math.PI;
          const absD = Math.abs(d);
          if (absD < bestPhase) {
            bestPhase = absD;
            bestTargetAngle = targetAngle;
          }
        }

        // Density falloff from the arm centerline (Gaussian-ish)
        const sigma = Math.max(0.05, armWidth);
        const density = Math.exp(-(bestPhase * bestPhase) / (2 * sigma * sigma));

        // Target point at same radius but on the arm’s angle
        const cosA = Math.cos(bestTargetAngle);
        const sinA = Math.sin(bestTargetAngle);
        const tx = coreCenter.x + tmpU.x * (safeR * cosA) + tmpV.x * (safeR * sinA);
        const ty = coreCenter.y + tmpU.y * (safeR * cosA) + tmpV.y * (safeR * sinA);
        const tz = coreCenter.z + tmpU.z * (safeR * cosA) + tmpV.z * (safeR * sinA);
        tmpVec3.set(tx - px, ty - py, tz - pz);
        tmpForce.addScaledVector(tmpVec3, armStrength * density);

        // Turbulence in-plane (cheap “noise”)
        if (turbulence > 0) {
          const n =
            Math.sin((px + time) * 3.1) * 0.5 +
            Math.sin((py - time * 0.7) * 2.7) * 0.35 +
            Math.sin((pz + time * 1.3) * 2.3) * 0.25;
          // apply along u/v to keep in disk
          tmpForce.addScaledVector(tmpU, n * turbulence);
          tmpForce.addScaledVector(tmpV, -n * 0.8 * turbulence);
        }
      }

      // FLOCKING: Separation from nearby particles using spatial hash (O(n) instead of O(n²))
      const pCellX = Math.floor(px / cellSize);
      const pCellY = Math.floor(py / cellSize);
      const pCellZ = Math.floor(pz / cellSize);

      // Check neighboring cells (3x3x3 = 27 cells max)
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dz = -1; dz <= 1; dz++) {
            const neighborKey = `${pCellX + dx},${pCellY + dy},${pCellZ + dz}`;
            const bucket = spatialHash.get(neighborKey);
            if (!bucket) continue;

            for (const j of bucket) {
              if (i === j) continue;

              const ox = state.positions[j * 3];
              const oy = state.positions[j * 3 + 1];
              const oz = state.positions[j * 3 + 2];

              const ddx = px - ox;
              const ddy = py - oy;
              const ddz = pz - oz;
              const distSq = ddx * ddx + ddy * ddy + ddz * ddz;

              if (distSq < separationRadius * separationRadius && distSq > 0.0001) {
                const dist = Math.sqrt(distSq);
                // Repel away from neighbor, stronger when closer
                const separationMag = separationStrength * (1 - dist / separationRadius);
                tmpForce.x += (ddx / dist) * separationMag;
                tmpForce.y += (ddy / dist) * separationMag;
                tmpForce.z += (ddz / dist) * separationMag;
              }
            }
          }
        }
      }

      // Apply force to velocity
      state.velocities[i * 3] += tmpForce.x * dt;
      state.velocities[i * 3 + 1] += tmpForce.y * dt;
      state.velocities[i * 3 + 2] += tmpForce.z * dt;

      // Damping
      state.velocities[i * 3] *= damping;
      state.velocities[i * 3 + 1] *= damping;
      state.velocities[i * 3 + 2] *= damping;

      // Clamp speed
      const speed = Math.sqrt(
        state.velocities[i * 3] ** 2 +
        state.velocities[i * 3 + 1] ** 2 +
        state.velocities[i * 3 + 2] ** 2
      );
      if (speed > maxSpeed) {
        const scale = maxSpeed / speed;
        state.velocities[i * 3] *= scale;
        state.velocities[i * 3 + 1] *= scale;
        state.velocities[i * 3 + 2] *= scale;
      }

      // Update position
      state.positions[i * 3] += state.velocities[i * 3] * dt;
      state.positions[i * 3 + 1] += state.velocities[i * 3 + 1] * dt;
      state.positions[i * 3 + 2] += state.velocities[i * 3 + 2] * dt;
      }
    } // End fixed timestep while loop

    // Trails update (write into history, then build segments)
    if (trails.enabled && trails.length >= 2) {
      const L = Math.min(40, Math.max(2, Math.floor(trails.length)));
      if (lastTrailLengthRef.current !== L || !trailsHistoryRef.current || !trailsSegmentsRef.current) {
        lastTrailLengthRef.current = L;
        trailsHistoryRef.current = new Float32Array(particleCount * L * 3);
        trailsSegmentsRef.current = new Float32Array(particleCount * (L - 1) * 2 * 3);
        // Seed with current positions (so first frame doesn't draw huge lines)
        for (let p = 0; p < particleCount; p++) {
          const px = state.positions[p * 3];
          const py = state.positions[p * 3 + 1];
          const pz = state.positions[p * 3 + 2];
          const base = p * L * 3;
          for (let i = 0; i < L; i++) {
            trailsHistoryRef.current[base + i * 3] = px;
            trailsHistoryRef.current[base + i * 3 + 1] = py;
            trailsHistoryRef.current[base + i * 3 + 2] = pz;
          }
        }
      }

      const history = trailsHistoryRef.current!;
      const segs = trailsSegmentsRef.current!;

      // Shift history back by one for each particle using copyWithin, then write newest at slot 0
      const stride = L * 3;
      for (let p = 0; p < particleCount; p++) {
        const base = p * stride;
        // Shift: copy [base..base+(L-1)*3) to [base+3..base+L*3) (moves old data back by one slot)
        history.copyWithin(base + 3, base, base + (L - 1) * 3);
        // Write newest position at slot 0
        history[base] = state.positions[p * 3];
        history[base + 1] = state.positions[p * 3 + 1];
        history[base + 2] = state.positions[p * 3 + 2];
      }

      fillTrailSegments({
        trailHistory: history,
        particleCount,
        trailLength: L,
        outSegments: segs,
      });

      if (trailsGeomRef.current) {
        const posAttr = trailsGeomRef.current.attributes.position as THREE.BufferAttribute;
        // Only update if buffer sizes match; when trail length changes, the geometry
        // will be recreated on next render cycle with the new size
        if (posAttr.array.length === segs.length) {
          posAttr.array.set(segs);
          posAttr.needsUpdate = true;
        }
      }
    }

    // Update geometry
    if (geomRef.current) {
      const posAttr = geomRef.current.attributes.position as THREE.BufferAttribute;
      posAttr.array.set(state.positions);
      posAttr.needsUpdate = true;
    }
  });

  if (intensity < 0.01) return null;

  const state = particleState.current;

  return (
    <group>
      {trails.enabled && trails.length >= 2 && (
        <lineSegments key={`trails-${Math.floor(trails.length)}`}>
          <bufferGeometry ref={trailsGeomRef}>
            <bufferAttribute
              attach="attributes-position"
              args={[
                trailsSegmentsRef.current ??
                  new Float32Array(particleCount * (Math.min(40, Math.max(2, Math.floor(trails.length))) - 1) * 2 * 3),
                3,
              ]}
            />
          </bufferGeometry>
          <lineBasicMaterial
            color="#ffffff"
            transparent
            opacity={Math.max(0, Math.min(1, trails.opacity)) * intensity}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </lineSegments>
      )}

      <points ref={pointsRef}>
        <bufferGeometry ref={geomRef}>
          <bufferAttribute
            attach="attributes-position"
            args={[state.positions, 3]}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[state.colors, 3]}
          />
          <bufferAttribute
            attach="attributes-size"
            args={[state.sizes, 1]}
          />
        </bufferGeometry>
        <pointsMaterial
          map={nebulaTexture}
          size={Math.min(0.3, Math.max(0.01, nebula.particleSize))}
          vertexColors
          transparent
          opacity={intensity * 0.75}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          sizeAttenuation
        />
      </points>
    </group>
  );
}

function ConstellationScene({
  hands,
  controls,
}: {
  hands: Hand3DData[];
  controls: ConstellationControls;
}) {
  const { starBrightness, nebulaIntensity, nebulaRadius, nebulaParticleCount, nebulaParticleSize, palette, constellationOpacity, cosmicDepth, twinkleSpeed,
    attractionStrength, separationStrength, separationRadius, motionRepulsion, damping, showHandSkeleton,
    coreAttraction, orbitStrength, armCount, armStrength, armWidth, spiralPitch, patternSpeed, turbulence,
    showNebulaTrails, trailLength, trailOpacity } = controls;
  
  // Flocking props to pass to NebulaCloud
  const flockingProps: FlockingProps = { attractionStrength, separationStrength, separationRadius, motionRepulsion, damping };
  const { clock } = useThree();

  // Circular star texture for landmarks
  const starTexture = useMemo(() => getStarTexture(), []);

  // Refs for geometry updates
  const starGeomRef = useRef<THREE.BufferGeometry>(null);
  const lineGeomRef = useRef<THREE.BufferGeometry>(null);
  const skelLineGeomRef = useRef<THREE.BufferGeometry>(null);

  // Pre-allocate arrays
  const maxStars = 42; // 21 per hand
  const maxLineVerts = HAND_CONNECTIONS.length * 2 * 2; // pairs * 2 verts * 2 hands

  const starPositions = useMemo(() => new Float32Array(maxStars * 3), [maxStars]);
  const starColors = useMemo(() => new Float32Array(maxStars * 3), [maxStars]);
  const starSizes = useMemo(() => new Float32Array(maxStars), [maxStars]);

  const linePositions = useMemo(() => new Float32Array(maxLineVerts * 3), [maxLineVerts]);
  const lineColors = useMemo(() => new Float32Array(maxLineVerts * 3), [maxLineVerts]);
  const skelLinePositions = useMemo(() => new Float32Array(maxLineVerts * 3), [maxLineVerts]);

  // Nebula state per hand: current landmarks and previous frame landmarks
  const nebulaLandmarksRef = useRef<THREE.Vector3[][]>([[], []]);
  const prevNebulaLandmarksRef = useRef<THREE.Vector3[][]>([[], []]);
  const nebulaCoreRef = useRef<THREE.Vector3[]>([new THREE.Vector3(), new THREE.Vector3()]);
  const nebulaAxisRef = useRef<THREE.Vector3[]>([new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 1)]);
  const opennessRef = useRef<number[]>([0, 0]); // 0..1, how open the hand is (used to scale orbit swirl)
  const tmpPalmA = useRef(new THREE.Vector3());
  const tmpPalmB = useRef(new THREE.Vector3());
  const tmpPalmC = useRef(new THREE.Vector3());

  // Track pinch factor for brightness
  const pinchFactorRef = useRef<number[]>([0, 0]);

  // Track if each hand slot has ever had a hand (so nebula persists after hand leaves)
  const hasEverHadHandRef = useRef<boolean[]>([false, false]);

  const getHandedness = (hand?: Hand3DData) => (hand?.handedness === 'Left' ? 'Left' : 'Right') as const;

  useFrame(() => {
    const t = clock.getElapsedTime();
    let starIdx = 0;
    let lineIdx = 0;

    for (let handIndex = 0; handIndex < 2; handIndex++) {
      const hand = hands[handIndex];
      if (!hand) continue;

      // Mark that this hand slot has been used at least once
      hasEverHadHandRef.current[handIndex] = true;

      const handedness = getHandedness(hand);
      const hues = getConstellationHues({ paletteId: palette, handedness });

      const landmarks = hand.landmarks.map((lm) => landmarkToSceneSpace(lm, 2));

      // Compute pinch distance (thumb-index)
      const thumbTip = landmarks[4];
      const indexTip = landmarks[8];
      const pinchDist = thumbTip?.distanceTo(indexTip ?? thumbTip) ?? 0.2;
      const pinchFactor = THREE.MathUtils.clamp(1 - pinchDist * 4, 0, 1);
      pinchFactorRef.current[handIndex] = pinchFactor;

      // Store previous landmarks before updating current
      prevNebulaLandmarksRef.current[handIndex] = nebulaLandmarksRef.current[handIndex].map(v => v.clone());
      // Store current landmarks for nebula physics
      nebulaLandmarksRef.current[handIndex] = landmarks.map(v => v.clone());

      // Compute palm core and orbit axis (palm normal)
      const wrist = landmarks[0];
      const indexKnuckle = landmarks[5];
      const middleKnuckle = landmarks[9];
      const pinkyKnuckle = landmarks[17];
      if (wrist && indexKnuckle && middleKnuckle && pinkyKnuckle) {
        // core: average of palm points
        const core = nebulaCoreRef.current[handIndex];
        core.set(0, 0, 0)
          .add(wrist)
          .add(indexKnuckle)
          .add(middleKnuckle)
          .add(pinkyKnuckle)
          .multiplyScalar(0.25);

        // axis: palm normal from (pinky-index) x (middle-wrist)
        tmpPalmA.current.subVectors(pinkyKnuckle, indexKnuckle);
        tmpPalmB.current.subVectors(middleKnuckle, wrist);
        tmpPalmC.current.crossVectors(tmpPalmA.current, tmpPalmB.current).normalize();
        if (tmpPalmC.current.lengthSq() > 1e-6) {
          nebulaAxisRef.current[handIndex].copy(tmpPalmC.current);
        }
      }

      // Spread factor (average finger spread)
      const fingerTips = [4, 8, 12, 16, 20];
      let avgSpread = 0;
      fingerTips.forEach((tip) => {
        if (landmarks[tip] && landmarks[0]) {
          avgSpread += landmarks[tip].distanceTo(landmarks[0]);
        }
      });
      avgSpread /= fingerTips.length;
      // Map spread to 0..1 (tuned for landmarkToSceneSpace scale=2)
      const spreadFactor = THREE.MathUtils.clamp((avgSpread - 0.18) / (0.55 - 0.18), 0, 1);
      opennessRef.current[handIndex] = spreadFactor;

      // Draw stars (landmarks)
      for (let i = 0; i < 21; i++) {
        const lm = landmarks[i];
        if (!lm || starIdx >= maxStars) continue;

        starPositions[starIdx * 3] = lm.x;
        starPositions[starIdx * 3 + 1] = lm.y;
        starPositions[starIdx * 3 + 2] = lm.z;

        // Twinkle effect
        const twinkle = 0.7 + 0.3 * Math.sin(t * twinkleSpeed * 3 + i * 1.7 + handIndex * 10);

        // Fingertips are brighter when pinching
        const isTip = [4, 8, 12, 16, 20].includes(i);
        const tipBoost = isTip ? 1 + pinchFactor * 0.5 : 1;

        // Base color (palette-driven)
        const baseHue = hues.starHue;
        const color = new THREE.Color().setHSL(
          baseHue,
          0.3 + pinchFactor * 0.3,
          (starBrightness * twinkle * tipBoost) * 0.5 + 0.3
        );

        starColors[starIdx * 3] = color.r;
        starColors[starIdx * 3 + 1] = color.g;
        starColors[starIdx * 3 + 2] = color.b;

        starSizes[starIdx] = (0.05 + (isTip ? 0.03 : 0)) * (1 + pinchFactor * 0.5);

        starIdx++;
      }

      // Draw constellation lines
      for (const [a, b] of HAND_CONNECTIONS) {
        const la = landmarks[a];
        const lb = landmarks[b];
        if (!la || !lb || lineIdx >= maxLineVerts - 1) continue;

        linePositions[lineIdx * 3] = la.x;
        linePositions[lineIdx * 3 + 1] = la.y;
        linePositions[lineIdx * 3 + 2] = la.z;

        linePositions[(lineIdx + 1) * 3] = lb.x;
        linePositions[(lineIdx + 1) * 3 + 1] = lb.y;
        linePositions[(lineIdx + 1) * 3 + 2] = lb.z;

        // Skeleton positions share the same vertices (material differs)
        skelLinePositions[lineIdx * 3] = la.x;
        skelLinePositions[lineIdx * 3 + 1] = la.y;
        skelLinePositions[lineIdx * 3 + 2] = la.z;
        skelLinePositions[(lineIdx + 1) * 3] = lb.x;
        skelLinePositions[(lineIdx + 1) * 3 + 1] = lb.y;
        skelLinePositions[(lineIdx + 1) * 3 + 2] = lb.z;

        // Fade based on distance (longer = dimmer)
        const dist = la.distanceTo(lb);
        const fade = Math.max(0.3, 1 - dist * 2);
        const lineColor = new THREE.Color().setHSL(
          hues.lineHue,
          0.4,
          0.3 * fade * constellationOpacity
        );

        lineColors[lineIdx * 3] = lineColor.r;
        lineColors[lineIdx * 3 + 1] = lineColor.g;
        lineColors[lineIdx * 3 + 2] = lineColor.b;
        lineColors[(lineIdx + 1) * 3] = lineColor.r;
        lineColors[(lineIdx + 1) * 3 + 1] = lineColor.g;
        lineColors[(lineIdx + 1) * 3 + 2] = lineColor.b;

        lineIdx += 2;
      }
    }

    // Park unused stars off-screen
    for (let i = starIdx; i < maxStars; i++) {
      starPositions[i * 3] = 9999;
      starPositions[i * 3 + 1] = 9999;
      starPositions[i * 3 + 2] = 9999;
    }

    // Park unused line verts
    for (let i = lineIdx; i < maxLineVerts; i++) {
      linePositions[i * 3] = 9999;
      linePositions[i * 3 + 1] = 9999;
      linePositions[i * 3 + 2] = 9999;
      skelLinePositions[i * 3] = 9999;
      skelLinePositions[i * 3 + 1] = 9999;
      skelLinePositions[i * 3 + 2] = 9999;
    }

    // Update geometries
    if (starGeomRef.current) {
      starGeomRef.current.attributes.position.needsUpdate = true;
      starGeomRef.current.attributes.color.needsUpdate = true;
      starGeomRef.current.attributes.size.needsUpdate = true;
    }
    if (lineGeomRef.current) {
      lineGeomRef.current.attributes.position.needsUpdate = true;
      lineGeomRef.current.attributes.color.needsUpdate = true;
    }
    if (skelLineGeomRef.current) {
      skelLineGeomRef.current.attributes.position.needsUpdate = true;
    }
  });

  const t = clock.getElapsedTime();

  // Palette hues must be derived from React state, not refs updated in the render loop,
  // so changing palette updates nebula colors immediately.
  const hues0 = getConstellationHues({ paletteId: palette, handedness: getHandedness(hands[0]) });
  const hues1 = getConstellationHues({ paletteId: palette, handedness: getHandedness(hands[1]) });

  // Compute effective nebula intensity per hand
  const getNebulaIntensity = (handIndex: number) => {
    // NOTE: nebula intensity is no longer pinch-driven; it stays stable
    return nebulaIntensity;
  };

  return (
    <>
      {/* Deep space background */}
      <color attach="background" args={['#020209']} />
      <fog attach="fog" args={['#020209', 4, 10]} />

      {/* Background stars */}
      <BackgroundStars count={Math.floor(500 * cosmicDepth)} depth={cosmicDepth} />

      {/* Hand stars (landmarks) */}
      <points>
        <bufferGeometry ref={starGeomRef}>
          <bufferAttribute
            attach="attributes-position"
            args={[starPositions, 3]}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[starColors, 3]}
          />
          <bufferAttribute
            attach="attributes-size"
            args={[starSizes, 1]}
          />
        </bufferGeometry>
        <pointsMaterial
          map={starTexture}
          vertexColors
          size={0.08}
          sizeAttenuation
          transparent
          opacity={starBrightness}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      {/* Constellation lines */}
      {constellationOpacity > 0.01 && (
        <lineSegments>
          <bufferGeometry ref={lineGeomRef}>
            <bufferAttribute
              attach="attributes-position"
              args={[linePositions, 3]}
            />
            <bufferAttribute
              attach="attributes-color"
              args={[lineColors, 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial
            vertexColors
            transparent
            opacity={constellationOpacity}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </lineSegments>
      )}

      {/* Explicit hand skeleton overlay (brighter, non-constellation) */}
      {showHandSkeleton && (
        <lineSegments>
          <bufferGeometry ref={skelLineGeomRef}>
            <bufferAttribute
              attach="attributes-position"
              args={[skelLinePositions, 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial
            color="#ffffff"
            transparent
            opacity={0.6}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </lineSegments>
      )}

      {/* Nebula clouds around each hand - persist even when hand leaves */}
      {hasEverHadHandRef.current[0] && (
        <NebulaCloud
          key={`nebula-0-${nebulaParticleCount}-${nebulaRadius}-${nebulaParticleSize}`}
          landmarks={hands[0] ? nebulaLandmarksRef.current[0] : []}
          prevLandmarks={hands[0] ? prevNebulaLandmarksRef.current[0] : []}
          intensity={getNebulaIntensity(0)}
          hue={hues0.nebulaHue}
          saturation={hues0.saturation}
          lightness={hues0.lightness}
          flocking={flockingProps}
          galaxy={{
            coreCenter: nebulaCoreRef.current[0],
            orbitAxis: nebulaAxisRef.current[0],
            coreAttraction,
            // Open hand -> more swirl (closed -> gentle drift); use last known openness when hand gone
            orbitStrength: orbitStrength * (0.15 + 0.85 * opennessRef.current[0]),
            armCount,
            armStrength,
            armWidth,
            spiralPitch,
            patternSpeed,
            turbulence,
            time: t,
          }}
          trails={{ enabled: showNebulaTrails, length: trailLength, opacity: trailOpacity }}
          nebula={{ radius: nebulaRadius, particleCount: nebulaParticleCount, particleSize: nebulaParticleSize }}
        />
      )}
      {hasEverHadHandRef.current[1] && (
        <NebulaCloud
          key={`nebula-1-${nebulaParticleCount}-${nebulaRadius}-${nebulaParticleSize}`}
          landmarks={hands[1] ? nebulaLandmarksRef.current[1] : []}
          prevLandmarks={hands[1] ? prevNebulaLandmarksRef.current[1] : []}
          intensity={getNebulaIntensity(1)}
          hue={hues1.nebulaHue}
          saturation={hues1.saturation}
          lightness={hues1.lightness}
          flocking={flockingProps}
          galaxy={{
            coreCenter: nebulaCoreRef.current[1],
            orbitAxis: nebulaAxisRef.current[1],
            coreAttraction,
            orbitStrength: orbitStrength * (0.15 + 0.85 * opennessRef.current[1]),
            armCount,
            armStrength,
            armWidth,
            spiralPitch,
            patternSpeed,
            turbulence,
            time: t,
          }}
          trails={{ enabled: showNebulaTrails, length: trailLength, opacity: trailOpacity }}
          nebula={{ radius: nebulaRadius, particleCount: nebulaParticleCount, particleSize: nebulaParticleSize }}
        />
      )}

      {/* Subtle ambient glow */}
      <ambientLight intensity={0.05} />
      <pointLight position={[0, 0, 2]} intensity={0.3} color="#4488ff" />
    </>
  );
}

export function ConstellationVisual({
  hands,
  className = '',
  controls: controlsProp,
}: ConstellationVisualProps) {
  const controls: ConstellationControls = { ...DEFAULT_CONSTELLATION_CONTROLS, ...controlsProp };

  return (
    <div className={`w-full h-full bg-black ${className}`}>
      <Canvas
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
          gl.setClearColor(0x020209, 1);
        }}
      >
        <PerspectiveCamera makeDefault position={[0, 0.1, 2]} fov={50} />
        <ConstellationScene hands={hands} controls={controls} />

        <OrbitControls
          enablePan
          enableZoom
          enableRotate
          minDistance={0.8}
          maxDistance={6}
          target={[0, 0, 0]}
        />
      </Canvas>
    </div>
  );
}
