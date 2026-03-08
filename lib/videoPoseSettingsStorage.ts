export type VideoPoseStepMarkerStyle = 'boxes' | 'flowers' | 'flowers-3d';
export type VideoPoseToonTextureMode = 'none' | 'stipple' | 'hatch';

export interface VideoPoseMarkerSettings {
  bodyTrackingEnabled: boolean;
  showBodyCamPoints: boolean;
  realtimeBackgroundSegmentationEnabled: boolean;
  stepSensitivityPercent: number;
  pointSizeScale: number;
  boxHeightScale: number;
  boxGrowthSeconds: number;
  flowerBloomSeconds: number;
  flowerDecaySeconds: number;
  whimsyIntensity: number;
  toonTextureMode: VideoPoseToonTextureMode;
  showStepPoints: boolean;
  stepMarkerStyle: VideoPoseStepMarkerStyle;
}

const STORAGE_KEY = 'viz9:video-pose:marker-settings';

export const DEFAULT_VIDEO_POSE_MARKER_SETTINGS: VideoPoseMarkerSettings = {
  bodyTrackingEnabled: true,
  showBodyCamPoints: true,
  realtimeBackgroundSegmentationEnabled: true,
  stepSensitivityPercent: 6,
  pointSizeScale: 1.2,
  boxHeightScale: 12,
  boxGrowthSeconds: 0.4,
  flowerBloomSeconds: 0.4,
  flowerDecaySeconds: 1.12,
  whimsyIntensity: 1,
  toonTextureMode: 'stipple',
  showStepPoints: true,
  stepMarkerStyle: 'flowers',
};

function isMarkerStyle(value: unknown): value is VideoPoseStepMarkerStyle {
  return value === 'boxes' || value === 'flowers' || value === 'flowers-3d';
}

function isToonTextureMode(value: unknown): value is VideoPoseToonTextureMode {
  return value === 'none' || value === 'stipple' || value === 'hatch';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sanitize(raw: Partial<VideoPoseMarkerSettings>): VideoPoseMarkerSettings {
  return {
    bodyTrackingEnabled: Boolean(raw.bodyTrackingEnabled ?? DEFAULT_VIDEO_POSE_MARKER_SETTINGS.bodyTrackingEnabled),
    showBodyCamPoints: Boolean(raw.showBodyCamPoints ?? DEFAULT_VIDEO_POSE_MARKER_SETTINGS.showBodyCamPoints),
    realtimeBackgroundSegmentationEnabled: Boolean(
      raw.realtimeBackgroundSegmentationEnabled ??
        DEFAULT_VIDEO_POSE_MARKER_SETTINGS.realtimeBackgroundSegmentationEnabled
    ),
    stepSensitivityPercent: clamp(Number(raw.stepSensitivityPercent ?? DEFAULT_VIDEO_POSE_MARKER_SETTINGS.stepSensitivityPercent), 1, 20),
    pointSizeScale: clamp(Number(raw.pointSizeScale ?? DEFAULT_VIDEO_POSE_MARKER_SETTINGS.pointSizeScale), 0.5, 4),
    boxHeightScale: clamp(Number(raw.boxHeightScale ?? DEFAULT_VIDEO_POSE_MARKER_SETTINGS.boxHeightScale), 0.5, 500),
    boxGrowthSeconds: clamp(Number(raw.boxGrowthSeconds ?? DEFAULT_VIDEO_POSE_MARKER_SETTINGS.boxGrowthSeconds), 0.05, 3),
    flowerBloomSeconds: clamp(
      Number(raw.flowerBloomSeconds ?? DEFAULT_VIDEO_POSE_MARKER_SETTINGS.flowerBloomSeconds),
      0.05,
      3
    ),
    flowerDecaySeconds: clamp(
      Number(raw.flowerDecaySeconds ?? DEFAULT_VIDEO_POSE_MARKER_SETTINGS.flowerDecaySeconds),
      0.2,
      5
    ),
    whimsyIntensity: clamp(Number(raw.whimsyIntensity ?? DEFAULT_VIDEO_POSE_MARKER_SETTINGS.whimsyIntensity), 0, 2),
    toonTextureMode: isToonTextureMode(raw.toonTextureMode)
      ? raw.toonTextureMode
      : DEFAULT_VIDEO_POSE_MARKER_SETTINGS.toonTextureMode,
    showStepPoints: Boolean(raw.showStepPoints ?? DEFAULT_VIDEO_POSE_MARKER_SETTINGS.showStepPoints),
    stepMarkerStyle: isMarkerStyle(raw.stepMarkerStyle) ? raw.stepMarkerStyle : DEFAULT_VIDEO_POSE_MARKER_SETTINGS.stepMarkerStyle,
  };
}

export function loadVideoPoseMarkerSettings(): VideoPoseMarkerSettings {
  if (typeof window === 'undefined') return DEFAULT_VIDEO_POSE_MARKER_SETTINGS;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_VIDEO_POSE_MARKER_SETTINGS;
    const parsed = JSON.parse(stored) as Partial<VideoPoseMarkerSettings>;
    return sanitize(parsed);
  } catch {
    return DEFAULT_VIDEO_POSE_MARKER_SETTINGS;
  }
}

export function saveVideoPoseMarkerSettings(settings: VideoPoseMarkerSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitize(settings)));
  } catch {
    // Best effort persistence only.
  }
}
