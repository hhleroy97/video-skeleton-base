'use client';

import { type MutableRefObject, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { clamp01, getFlowerLifecycleState } from '@/lib/flowerLifecycle';
import { generateFlowerLineArt, type BlossomCurve, type BranchPath, type LeafCurve, type LineArtPoint } from '@/lib/flowerLineArt';

interface FlowerLifecycleVisualProps {
  className?: string;
  durationMs?: number;
  loop?: boolean;
  phaseOverride?: number;
  baseSeed?: number;
}

function transformPoint(
  p: LineArtPoint,
  maxHeight: number,
  state: ReturnType<typeof getFlowerLifecycleState>,
  elapsedTime: number
) {
  const normalizedY = maxHeight > 0 ? p.y / maxHeight : 0;
  const growthScale = 0.08 + state.growth * 0.92;
  const bent = state.stemDroop * normalizedY * normalizedY * 0.58;
  const sway = Math.sin(elapsedTime * 0.9 + normalizedY * 6) * 0.03 * (0.3 + state.bloomOpen * 0.7);
  const depth = Math.cos(elapsedTime * 0.65 + normalizedY * 4) * 0.018;

  return {
    x: p.x + bent + sway,
    y: p.y * growthScale - state.stemDroop * normalizedY * 0.32,
    z: p.z + depth,
  };
}

function blossomGrowthFactor(growth: number, anchor: number) {
  // Blossoms begin once the growth front reaches their branch anchor.
  return clamp01((growth - anchor * 0.9) / 0.22);
}

function visibleBranchPoints(branch: BranchPath, growth: number, maxHeight: number): LineArtPoint[] | null {
  const points = branch.points;
  if (points.length < 2) return null;
  const frontier = maxHeight * clamp01(growth / 0.96);
  const visible: LineArtPoint[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (visible.length === 0) visible.push(a);

    if (b.y <= frontier) {
      visible.push(b);
      continue;
    }

    if (a.y < frontier && b.y > frontier) {
      const t = (frontier - a.y) / Math.max(1e-6, b.y - a.y);
      visible.push({
        x: a.x + (b.x - a.x) * t,
        y: frontier,
        z: a.z + (b.z - a.z) * t,
      });
    }
    break;
  }

  return visible.length >= 2 ? visible : null;
}

function FlowerLineArtActor({
  timelineRef,
  baseSeed,
}: {
  timelineRef: MutableRefObject<number>;
  baseSeed: number;
}) {
  const [cycleSeed, setCycleSeed] = useState(baseSeed);
  const variant = useMemo(() => generateFlowerLineArt(cycleSeed), [cycleSeed]);
  const blossomCurves = useMemo(
    () => variant.blossoms.flatMap((cluster) => cluster.curves),
    [variant]
  );
  const leafCurves = useMemo(() => variant.leaves, [variant]);
  const previousTimelineRef = useRef(0);
  const rootRef = useRef<THREE.Group>(null);
  const stemMeshRefs = useRef<Array<THREE.Mesh | null>>([]);
  const petalLineRefs = useRef<Array<THREE.Line | null>>([]);
  const leafLineRefs = useRef<Array<THREE.Line | null>>([]);
  const tmpVecs = useMemo(() => [] as THREE.Vector3[], []);
  const stemColor = useMemo(() => new THREE.Color('#99f6e4'), []);
  const wiltStem = useMemo(() => new THREE.Color('#6b8f7d'), []);
  const petalColor = useMemo(() => new THREE.Color('#f9a8d4'), []);
  const wiltPetal = useMemo(() => new THREE.Color('#b08968'), []);
  const leafColor = useMemo(() => new THREE.Color('#86efac'), []);
  const wiltLeaf = useMemo(() => new THREE.Color('#7c6f4f'), []);
  const mixed = useMemo(() => new THREE.Color(), []);

  useFrame(({ clock }) => {
    const timeline = timelineRef.current;
    const prev = previousTimelineRef.current;
    if (timeline + 0.001 < prev) {
      setCycleSeed((seed) => seed + 7919);
    }
    previousTimelineRef.current = timeline;

    const state = getFlowerLifecycleState(timeline);
    const t = clock.elapsedTime;
    const maxHeight = Math.max(0.001, variant.maxHeight);

    const root = rootRef.current;
    if (root) {
      root.position.y = -1;
      root.rotation.z = -(state.stemLean * 0.06 + state.stemDroop * 0.1);
      root.rotation.x = Math.sin(t * 0.27) * 0.02;
    }

    stemMeshRefs.current.forEach((mesh, idx) => {
      if (!mesh) return;
      const branch = variant.branches[idx];
      const branchPoints = visibleBranchPoints(branch, state.growth, maxHeight);
      const visible = !!branchPoints;
      mesh.visible = visible;
      if (!visible || !branchPoints) return;

      tmpVecs.length = 0;
      for (let i = 0; i < branchPoints.length; i++) {
        const tp = transformPoint(branchPoints[i], maxHeight, state, t);
        tmpVecs.push(new THREE.Vector3(tp.x, tp.y, tp.z));
      }

      const start = tmpVecs[0];
      const end = tmpVecs[tmpVecs.length - 1];
      if (!start || !end) return;

      // Build smooth branch tubes from visible branch polyline.
      const curve = new THREE.CatmullRomCurve3(tmpVecs, false, 'catmullrom', 0.35);
      const branchAnchor = clamp01(end.y / maxHeight);
      const taper = 1 - branchAnchor * 0.52;
      const radius = (0.012 * Math.pow(0.74, branch.depth)) * taper * (0.94 + ((idx * 13) % 7) / 100);
      const tubeSegments = Math.max(8, tmpVecs.length * 6);
      const nextGeometry = new THREE.TubeGeometry(curve, tubeSegments, Math.max(0.0025, radius), 20, false);
      if (mesh.geometry) mesh.geometry.dispose();
      mesh.geometry = nextGeometry;

      mesh.position.set(0, 0, 0);
      mesh.quaternion.identity();
      mesh.scale.set(1, 1, 1);
      mixed.lerpColors(stemColor, wiltStem, state.desaturation * 0.9);
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.color.copy(mixed);
      mat.roughness = 0.62 + state.desaturation * 0.22;
      mat.metalness = 0.03;
      mat.emissive.copy(mixed).multiplyScalar(0.08 + state.bloomOpen * 0.05);
    });

    petalLineRefs.current.forEach((line, idx) => {
      if (!line) return;
      const curve = blossomCurves[idx];
      const anchor = clamp01(curve.center.y / maxHeight);
      const stemArrival = blossomGrowthFactor(state.growth, anchor);
      const localBloom = stemArrival * state.bloomOpen;
      const visible = stemArrival > 0.01;
      line.visible = visible;
      if (!visible) return;

      const transformedCenter = transformPoint(curve.center, maxHeight, state, t);
      const attr = line.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < curve.points.length; i++) {
        const p = transformPoint(curve.points[i], maxHeight, state, t);
        const spread = 0.08 + localBloom * 1.07;
        const px = transformedCenter.x + (p.x - transformedCenter.x) * spread;
        const py =
          transformedCenter.y +
          (p.y - transformedCenter.y) * spread +
          localBloom * 0.1 -
          state.petalCurl * localBloom * 0.14 * (i / Math.max(1, curve.points.length - 1));
        const pz = transformedCenter.z + (p.z - transformedCenter.z) * spread;
        attr.setXYZ(i, px, py, pz);
      }
      attr.needsUpdate = true;
      mixed.lerpColors(petalColor, wiltPetal, state.colorBlend * 0.95);
      const mat = line.material as THREE.LineBasicMaterial;
      mat.color.copy(mixed);
      mat.opacity = 0.15 + localBloom * 0.72 - state.desaturation * 0.2;
      mat.transparent = true;
    });

    leafLineRefs.current.forEach((line, idx) => {
      if (!line) return;
      const curve = leafCurves[idx];
      const anchor = clamp01(curve.center.y / maxHeight);
      const stemArrival = blossomGrowthFactor(state.growth, anchor);
      const localLeaf = stemArrival * (0.7 + state.bloomOpen * 0.3);
      const visible = stemArrival > 0.02;
      line.visible = visible;
      if (!visible) return;

      const transformedCenter = transformPoint(curve.center, maxHeight, state, t);
      const attr = line.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < curve.points.length; i++) {
        const p = transformPoint(curve.points[i], maxHeight, state, t);
        const spread = 0.1 + localLeaf * 0.92;
        const px = transformedCenter.x + (p.x - transformedCenter.x) * spread;
        const py =
          transformedCenter.y +
          (p.y - transformedCenter.y) * spread -
          state.stemDroop * localLeaf * 0.07 * (i / Math.max(1, curve.points.length - 1));
        const pz = transformedCenter.z + (p.z - transformedCenter.z) * spread;
        attr.setXYZ(i, px, py, pz);
      }
      attr.needsUpdate = true;
      mixed.lerpColors(leafColor, wiltLeaf, state.desaturation * 0.9);
      const mat = line.material as THREE.LineBasicMaterial;
      mat.color.copy(mixed);
      mat.opacity = 0.18 + localLeaf * 0.58 - state.desaturation * 0.14;
      mat.transparent = true;
    });
  });

  return (
    <group ref={rootRef}>
      {variant.branches.map((branch, idx) => (
        <mesh
          key={`stem-${cycleSeed}-${branch.id}-${idx}`}
          ref={(mesh) => {
            stemMeshRefs.current[idx] = mesh;
          }}
        >
          <tubeGeometry args={[new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.05, 0)]), 8, 0.01, 20, false]} />
          <meshStandardMaterial color="#99f6e4" />
        </mesh>
      ))}
      {blossomCurves.map((curve: BlossomCurve, idx) => (
        <line
          key={`petal-${cycleSeed}-${idx}`}
          ref={(line) => {
            petalLineRefs.current[idx] = line;
          }}
        >
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[
                new Float32Array(
                  curve.points.flatMap((p) => [p.x, p.y, p.z])
                ),
                3,
              ]}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#f9a8d4" transparent opacity={0.6} />
        </line>
      ))}
      {leafCurves.map((curve: LeafCurve, idx) => (
        <line
          key={`leaf-${cycleSeed}-${idx}`}
          ref={(line) => {
            leafLineRefs.current[idx] = line;
          }}
        >
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[
                new Float32Array(curve.points.flatMap((p) => [p.x, p.y, p.z])),
                3,
              ]}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#86efac" transparent opacity={0.48} />
        </line>
      ))}
    </group>
  );
}

