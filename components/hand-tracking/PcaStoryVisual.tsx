'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';

import { PCA_STORY_STATES } from '@/lib/storyboards/pcaStoryboard';
import {
  applyStateStep,
  interpolatePointCloudPath,
  PCA_INITIAL_CAMERA_POSE,
  type Vec3,
} from '@/lib/storyboards/pcaStoryRuntime';

interface PcaStoryVisualProps {
  hands: unknown[];
  className?: string;
}
type StoryNavAction = 'prev' | 'next';
const clampStateIndex = (index: number, total: number): number => {
  if (total <= 0) return 0;
  return Math.min(Math.max(index, 0), total - 1);
};

const PC1 = new THREE.Vector3(1, 0.35, 0.12).normalize();
const PC2 = new THREE.Vector3(-0.2, 0.95, 0.2).normalize();

function seeded(index: number): number {
  const x = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function generateRawCloud(count: number): Vec3[] {
  const points: Vec3[] = [];
  for (let i = 0; i < count; i += 1) {
    const a = seeded(i * 3 + 1) * 2 - 1;
    const b = seeded(i * 3 + 2) * 2 - 1;
    const c = seeded(i * 3 + 3) * 2 - 1;
    points.push({
      x: a * 1.35 + b * 0.25,
      y: a * 0.45 + b * 0.9 + c * 0.15,
      z: a * 0.1 + b * 0.2 + c * 0.6,
    });
  }
  return points;
}

function meanOf(points: Vec3[]): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const point of points) {
    x += point.x;
    y += point.y;
    z += point.z;
  }
  const count = Math.max(1, points.length);
  return { x: x / count, y: y / count, z: z / count };
}

function transformClouds(rawCloud: Vec3[]) {
  const mu = meanOf(rawCloud);
  const centered = rawCloud.map((point) => ({
    x: point.x - mu.x,
    y: point.y - mu.y,
    z: point.z - mu.z,
  }));

  const projectToPlane = (point: Vec3) => {
    const vector = new THREE.Vector3(point.x, point.y, point.z);
    const v1 = PC1.dot(vector);
    const v2 = PC2.dot(vector);
    const projected = new THREE.Vector3().addScaledVector(PC1, v1).addScaledVector(PC2, v2);
    return { x: projected.x, y: projected.y, z: projected.z };
  };

  const projected2d = centered.map(projectToPlane);
  const reconstructed = projected2d.map((point) => ({ ...point }));
  const withOutliers = centered.map((point, index) =>
    index < 12 ? { x: point.x + 1.8, y: point.y + 0.9, z: point.z + 0.25 } : point
  );
  const curved = centered.map((point) => {
    const curve = point.x * 1.25;
    return {
      x: curve,
      y: Math.sin(curve * 1.35) * 0.55 + point.y * 0.2,
      z: Math.cos(curve * 0.75) * 0.45 + point.z * 0.22,
    };
  });

  return { centered, projected2d, reconstructed, withOutliers, curved };
}

interface DeltaArrow {
  start: Vec3;
  end: Vec3;
  direction: Vec3;
  length: number;
}

function buildDeltaArrows(fromPoints: Vec3[], toPoints: Vec3[], maxArrows: number = 48): DeltaArrow[] {
  const arrows: DeltaArrow[] = [];
  const length = Math.min(fromPoints.length, toPoints.length);
  if (length === 0) return arrows;
  const stride = Math.max(1, Math.floor(length / maxArrows));

  for (let i = 0; i < length; i += stride) {
    const start = fromPoints[i];
    const target = toPoints[i];
    const dx = target.x - start.x;
    const dy = target.y - start.y;
    const dz = target.z - start.z;
    const magnitude = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (magnitude < 0.035) continue;

    arrows.push({
      start,
      end: target,
      direction: { x: dx / magnitude, y: dy / magnitude, z: dz / magnitude },
      length: magnitude,
    });
  }

  return arrows;
}

