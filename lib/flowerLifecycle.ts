export type FlowerLifecyclePhase = 'grow' | 'bloom' | 'wilt';

export interface FlowerLifecycleState {
  t: number;
  phase: FlowerLifecyclePhase;
  growth: number;
  bloomOpen: number;
  stemDroop: number;
  stemLean: number;
  desaturation: number;
  petalCurl: number;
  colorBlend: number;
}

export interface FlowerLifecycleTimings {
  growEnd: number;
  bloomEnd: number;
}

export const DEFAULT_FLOWER_LIFECYCLE_TIMINGS: FlowerLifecycleTimings = {
  growEnd: 0.45,
  bloomEnd: 0.7,
};

export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function inverseLerp(start: number, end: number, value: number): number {
  if (start === end) return 0;
  return clamp01((value - start) / (end - start));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const x = inverseLerp(edge0, edge1, value);
  return x * x * (3 - 2 * x);
}

export function getFlowerLifecycleState(
  timelineT: number,
  timings: FlowerLifecycleTimings = DEFAULT_FLOWER_LIFECYCLE_TIMINGS
): FlowerLifecycleState {
  const t = clamp01(timelineT);
  const growEnd = clamp01(timings.growEnd);
  const bloomEnd = Math.max(growEnd, clamp01(timings.bloomEnd));

  if (t <= growEnd) {
    const growT = smoothstep(0, Math.max(0.001, growEnd), t);
    return {
      t,
      phase: 'grow',
      growth: 0.1 + growT * 0.9,
      bloomOpen: growT * 0.55,
      stemDroop: 0,
      stemLean: growT * 0.08,
      desaturation: 0,
      petalCurl: 0,
      colorBlend: growT * 0.4,
    };
  }

  if (t <= bloomEnd) {
    const bloomT = smoothstep(growEnd, Math.max(growEnd + 0.001, bloomEnd), t);
    return {
      t,
      phase: 'bloom',
      growth: 1,
      bloomOpen: 0.55 + bloomT * 0.45,
      stemDroop: bloomT * 0.06,
      stemLean: 0.08 + bloomT * 0.04,
      desaturation: bloomT * 0.08,
      petalCurl: bloomT * 0.08,
      colorBlend: 0.4 + bloomT * 0.45,
    };
  }

  const wiltT = smoothstep(bloomEnd, 1, t);
  return {
    t,
    phase: 'wilt',
    growth: 1 - wiltT * 0.28,
    bloomOpen: 1 - wiltT * 0.82,
    stemDroop: 0.06 + wiltT * 0.84,
    stemLean: 0.12 + wiltT * 0.2,
    desaturation: 0.08 + wiltT * 0.82,
    petalCurl: 0.08 + wiltT * 0.9,
    colorBlend: 0.85 + wiltT * 0.15,
  };
}
