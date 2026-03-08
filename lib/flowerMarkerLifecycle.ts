export type FlowerMarkerLifecycleState = 'growing' | 'holding' | 'decaying';

export interface FlowerMarkerLifecycleTimings {
  growSeconds: number;
  holdSeconds: number;
  decaySeconds: number;
}

export interface FlowerMarkerTransform {
  scaleX: number;
  scaleY: number;
  offsetY: number;
  sway: number;
  droop: number;
}

export interface FlowerMarkerLifecycleFrame {
  state: FlowerMarkerLifecycleState;
  stateProgress: number;
  lifeScale: number;
  transform: FlowerMarkerTransform;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export function getFlowerMarkerLifecycleFrame(
  markerAgeSeconds: number,
  timings: FlowerMarkerLifecycleTimings,
  whimsyIntensity: number
): FlowerMarkerLifecycleFrame {
  const growSeconds = Math.max(0.05, timings.growSeconds);
  const holdSeconds = Math.max(0, timings.holdSeconds);
  const decaySeconds = Math.max(0.05, timings.decaySeconds);
  const whimsy = Math.max(0, whimsyIntensity);
  const totalSeconds = growSeconds + holdSeconds + decaySeconds;
  const age = Math.max(0, markerAgeSeconds);

  let state: FlowerMarkerLifecycleState;
  let stateProgress = 0;
  let lifeScale = 0;

  if (age <= growSeconds) {
    state = 'growing';
    stateProgress = clamp01(age / growSeconds);
    lifeScale = 1 - Math.pow(1 - stateProgress, 3);
  } else if (age <= growSeconds + holdSeconds) {
    state = 'holding';
    stateProgress = holdSeconds <= 1e-6 ? 1 : clamp01((age - growSeconds) / holdSeconds);
    lifeScale = 1;
  } else if (age <= totalSeconds) {
    state = 'decaying';
    stateProgress = clamp01((age - growSeconds - holdSeconds) / decaySeconds);
    lifeScale = Math.max(0, 1 - Math.pow(stateProgress, 2));
  } else {
    state = 'decaying';
    stateProgress = 1;
    lifeScale = 0;
  }

  // State-driven plant-like transform envelope.
  const growthOvershoot =
    state === 'growing'
      ? Math.sin(clamp01((stateProgress - 0.58) / 0.42) * Math.PI) * (0.2 * whimsy)
      : 0;
  const decayDroop = state === 'decaying' ? 0.18 * stateProgress * (0.7 + whimsy * 0.45) : 0;
  const holdSettle = state === 'holding' ? (1 - stateProgress) * 0.03 * whimsy : 0;

  const scaleY = Math.max(0.18, 0.55 + lifeScale * 0.45 + growthOvershoot - decayDroop * 0.35 - holdSettle);
  const scaleX = Math.max(0.2, 0.86 + lifeScale * 0.14 - growthOvershoot * 0.48 - decayDroop * 0.08);
  const offsetY = -(1 - lifeScale) * (0.8 + whimsy * 0.4);
  const sway =
    (0.03 + whimsy * 0.025) *
    Math.sin(age * (state === 'decaying' ? 1.7 : 2.4)) *
    (0.35 + lifeScale * 0.65);

  return {
    state,
    stateProgress,
    lifeScale,
    transform: {
      scaleX,
      scaleY,
      offsetY,
      sway,
      droop: decayDroop,
    },
  };
}
