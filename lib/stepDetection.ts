import type { PoseLandmark } from '@/types/mediapipe';

export interface StepThresholds {
  downThreshold?: number;
  upThreshold?: number;
}

export type GaitPhase = 'stance' | 'swing';

export interface GaitThresholds {
  contactEnterStance?: number;
  contactExitStance?: number;
  velocityEnterSwing?: number;
  velocityEnterStance?: number;
}

const DEFAULT_DOWN_THRESHOLD = 0.0015;
const DEFAULT_UP_THRESHOLD = 0.0015;

export function isStepTransition(
  previousVelocity: number | null,
  currentVelocity: number,
  thresholds: StepThresholds = {}
): boolean {
  if (previousVelocity === null) return false;
  const downThreshold = thresholds.downThreshold ?? DEFAULT_DOWN_THRESHOLD;
  const upThreshold = thresholds.upThreshold ?? DEFAULT_UP_THRESHOLD;
  return previousVelocity > downThreshold && currentVelocity < -upThreshold;
}

export function smoothEwma(previous: number | null, next: number, alpha: number = 0.35): number {
  if (previous === null) return next;
  const clampedAlpha = Math.max(0.01, Math.min(1, alpha));
  return previous * (1 - clampedAlpha) + next * clampedAlpha;
}

export function updateGaitPhase(
  phase: GaitPhase,
  normalizedVelocity: number,
  contactScore: number,
  thresholds: GaitThresholds = {}
): GaitPhase {
  const contactEnterStance = thresholds.contactEnterStance ?? 0.7;
  const contactExitStance = thresholds.contactExitStance ?? 0.5;
  const velocityEnterSwing = thresholds.velocityEnterSwing ?? 0.055;
  const velocityEnterStance = thresholds.velocityEnterStance ?? 0.03;

  const speed = Math.abs(normalizedVelocity);
  if (phase === 'stance') {
    // Exit stance when contact weakens and motion grows.
    if (contactScore < contactExitStance && speed > velocityEnterSwing) {
      return 'swing';
    }
    return 'stance';
  }

  // In swing, re-enter stance when contact is strong and velocity settles.
  if (contactScore > contactEnterStance && speed < velocityEnterStance) {
    return 'stance';
  }
  return 'swing';
}

export function getFootAnchorPoint(
  landmarks: PoseLandmark[] | null,
  visibilityThreshold: number = 0.35
): { x: number; y: number } | null {
  if (!landmarks || landmarks.length < 33) return null;

  // Use ankle and heel points for both feet, then average.
  const candidateIndices = [27, 28, 29, 30];
  let sumX = 0;
  let sumY = 0;
  let count = 0;

  for (const index of candidateIndices) {
    const point = landmarks[index];
    if (!point) continue;
    if ((point.visibility ?? 1) < visibilityThreshold) continue;
    sumX += point.x;
    sumY += point.y;
    count += 1;
  }

  if (count === 0) return null;
  return { x: sumX / count, y: sumY / count };
}

export function getAverageHeelToAnkleSpan(
  landmarks: PoseLandmark[] | null,
  visibilityThreshold: number = 0.35
): number | null {
  if (!landmarks || landmarks.length < 33) return null;

  // Left span: heel(29) -> ankle(27), right span: heel(30) -> ankle(28)
  const spanPairs: Array<[number, number]> = [
    [29, 27],
    [30, 28],
  ];

  let total = 0;
  let count = 0;

  for (const [heelIndex, ankleIndex] of spanPairs) {
    const heel = landmarks[heelIndex];
    const ankle = landmarks[ankleIndex];
    if (!heel || !ankle) continue;
    if ((heel.visibility ?? 1) < visibilityThreshold || (ankle.visibility ?? 1) < visibilityThreshold) continue;

    // "Bottom of heel to top of ankle" is primarily vertical in image space.
    const span = Math.abs(heel.y - ankle.y);
    if (!Number.isFinite(span) || span <= 1e-6) continue;

    total += span;
    count += 1;
  }

  if (count === 0) return null;
  return total / count;
}

export function getBodyReferencePoint(
  landmarks: PoseLandmark[] | null,
  visibilityThreshold: number = 0.35
): { x: number; y: number } | null {
  if (!landmarks || landmarks.length < 33) return null;

  // Prefer hips, fallback to shoulders if hips are occluded.
  const primaryIndices = [23, 24];
  const fallbackIndices = [11, 12];

  const averageIndices = (indices: number[]): { x: number; y: number } | null => {
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    for (const index of indices) {
      const point = landmarks[index];
      if (!point) continue;
      if ((point.visibility ?? 1) < visibilityThreshold) continue;
      sumX += point.x;
      sumY += point.y;
      count += 1;
    }
    if (count === 0) return null;
    return { x: sumX / count, y: sumY / count };
  };

  return averageIndices(primaryIndices) ?? averageIndices(fallbackIndices);
}