function StoryScene({
  points,
  centeredCloud,
  projectedCloud,
  stateIndex,
  deltaFromCloud,
  deltaToCloud,
  deltaProgress,
}: {
  points: Vec3[];
  centeredCloud: Vec3[];
  projectedCloud: Vec3[];
  stateIndex: number;
  deltaFromCloud: Vec3[];
  deltaToCloud: Vec3[];
  deltaProgress: number;
}) {
  const pointGeometryRef = useRef<THREE.BufferGeometry>(null);
  const residualGeometryRef = useRef<THREE.BufferGeometry>(null);
  const upVector = useMemo(() => new THREE.Vector3(0, 1, 0), []);

  const pointPositions = useMemo(() => {
    const values = new Float32Array(points.length * 3);
    for (let i = 0; i < points.length; i += 1) {
      values[i * 3] = points[i].x;
      values[i * 3 + 1] = points[i].y;
      values[i * 3 + 2] = points[i].z;
    }
    return values;
  }, [points]);

  const pointColors = useMemo(() => {
    const color = new THREE.Color();
    const values = new Float32Array(points.length * 3);
    for (let i = 0; i < points.length; i += 1) {
      const hue = 0.58 + ((i % 16) / 16) * 0.18;
      color.setHSL(hue, 0.75, 0.6);
      values[i * 3] = color.r;
      values[i * 3 + 1] = color.g;
      values[i * 3 + 2] = color.b;
    }
    return values;
  }, [points.length]);

  useEffect(() => {
    if (!pointGeometryRef.current) return;
    pointGeometryRef.current.setAttribute('position', new THREE.BufferAttribute(pointPositions, 3));
    pointGeometryRef.current.setAttribute('color', new THREE.BufferAttribute(pointColors, 3));
    pointGeometryRef.current.computeBoundingSphere();
  }, [pointPositions, pointColors]);

  useEffect(() => {
    if (!residualGeometryRef.current) return;
    const residualPairs = Math.min(24, centeredCloud.length);
    const residualPositions = new Float32Array(residualPairs * 6);
    for (let i = 0; i < residualPairs; i += 1) {
      residualPositions[i * 6] = projectedCloud[i].x;
      residualPositions[i * 6 + 1] = projectedCloud[i].y;
      residualPositions[i * 6 + 2] = projectedCloud[i].z;
      residualPositions[i * 6 + 3] = centeredCloud[i].x;
      residualPositions[i * 6 + 4] = centeredCloud[i].y;
      residualPositions[i * 6 + 5] = centeredCloud[i].z;
    }
    residualGeometryRef.current.setAttribute('position', new THREE.BufferAttribute(residualPositions, 3));
    residualGeometryRef.current.computeBoundingSphere();
  }, [centeredCloud, projectedCloud]);

  const axisScale = 2.1;
  const principalAxisPoints = useMemo(() => {
    const positions = new Float32Array([
      -PC1.x * axisScale, -PC1.y * axisScale, -PC1.z * axisScale, PC1.x * axisScale, PC1.y * axisScale, PC1.z * axisScale,
      -PC2.x * axisScale, -PC2.y * axisScale, -PC2.z * axisScale, PC2.x * axisScale, PC2.y * axisScale, PC2.z * axisScale,
    ]);
    return positions;
  }, [axisScale]);

  const deltaArrows = useMemo(() => buildDeltaArrows(deltaFromCloud, deltaToCloud, 56), [deltaFromCloud, deltaToCloud]);
  const deltaLinePositions = useMemo(() => {
    const values = new Float32Array(deltaArrows.length * 6);
    for (let i = 0; i < deltaArrows.length; i += 1) {
      const arrow = deltaArrows[i];
      const tipX = arrow.start.x + (arrow.end.x - arrow.start.x) * deltaProgress;
      const tipY = arrow.start.y + (arrow.end.y - arrow.start.y) * deltaProgress;
      const tipZ = arrow.start.z + (arrow.end.z - arrow.start.z) * deltaProgress;
      values[i * 6] = arrow.start.x;
      values[i * 6 + 1] = arrow.start.y;
      values[i * 6 + 2] = arrow.start.z;
      values[i * 6 + 3] = tipX;
      values[i * 6 + 4] = tipY;
      values[i * 6 + 5] = tipZ;
    }
    return values;
  }, [deltaArrows, deltaProgress]);

  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[4, 6, 3]} intensity={0.95} />
      <Environment preset="city" />

      <line>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={2} array={new Float32Array([-axisScale, 0, 0, axisScale, 0, 0])} itemSize={3} />
        </bufferGeometry>
        <lineBasicMaterial color="#ef4444" transparent opacity={0.9} />
      </line>
      <line>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={2} array={new Float32Array([0, -axisScale, 0, 0, axisScale, 0])} itemSize={3} />
        </bufferGeometry>
        <lineBasicMaterial color="#22c55e" transparent opacity={0.9} />
      </line>
      <line>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={2} array={new Float32Array([0, 0, -axisScale, 0, 0, axisScale])} itemSize={3} />
        </bufferGeometry>
        <lineBasicMaterial color="#3b82f6" transparent opacity={0.9} />
      </line>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={principalAxisPoints.length / 3}
            array={principalAxisPoints}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color={stateIndex >= 3 ? '#93c5fd' : '#475569'} transparent opacity={0.7} />
      </lineSegments>
      {deltaArrows.length > 0 && (
        <lineSegments>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={deltaLinePositions.length / 3}
              array={deltaLinePositions}
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#facc15" transparent opacity={0.72} />
        </lineSegments>
      )}
      {deltaArrows.map((arrow, index) => {
        const tipX = arrow.start.x + (arrow.end.x - arrow.start.x) * deltaProgress;
        const tipY = arrow.start.y + (arrow.end.y - arrow.start.y) * deltaProgress;
        const tipZ = arrow.start.z + (arrow.end.z - arrow.start.z) * deltaProgress;
        const direction = new THREE.Vector3(arrow.direction.x, arrow.direction.y, arrow.direction.z);
        const quaternion = new THREE.Quaternion().setFromUnitVectors(upVector, direction);
        const coneSize = Math.min(0.06, Math.max(0.03, arrow.length * 0.08));
        return (
          <mesh
            key={`delta-arrow-tip-${index}`}
            position={[tipX, tipY, tipZ]}
            quaternion={quaternion}
          >
            <coneGeometry args={[coneSize * 0.55, coneSize, 8]} />
            <meshBasicMaterial color="#facc15" transparent opacity={0.85} />
          </mesh>
        );
      })}

      <points>
        <bufferGeometry ref={pointGeometryRef} />
        <pointsMaterial size={0.045} vertexColors sizeAttenuation transparent opacity={0.95} />
      </points>

      {stateIndex === 6 && (
        <lineSegments>
          <bufferGeometry ref={residualGeometryRef} />
          <lineBasicMaterial color="#f59e0b" transparent opacity={0.75} />
        </lineSegments>
      )}
    </>
  );
}