function FlowerLifecycleScene({
  durationMs,
  loop,
  phaseOverride,
  baseSeed,
}: {
  durationMs: number;
  loop: boolean;
  phaseOverride: number | undefined;
  baseSeed: number;
}) {
  const timelineRef = useRef(0);
  const elapsedMsRef = useRef(0);

  useFrame((_, delta) => {
    if (typeof phaseOverride === 'number') {
      timelineRef.current = clamp01(phaseOverride);
      return;
    }

    elapsedMsRef.current += delta * 1000;
    const normalized = elapsedMsRef.current / Math.max(1, durationMs);
    timelineRef.current = loop ? normalized % 1 : clamp01(normalized);
  });

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 0.5, 3.2]} fov={44} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[2.5, 3, 1.5]} intensity={0.45} />
      <directionalLight position={[-2, 2.6, -2]} intensity={0.25} />
      <FlowerLineArtActor timelineRef={timelineRef} baseSeed={baseSeed} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.05, 0]}>
        <circleGeometry args={[3.5, 48]} />
        <meshStandardMaterial color="#111827" roughness={0.95} metalness={0} />
      </mesh>

      <OrbitControls enablePan={false} minDistance={2.4} maxDistance={5} target={[0, 0.1, 0]} />
    </>
  );
}

export function FlowerLifecycleVisual({
  className = '',
  durationMs = 14000,
  loop = true,
  phaseOverride,
  baseSeed = 1337,
}: FlowerLifecycleVisualProps) {
  return (
    <div className={`relative w-full h-full bg-black ${className}`}>
      <Canvas
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
          gl.setClearColor(0x05070b, 1);
        }}
      >
        <FlowerLifecycleScene
          durationMs={durationMs}
          loop={loop}
          phaseOverride={phaseOverride}
          baseSeed={baseSeed}
        />
      </Canvas>
      <div className="pointer-events-none absolute top-3 left-3 rounded bg-black/60 px-3 py-1 text-xs text-white/90">
        L-system + Bezier line mode. A new variant appears each lifecycle loop.
      </div>
    </div>
  );
}
