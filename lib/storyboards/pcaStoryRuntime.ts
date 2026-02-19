import type { MaterialStepAction } from '@/components/hand-tracking/MidasTouchVisual';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface CameraPose {
  position: Vec3;
  target: Vec3;
}

export const PCA_INITIAL_CAMERA_POSE: CameraPose = {
  position: { x: 2.9, y: 1.45, z: 3.3 },
  target: { x: 0, y: 0, z: 0 },
};

export function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function mapPinchDistanceToScrub(
  distance: number,
  minDistance: number = 0.02,
  maxDistance: number = 0.16
): number {
  if (!Number.isFinite(distance)) return 0;
  const normalized = (distance - minDistance) / (maxDistance - minDistance);
  return clamp01(normalized);
}

export function applyStateStep(
  currentIndex: number,
  action: MaterialStepAction,
  totalStates: number
): number {
  if (totalStates <= 0) return 0;
  if (action === 'next') return Math.min(totalStates - 1, currentIndex + 1);
  return Math.max(0, currentIndex - 1);
}

export function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

export function lerpPointCloud(a: Vec3[], b: Vec3[], t: number): Vec3[] {
  const length = Math.min(a.length, b.length);
  const result: Vec3[] = new Array(length);
  for (let i = 0; i < length; i += 1) {
    result[i] = lerpVec3(a[i], b[i], t);
  }
  return result;
}

export function interpolatePointPath(a: Vec3, b: Vec3, t: number, seed: number = 0): Vec3 {
  const tt = clamp01(t);
  const linear = lerpVec3(a, b, tt);
  const bend = Math.sin(tt * Math.PI) * 0.14;
  const wobbleX = Math.sin(seed * 0.37) * 0.035;
  const wobbleY = Math.cos(seed * 0.23) * 0.03;

  return {
    x: linear.x + wobbleX * bend,
    y: linear.y + (0.12 + wobbleY) * bend,
    z: linear.z + Math.cos(seed * 0.41) * 0.03 * bend,
  };
}

export function interpolatePointCloudPath(a: Vec3[], b: Vec3[], t: number): Vec3[] {
  const length = Math.min(a.length, b.length);
  const result: Vec3[] = new Array(length);
  for (let i = 0; i < length; i += 1) {
    result[i] = interpolatePointPath(a[i], b[i], t, i + 1);
  }
  return result;
}