export function PcaStoryVisual({ hands: _hands, className = '' }: PcaStoryVisualProps) {
  const totalStates = PCA_STORY_STATES.length;
  const [stateIndex, setStateIndex] = useState(0);
  const [transitionTo, setTransitionTo] = useState<number | null>(null);
  const [transitionT, setTransitionT] = useState(0);
  const [lastAction, setLastAction] = useState<StoryNavAction | null>(null);
  const [arrowStartCloud, setArrowStartCloud] = useState<Vec3[] | null>(null);
  const [arrowEndCloud, setArrowEndCloud] = useState<Vec3[] | null>(null);
  const isScrubbingRef = useRef(false);

  const rawCloud = useMemo(() => generateRawCloud(260), []);
  const clouds = useMemo(() => transformClouds(rawCloud), [rawCloud]);

  const stateClouds = useMemo<Vec3[][]>(
    () => [
      rawCloud,
      rawCloud,
      clouds.centered,
      clouds.centered,
      clouds.centered,
      clouds.projected2d,
      clouds.reconstructed,
      clouds.centered,
      clouds.withOutliers,
      clouds.curved,
    ],
    [rawCloud, clouds]
  );

  const safeStateIndex = clampStateIndex(stateIndex, totalStates);
  const safeToIndex = transitionTo === null ? safeStateIndex : clampStateIndex(transitionTo, totalStates);

  const requestTransition = useCallback(
    (action: StoryNavAction) => {
      if (transitionTo !== null) return;
      const safeCurrent = safeStateIndex;
      const steppedIndex = applyStateStep(safeCurrent, action, totalStates);
      const nextIndex = clampStateIndex(steppedIndex, totalStates);
      if (nextIndex === safeCurrent) return;
      setArrowStartCloud(stateClouds[safeCurrent]);
      setArrowEndCloud(stateClouds[nextIndex]);
      setTransitionTo(nextIndex);
      setTransitionT(0);
      isScrubbingRef.current = false;
      setLastAction(action);
    },
    [safeStateIndex, stateClouds, totalStates, transitionTo]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        requestTransition('prev');
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        requestTransition('next');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [requestTransition]);

  useEffect(() => {
    if (transitionTo === null || isScrubbingRef.current) return;

    let rafId = 0;
    let start = performance.now();
    const durationMs = 700;

    const tick = (now: number) => {
      const normalized = Math.min(1, (now - start) / durationMs);
      const eased = normalized < 0.5 ? 4 * normalized * normalized * normalized : 1 - Math.pow(-2 * normalized + 2, 3) / 2;
      setTransitionT(eased);
      if (normalized >= 1) {
        setStateIndex(clampStateIndex(transitionTo, totalStates));
        setTransitionTo(null);
        setTransitionT(0);
        return;
      }
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame((now) => {
      start = now;
      tick(now);
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [totalStates, transitionTo]);

  const activeState = PCA_STORY_STATES[safeStateIndex];
  const toIndex = safeToIndex;
  const fromCloud = stateClouds[safeStateIndex];
  const toCloud = stateClouds[toIndex];
  const arrowLeadProgress =
    transitionTo !== null
      ? Math.min(1, transitionT / 0.35)
      : 1;
  const delayedPointProgress =
    transitionTo !== null
      ? Math.max(0, Math.min(1, (transitionT - 0.28) / 0.72))
      : 1;
  const phaseDeltaFromCloud = arrowStartCloud ?? stateClouds[Math.max(0, safeStateIndex - 1)];
  const phaseDeltaToCloud = arrowEndCloud ?? stateClouds[safeStateIndex];
  const phaseDeltaProgress = transitionTo !== null ? arrowLeadProgress : 1;
  const displayPoints = useMemo(() => {
    if (toIndex === safeStateIndex) return fromCloud;
    return interpolatePointCloudPath(fromCloud, toCloud, delayedPointProgress);
  }, [delayedPointProgress, fromCloud, safeStateIndex, toCloud, toIndex]);

  return (
    <div className={`relative w-full h-full bg-gradient-to-b from-slate-950 to-black ${className}`}>
      <div className="absolute top-4 left-4 z-20 max-w-md rounded-lg bg-black/70 backdrop-blur-sm p-3 text-white">
        <div className="text-xs uppercase tracking-wide text-slate-300">PCA Story Mode</div>
        <div className="text-lg font-semibold">{activeState.title}</div>
        <div className="text-sm text-slate-200">{activeState.presenterLine}</div>
        <div className="mt-1 text-xs text-emerald-300">{activeState.advancedAside}</div>
        <div className="mt-2 text-xs text-slate-400">
          Mouse drag rotates view. Use on-screen arrows or keyboard left/right to move through states.
        </div>
        <div className="mt-1 text-xs text-slate-400">
          Last action: {lastAction ?? 'none'} | Transition: {(transitionT * 100).toFixed(0)}%
        </div>
        <div className="mt-1 text-xs text-amber-300">
          Delta arrows show how sampled points move from one phase to the next.
        </div>
      </div>

      <div className="absolute bottom-4 left-4 right-4 z-20 rounded-lg bg-black/60 backdrop-blur-sm p-2">
        <div className="grid grid-cols-5 md:grid-cols-10 gap-1">
          {PCA_STORY_STATES.map((state, index) => (
            <div
              key={state.id}
              className={`h-2 rounded ${index === safeStateIndex ? 'bg-emerald-400' : index < safeStateIndex ? 'bg-sky-500' : 'bg-slate-600'}`}
              title={state.title}
            />
          ))}
        </div>
      </div>

      <div className="absolute right-4 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-2">
        <button
          type="button"
          aria-label="Previous state"
          onClick={() => requestTransition('prev')}
          disabled={safeStateIndex === 0 || transitionTo !== null}
          className="h-10 w-10 rounded-full bg-black/70 text-white text-xl hover:bg-black/85 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ←
        </button>
        <button
          type="button"
          aria-label="Next state"
          onClick={() => requestTransition('next')}
          disabled={safeStateIndex >= totalStates - 1 || transitionTo !== null}
          className="h-10 w-10 rounded-full bg-black/70 text-white text-xl hover:bg-black/85 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          →
        </button>
      </div>

      <Canvas
        key="pca-initial-camera"
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
          gl.setClearColor(0x020617, 1);
        }}
      >
        <PerspectiveCamera
          makeDefault
          position={[
            PCA_INITIAL_CAMERA_POSE.position.x,
            PCA_INITIAL_CAMERA_POSE.position.y,
            PCA_INITIAL_CAMERA_POSE.position.z,
          ]}
          fov={50}
        />
        <OrbitControls
          makeDefault
          target={[
            PCA_INITIAL_CAMERA_POSE.target.x,
            PCA_INITIAL_CAMERA_POSE.target.y,
            PCA_INITIAL_CAMERA_POSE.target.z,
          ]}
          enablePan={false}
          enableDamping
          dampingFactor={0.08}
          minDistance={2}
          maxDistance={8}
        />
        <StoryScene
          points={displayPoints}
          centeredCloud={clouds.centered}
          projectedCloud={clouds.projected2d}
          stateIndex={safeStateIndex}
          deltaFromCloud={phaseDeltaFromCloud}
          deltaToCloud={phaseDeltaToCloud}
          deltaProgress={phaseDeltaProgress}
        />
      </Canvas>
    </div>
  );
}
