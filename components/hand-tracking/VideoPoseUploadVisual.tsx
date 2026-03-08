'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { estimateBorderTranslation, rgbaToGrayscale, sampleBorderPoints } from '@/lib/cameraMotion';
import { getFlowerMarkerLifecycleFrame, type FlowerMarkerLifecycleFrame } from '@/lib/flowerMarkerLifecycle';
import { generateStepFlowerShape, generateStepFlowerSprite3D, getStepFlowerVariant } from '@/lib/stepFlowerAsset';
import { createPoseDetector, POSE_CONNECTIONS_LIST, processPoseResults } from '@/lib/mediapipe/pose';
import { smoothEwma, updateGaitPhase } from '@/lib/stepDetection';
import {
  DEFAULT_VIDEO_POSE_MARKER_SETTINGS,
  loadVideoPoseMarkerSettings,
  saveVideoPoseMarkerSettings,
  type VideoPoseStepMarkerStyle,
  type VideoPoseToonTextureMode,
} from '@/lib/videoPoseSettingsStorage';
import { normalizeTrimWindow, resolvePlaybackBoundary } from '@/lib/videoTrim';

interface VideoPoseUploadVisualProps {
  className?: string;
}

type SourceMode = 'upload' | 'realtime';
type StepMarkerStyle = VideoPoseStepMarkerStyle;
type ToonTextureMode = VideoPoseToonTextureMode;

interface StepMarker {
  time: number;
  x: number;
  y: number;
  camRefX: number;
  camRefY: number;
  foot: 'left' | 'right';
  stepMagnitude: number;
}

interface FootLayoutPoint {
  x: number;
  y: number;
  label: 'ankle' | 'heel' | 'toe';
}

interface FootLayoutData {
  left: FootLayoutPoint[] | null;
  right: FootLayoutPoint[] | null;
}

interface FootTrackerState {
  smoothedY: number | null;
  phase: 'stance' | 'swing';
  swingStartTime: number | null;
}

interface StepDebugSide {
  phase: 'stance' | 'swing';
  stableSamples: number;
  contactScore: number;
  normalizedVelocity: number;
}

interface StepDebugData {
  sampleTick: number;
  left: StepDebugSide;
  right: StepDebugSide;
}

const STEP_DETECTION_SAMPLE_HZ = 20;
const STEP_DETECTION_SAMPLE_INTERVAL = 1 / STEP_DETECTION_SAMPLE_HZ;
const MIN_STABLE_LANDMARK_SAMPLES = 4;
const MIN_STABLE_VISIBILITY = 0.55;
const MAX_SPAN_DRIFT_RATIO = 0.45;
const STEP_CONTACT_THRESHOLD = 0.72;

const extractFootLayout = (
  landmarks: Array<{ x: number; y: number; visibility?: number }> | null,
  side: 'left' | 'right',
  visibilityThreshold: number = 0.35
): FootLayoutPoint[] | null => {
  if (!landmarks || landmarks.length < 33) return null;
  const ankleIndex = side === 'left' ? 27 : 28;
  const heelIndex = side === 'left' ? 29 : 30;
  const toeIndex = side === 'left' ? 31 : 32;

  const ankle = landmarks[ankleIndex];
  const heel = landmarks[heelIndex];
  const toe = landmarks[toeIndex];
  if (!ankle || !heel || !toe) return null;
  if ((ankle.visibility ?? 1) < visibilityThreshold) return null;
  if ((heel.visibility ?? 1) < visibilityThreshold) return null;
  if ((toe.visibility ?? 1) < visibilityThreshold) return null;

  return [
    { x: ankle.x, y: ankle.y, label: 'ankle' },
    { x: heel.x, y: heel.y, label: 'heel' },
    { x: toe.x, y: toe.y, label: 'toe' },
  ];
};

const normalizeFootLayout = (points: FootLayoutPoint[]): FootLayoutPoint[] => {
  const ankle = points.find((point) => point.label === 'ankle') ?? points[0];
  const centered = points.map((point) => ({ ...point, x: point.x - ankle.x, y: point.y - ankle.y }));
  const maxDistance = Math.max(
    ...centered.map((point) => Math.sqrt(point.x * point.x + point.y * point.y)),
    0.0001
  );
  return centered.map((point) => ({
    ...point,
    x: point.x / maxDistance,
    y: point.y / maxDistance,
  }));
};

const getSideFootAnchor = (
  landmarks: Array<{ x: number; y: number; visibility?: number }> | null,
  side: 'left' | 'right',
  visibilityThreshold: number = 0.35
): { x: number; y: number } | null => {
  if (!landmarks || landmarks.length < 33) return null;
  const ankleIndex = side === 'left' ? 27 : 28;
  const heelIndex = side === 'left' ? 29 : 30;
  const toeIndex = side === 'left' ? 31 : 32;
  const points = [landmarks[ankleIndex], landmarks[heelIndex], landmarks[toeIndex]];

  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (const point of points) {
    if (!point) continue;
    if ((point.visibility ?? 1) < visibilityThreshold) continue;
    sumX += point.x;
    sumY += point.y;
    count += 1;
  }
  if (count === 0) return null;
  return { x: sumX / count, y: sumY / count };
};

const getSideHeelToAnkleSpan = (
  landmarks: Array<{ x: number; y: number; visibility?: number }> | null,
  side: 'left' | 'right',
  visibilityThreshold: number = 0.35
): number | null => {
  if (!landmarks || landmarks.length < 33) return null;
  const ankleIndex = side === 'left' ? 27 : 28;
  const heelIndex = side === 'left' ? 29 : 30;
  const ankle = landmarks[ankleIndex];
  const heel = landmarks[heelIndex];
  if (!ankle || !heel) return null;
  if ((ankle.visibility ?? 1) < visibilityThreshold || (heel.visibility ?? 1) < visibilityThreshold) return null;
  const span = Math.abs(heel.y - ankle.y);
  if (!Number.isFinite(span) || span <= 1e-6) return null;
  return span;
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const getSideFootPoints = (
  landmarks: Array<{ x: number; y: number; visibility?: number }> | null,
  side: 'left' | 'right',
  visibilityThreshold: number = 0.35
): Array<{ x: number; y: number }> | null => {
  if (!landmarks || landmarks.length < 33) return null;
  const indices = side === 'left' ? [27, 29, 31] : [28, 30, 32];
  const points: Array<{ x: number; y: number }> = [];
  for (const index of indices) {
    const point = landmarks[index];
    if (!point) continue;
    if ((point.visibility ?? 1) < visibilityThreshold) continue;
    points.push({ x: point.x, y: point.y });
  }
  return points.length > 0 ? points : null;
};

const computeFootContactScore = (
  landmarks: Array<{ x: number; y: number; visibility?: number }> | null,
  side: 'left' | 'right',
  currentGray: Uint8Array,
  previousGray: Uint8Array | null,
  width: number,
  height: number,
  cameraDxPx: number,
  cameraDyPx: number
): number => {
  if (!previousGray) return 0.5;
  const points = getSideFootPoints(landmarks, side);
  if (!points) return 0.5;

  const radius = 3;
  let diffSum = 0;
  let sampleCount = 0;

  for (const point of points) {
    const cx = Math.round(point.x * width);
    const cy = Math.round(point.y * height);
    for (let oy = -radius; oy <= radius; oy += 1) {
      for (let ox = -radius; ox <= radius; ox += 1) {
        const x = cx + ox;
        const y = cy + oy;
        const prevX = Math.round(cx - cameraDxPx + ox);
        const prevY = Math.round(cy - cameraDyPx + oy);
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        if (prevX < 0 || prevX >= width || prevY < 0 || prevY >= height) continue;
        const currentValue = currentGray[y * width + x];
        const previousValue = previousGray[prevY * width + prevX];
        diffSum += Math.abs(currentValue - previousValue);
        sampleCount += 1;
      }
    }
  }

  if (sampleCount === 0) return 0.5;
  const avgDiff = diffSum / sampleCount;
  return clamp01(1 - avgDiff / 48);
};

const getFootLandmarkStability = (
  landmarks: Array<{ x: number; y: number; visibility?: number }> | null,
  side: 'left' | 'right',
  previousSpan: number | null
): { isStable: boolean; span: number | null } => {
  if (!landmarks || landmarks.length < 33) return { isStable: false, span: null };
  const ankleIndex = side === 'left' ? 27 : 28;
  const heelIndex = side === 'left' ? 29 : 30;
  const toeIndex = side === 'left' ? 31 : 32;

  const ankle = landmarks[ankleIndex];
  const heel = landmarks[heelIndex];
  const toe = landmarks[toeIndex];
  if (!ankle || !heel || !toe) return { isStable: false, span: null };
  if ((ankle.visibility ?? 0) < MIN_STABLE_VISIBILITY) return { isStable: false, span: null };
  if ((heel.visibility ?? 0) < MIN_STABLE_VISIBILITY) return { isStable: false, span: null };
  if ((toe.visibility ?? 0) < MIN_STABLE_VISIBILITY) return { isStable: false, span: null };

  const span = Math.abs(heel.y - ankle.y);
  if (!Number.isFinite(span) || span <= 1e-6) return { isStable: false, span: null };
  if (previousSpan !== null) {
    const spanDrift = Math.abs(span - previousSpan) / Math.max(previousSpan, 1e-6);
    if (spanDrift > MAX_SPAN_DRIFT_RATIO) return { isStable: false, span };
  }
  return { isStable: true, span };
};

const drawPose = (
  ctx: CanvasRenderingContext2D,
  landmarks: Array<{ x: number; y: number; visibility?: number }>,
  renderOverlay: boolean
) => {
  if (!renderOverlay) return;
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;

  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = 3;
  for (const [from, to] of POSE_CONNECTIONS_LIST) {
    const a = landmarks[from];
    const b = landmarks[to];
    if (!a || !b) continue;
    if ((a.visibility ?? 1) < 0.35 || (b.visibility ?? 1) < 0.35) continue;
    ctx.beginPath();
    ctx.moveTo(a.x * width, a.y * height);
    ctx.lineTo(b.x * width, b.y * height);
    ctx.stroke();
  }

  ctx.fillStyle = '#f97316';
  for (const landmark of landmarks) {
    if ((landmark.visibility ?? 1) < 0.35) continue;
    ctx.beginPath();
    ctx.arc(landmark.x * width, landmark.y * height, 3, 0, Math.PI * 2);
    ctx.fill();
  }
};

export function VideoPoseUploadVisual({ className = '' }: VideoPoseUploadVisualProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const poseRef = useRef<any>(null);
  const segmentationMaskRef = useRef<any>(null);
  const personLayerCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const realtimeStartPerfRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const latestPoseRef = useRef<Array<{ x: number; y: number; visibility?: number }> | null>(null);
  const currentObjectUrlRef = useRef<string | null>(null);
  const processingFrameRef = useRef(false);
  const frameCountRef = useRef(0);
  const lastFpsUpdateRef = useRef(performance.now());

  const [isPoseReady, setIsPoseReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [sourceMode, setSourceMode] = useState<SourceMode>('upload');
  const [error, setError] = useState<string | null>(null);
  const [videoName, setVideoName] = useState<string>('');
  const [fps, setFps] = useState(0);
  const [duration, setDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [loopPlayback, setLoopPlayback] = useState(false);
  const [stepMarkers, setStepMarkers] = useState<StepMarker[]>([]);
  const [bodyTrackingEnabled, setBodyTrackingEnabled] = useState(DEFAULT_VIDEO_POSE_MARKER_SETTINGS.bodyTrackingEnabled);
  const [showBodyCamPoints, setShowBodyCamPoints] = useState(DEFAULT_VIDEO_POSE_MARKER_SETTINGS.showBodyCamPoints);
  const [realtimeBackgroundSegmentationEnabled, setRealtimeBackgroundSegmentationEnabled] = useState(
    DEFAULT_VIDEO_POSE_MARKER_SETTINGS.realtimeBackgroundSegmentationEnabled
  );
  const [stepSensitivityPercent, setStepSensitivityPercent] = useState(DEFAULT_VIDEO_POSE_MARKER_SETTINGS.stepSensitivityPercent);
  const [pointSizeScale, setPointSizeScale] = useState(DEFAULT_VIDEO_POSE_MARKER_SETTINGS.pointSizeScale);
  const [boxHeightScale, setBoxHeightScale] = useState(DEFAULT_VIDEO_POSE_MARKER_SETTINGS.boxHeightScale);
  const [boxGrowthSeconds, setBoxGrowthSeconds] = useState(DEFAULT_VIDEO_POSE_MARKER_SETTINGS.boxGrowthSeconds);
  const [flowerBloomSeconds, setFlowerBloomSeconds] = useState(DEFAULT_VIDEO_POSE_MARKER_SETTINGS.flowerBloomSeconds);
  const [flowerDecaySeconds, setFlowerDecaySeconds] = useState(DEFAULT_VIDEO_POSE_MARKER_SETTINGS.flowerDecaySeconds);
  const [whimsyIntensity, setWhimsyIntensity] = useState(DEFAULT_VIDEO_POSE_MARKER_SETTINGS.whimsyIntensity);
  const [toonTextureMode, setToonTextureMode] = useState<ToonTextureMode>(DEFAULT_VIDEO_POSE_MARKER_SETTINGS.toonTextureMode);
  const [showStepPoints, setShowStepPoints] = useState(DEFAULT_VIDEO_POSE_MARKER_SETTINGS.showStepPoints);
  const [stepMarkerStyle, setStepMarkerStyle] = useState<StepMarkerStyle>(DEFAULT_VIDEO_POSE_MARKER_SETTINGS.stepMarkerStyle);
  const [cameraMotion, setCameraMotion] = useState({ dx: 0, dy: 0, cumulativeX: 0, cumulativeY: 0 });
  const [footLayout, setFootLayout] = useState<FootLayoutData>({ left: null, right: null });
  const [stepDebug, setStepDebug] = useState<StepDebugData>({
    sampleTick: 0,
    left: { phase: 'stance', stableSamples: 0, contactScore: 0, normalizedVelocity: 0 },
    right: { phase: 'stance', stableSamples: 0, contactScore: 0, normalizedVelocity: 0 },
  });
  const stepMarkersRef = useRef<StepMarker[]>([]);
  const sourceModeRef = useRef<SourceMode>('upload');
  const lastStepTimeRef = useRef<Record<'left' | 'right', number>>({ left: -Infinity, right: -Infinity });
  const previousBorderSamplesRef = useRef<ReturnType<typeof sampleBorderPoints> | null>(null);
  const previousGrayFrameRef = useRef<Uint8Array | null>(null);
  const frameIndexRef = useRef(0);
  const cameraMotionRef = useRef({ dx: 0, dy: 0, cumulativeX: 0, cumulativeY: 0 });
  const lastGroundFootRef = useRef<'left' | 'right' | null>(null);
  const lastDetectionSampleTimeRef = useRef<number>(-Infinity);
  const lastPoseUpdateTimeRef = useRef<number>(-Infinity);
  const stableLandmarkSamplesRef = useRef<Record<'left' | 'right', number>>({ left: 0, right: 0 });
  const lastStableSpanRef = useRef<Record<'left' | 'right', number | null>>({ left: null, right: null });
  const previousContactScoreRef = useRef<Record<'left' | 'right', number>>({ left: 0, right: 0 });
  const footTrackerRef = useRef<Record<'left' | 'right', FootTrackerState>>({
    left: { smoothedY: null, phase: 'stance', swingStartTime: null },
    right: { smoothedY: null, phase: 'stance', swingStartTime: null },
  });

  useEffect(() => {
    sourceModeRef.current = sourceMode;
  }, [sourceMode]);

  useEffect(() => {
    const loaded = loadVideoPoseMarkerSettings();
    setBodyTrackingEnabled(loaded.bodyTrackingEnabled);
    setShowBodyCamPoints(loaded.showBodyCamPoints);
    setRealtimeBackgroundSegmentationEnabled(loaded.realtimeBackgroundSegmentationEnabled);
    setStepSensitivityPercent(loaded.stepSensitivityPercent);
    setPointSizeScale(loaded.pointSizeScale);
    setBoxHeightScale(loaded.boxHeightScale);
    setBoxGrowthSeconds(loaded.boxGrowthSeconds);
    setFlowerBloomSeconds(loaded.flowerBloomSeconds);
    setFlowerDecaySeconds(loaded.flowerDecaySeconds);
    setWhimsyIntensity(loaded.whimsyIntensity);
    setToonTextureMode(loaded.toonTextureMode);
    setShowStepPoints(loaded.showStepPoints);
    setStepMarkerStyle(loaded.stepMarkerStyle);
  }, []);

  useEffect(() => {
    saveVideoPoseMarkerSettings({
      bodyTrackingEnabled,
      showBodyCamPoints,
      realtimeBackgroundSegmentationEnabled,
      stepSensitivityPercent,
      pointSizeScale,
      boxHeightScale,
      boxGrowthSeconds,
      flowerBloomSeconds,
      flowerDecaySeconds,
      whimsyIntensity,
      toonTextureMode,
      showStepPoints,
      stepMarkerStyle,
    });
  }, [
    bodyTrackingEnabled,
    boxGrowthSeconds,
    boxHeightScale,
    flowerBloomSeconds,
    flowerDecaySeconds,
    pointSizeScale,
    realtimeBackgroundSegmentationEnabled,
    showStepPoints,
    showBodyCamPoints,
    stepMarkerStyle,
    stepSensitivityPercent,
    whimsyIntensity,
    toonTextureMode,
  ]);

  useEffect(() => {
    if (bodyTrackingEnabled) return;
    latestPoseRef.current = null;
    segmentationMaskRef.current = null;
    lastPoseUpdateTimeRef.current = -Infinity;
    stableLandmarkSamplesRef.current = { left: 0, right: 0 };
    lastStableSpanRef.current = { left: null, right: null };
    previousContactScoreRef.current = { left: 0, right: 0 };
    footTrackerRef.current = {
      left: { smoothedY: null, phase: 'stance', swingStartTime: null },
      right: { smoothedY: null, phase: 'stance', swingStartTime: null },
    };
    setFootLayout({ left: null, right: null });
    setStepDebug({
      sampleTick: 0,
      left: { phase: 'stance', stableSamples: 0, contactScore: 0, normalizedVelocity: 0 },
      right: { phase: 'stance', stableSamples: 0, contactScore: 0, normalizedVelocity: 0 },
    });
  }, [bodyTrackingEnabled]);

  const cleanupLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const ensurePersonLayerCanvas = useCallback((width: number, height: number): HTMLCanvasElement | null => {
    if (typeof document === 'undefined') return null;
    if (!personLayerCanvasRef.current) {
      personLayerCanvasRef.current = document.createElement('canvas');
    }
    const layer = personLayerCanvasRef.current;
    if (layer.width !== width || layer.height !== height) {
      layer.width = width;
      layer.height = height;
    }
    return layer;
  }, []);

  const resetLoopRelativeMotion = useCallback(() => {
    previousBorderSamplesRef.current = null;
    frameIndexRef.current = 0;
    cameraMotionRef.current = { dx: 0, dy: 0, cumulativeX: 0, cumulativeY: 0 };
    setCameraMotion(cameraMotionRef.current);
    lastStepTimeRef.current = { left: -Infinity, right: -Infinity };
    lastGroundFootRef.current = null;
    previousGrayFrameRef.current = null;
    lastDetectionSampleTimeRef.current = -Infinity;
    lastPoseUpdateTimeRef.current = -Infinity;
    stableLandmarkSamplesRef.current = { left: 0, right: 0 };
    lastStableSpanRef.current = { left: null, right: null };
    previousContactScoreRef.current = { left: 0, right: 0 };
    footTrackerRef.current = {
      left: { smoothedY: null, phase: 'stance', swingStartTime: null },
      right: { smoothedY: null, phase: 'stance', swingStartTime: null },
    };

    stepMarkersRef.current = [];
    setStepMarkers([]);
  }, []);

  const resetDetectionState = useCallback(() => {
    setStepMarkers([]);
    setFootLayout({ left: null, right: null });
    setStepDebug({
      sampleTick: 0,
      left: { phase: 'stance', stableSamples: 0, contactScore: 0, normalizedVelocity: 0 },
      right: { phase: 'stance', stableSamples: 0, contactScore: 0, normalizedVelocity: 0 },
    });
    stepMarkersRef.current = [];
    lastStepTimeRef.current = { left: -Infinity, right: -Infinity };
    lastGroundFootRef.current = null;
    previousBorderSamplesRef.current = null;
    previousGrayFrameRef.current = null;
    lastDetectionSampleTimeRef.current = -Infinity;
    lastPoseUpdateTimeRef.current = -Infinity;
    stableLandmarkSamplesRef.current = { left: 0, right: 0 };
    lastStableSpanRef.current = { left: null, right: null };
    previousContactScoreRef.current = { left: 0, right: 0 };
    frameIndexRef.current = 0;
    cameraMotionRef.current = { dx: 0, dy: 0, cumulativeX: 0, cumulativeY: 0 };
    footTrackerRef.current = {
      left: { smoothedY: null, phase: 'stance', swingStartTime: null },
      right: { smoothedY: null, phase: 'stance', swingStartTime: null },
    };
    setCameraMotion(cameraMotionRef.current);
    latestPoseRef.current = null;
    segmentationMaskRef.current = null;
  }, []);

  const stopRealtimeStream = useCallback(() => {
    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) {
        track.stop();
      }
      mediaStreamRef.current = null;
    }
  }, []);

  const drawFrame = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) {
      rafRef.current = requestAnimationFrame(() => {
        void drawFrame();
      });
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      rafRef.current = requestAnimationFrame(() => {
        void drawFrame();
      });
      return;
    }

    if (video.videoWidth > 0 && video.videoHeight > 0) {
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      ensurePersonLayerCanvas(canvas.width, canvas.height);

      if (sourceMode === 'upload') {
        const boundary = resolvePlaybackBoundary(video.currentTime, { start: trimStart, end: trimEnd }, loopPlayback);
        const isLoopWrap =
          loopPlayback &&
          !boundary.shouldPause &&
          boundary.nextTime < video.currentTime;
        if (boundary.nextTime !== video.currentTime) {
          if (isLoopWrap) {
            resetLoopRelativeMotion();
          }
          video.currentTime = boundary.nextTime;
        }
        if (boundary.shouldPause) {
          video.pause();
          setIsPlaying(false);
        }
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const gray = rgbaToGrayscale(imageData.data, canvas.width, canvas.height);

      // Estimate camera/global frame motion from border-only matching.
      frameIndexRef.current += 1;
      if (frameIndexRef.current % 2 === 0) {
        const borderSamples = sampleBorderPoints(gray, canvas.width, canvas.height, 10, 22);
        if (previousBorderSamplesRef.current) {
          const raw = estimateBorderTranslation(
            previousBorderSamplesRef.current,
            gray,
            canvas.width,
            canvas.height,
            10
          );

          const smoothedDx = cameraMotionRef.current.dx * 0.7 + raw.dx * 0.3;
          const smoothedDy = cameraMotionRef.current.dy * 0.7 + raw.dy * 0.3;
          const cumulativeX = cameraMotionRef.current.cumulativeX + smoothedDx / canvas.width;
          const cumulativeY = cameraMotionRef.current.cumulativeY + smoothedDy / canvas.height;
          cameraMotionRef.current = {
            dx: smoothedDx,
            dy: smoothedDy,
            cumulativeX,
            cumulativeY,
          };
          if (frameIndexRef.current % 6 === 0) {
            setCameraMotion(cameraMotionRef.current);
          }
        }
        previousBorderSamplesRef.current = borderSamples;
      }

      if (bodyTrackingEnabled && poseRef.current && !processingFrameRef.current && !video.paused && !video.ended) {
        try {
          processingFrameRef.current = true;
          await poseRef.current.send({ image: video });
        } catch (poseError) {
          console.error('Pose processing failed', poseError);
        } finally {
          processingFrameRef.current = false;
        }
      }

      const timelineNowSeconds =
        sourceMode === 'realtime'
          ? realtimeStartPerfRef.current === null
            ? 0
            : (performance.now() - realtimeStartPerfRef.current) / 1000
          : video.currentTime;
      const latestPose = latestPoseRef.current;
      if (latestPose && latestPose.length > 0) {
        const sampleTime = timelineNowSeconds;
        const shouldRunSample =
          lastDetectionSampleTimeRef.current < 0 ||
          sampleTime - lastDetectionSampleTimeRef.current >= STEP_DETECTION_SAMPLE_INTERVAL;
        const poseIsFresh =
          lastPoseUpdateTimeRef.current >= 0 &&
          Math.abs(sampleTime - lastPoseUpdateTimeRef.current) <= 0.2;

        if (shouldRunSample && poseIsFresh) {
          lastDetectionSampleTimeRef.current = sampleTime;
          const sensitivityRatio = Math.max(0.001, stepSensitivityPercent / 100);
          const nextDebug: StepDebugData = {
            sampleTick: 0,
            left: { phase: 'stance', stableSamples: 0, contactScore: 0, normalizedVelocity: 0 },
            right: { phase: 'stance', stableSamples: 0, contactScore: 0, normalizedVelocity: 0 },
          };
          (['left', 'right'] as const).forEach((side) => {
            const tracker = footTrackerRef.current[side];
            const stability = getFootLandmarkStability(latestPose, side, lastStableSpanRef.current[side]);
            lastStableSpanRef.current[side] = stability.span;
            if (!stability.isStable) {
              stableLandmarkSamplesRef.current[side] = 0;
              tracker.phase = 'stance';
              tracker.swingStartTime = null;
              previousContactScoreRef.current[side] = 0;
              nextDebug[side] = {
                phase: 'stance',
                stableSamples: 0,
                contactScore: 0,
                normalizedVelocity: 0,
              };
              return;
            }

            stableLandmarkSamplesRef.current[side] += 1;
            const footAnchor = getSideFootAnchor(latestPose, side);
            const heelToAnkleSpan = getSideHeelToAnkleSpan(latestPose, side);
            if (!footAnchor || !heelToAnkleSpan) return;
            const smoothedY = smoothEwma(tracker.smoothedY, footAnchor.y, 0.35);
            if (
              tracker.smoothedY === null ||
              stableLandmarkSamplesRef.current[side] < MIN_STABLE_LANDMARK_SAMPLES
            ) {
              tracker.smoothedY = smoothedY;
              previousContactScoreRef.current[side] = 0;
              nextDebug[side] = {
                phase: tracker.phase,
                stableSamples: stableLandmarkSamplesRef.current[side],
                contactScore: 0,
                normalizedVelocity: 0,
              };
              return;
            }

            const normalizedVelocity = (smoothedY - tracker.smoothedY) / heelToAnkleSpan;
            const contactScore = computeFootContactScore(
              latestPose,
              side,
              gray,
              previousGrayFrameRef.current,
              canvas.width,
              canvas.height,
              cameraMotionRef.current.dx,
              cameraMotionRef.current.dy
            );

            const nextPhase = updateGaitPhase(tracker.phase, normalizedVelocity, contactScore, {
              contactEnterStance: STEP_CONTACT_THRESHOLD,
              contactExitStance: 0.5,
              velocityEnterSwing: sensitivityRatio,
              velocityEnterStance: sensitivityRatio * 0.55,
            });

            if (tracker.phase === 'stance' && nextPhase === 'swing') {
              tracker.swingStartTime = sampleTime;
            }

            const previousContact = previousContactScoreRef.current[side];
            const crossedIntoContact =
              previousContact < STEP_CONTACT_THRESHOLD &&
              contactScore >= STEP_CONTACT_THRESHOLD;
            if (
              crossedIntoContact &&
              (lastGroundFootRef.current === null || lastGroundFootRef.current !== side) &&
              sampleTime - lastStepTimeRef.current[side] > 0.25
            ) {
              lastStepTimeRef.current[side] = sampleTime;
              lastGroundFootRef.current = side;
              const stepMagnitude = contactScore;
              setStepMarkers((previous) => {
                const next = [
                  ...previous,
                  {
                    time: sampleTime,
                    x: footAnchor.x,
                    y: footAnchor.y,
                    camRefX: cameraMotionRef.current.cumulativeX,
                    camRefY: cameraMotionRef.current.cumulativeY,
                    foot: side,
                    stepMagnitude,
                  },
                ];
                const limited = next.slice(-200);
                stepMarkersRef.current = limited;
                return limited;
              });
            }
            previousContactScoreRef.current[side] = contactScore;

            tracker.phase = nextPhase;
            if (nextPhase === 'stance') {
              tracker.swingStartTime = null;
            }
            tracker.smoothedY = smoothedY;
            nextDebug[side] = {
              phase: nextPhase,
              stableSamples: stableLandmarkSamplesRef.current[side],
              contactScore,
              normalizedVelocity,
            };
          });
          setStepDebug((previous) => ({
            ...nextDebug,
            sampleTick: previous.sampleTick + 1,
          }));
        }
      }

      const markers = stepMarkersRef.current;
      const shouldOverlayFlowersRealtime =
        sourceMode === 'realtime' &&
        !realtimeBackgroundSegmentationEnabled &&
        (stepMarkerStyle === 'flowers' || stepMarkerStyle === 'flowers-3d');
      const drawFlowerMarker = (
        marker: StepMarker,
        drawX: number,
        drawY: number,
        lifecycle: FlowerMarkerLifecycleFrame
      ) => {
        const lifeScale = lifecycle.lifeScale;
        if (lifeScale <= 0.001) return;
        const seed = Math.floor(marker.time * 1000 + marker.stepMagnitude * 1000);
        const variant = getStepFlowerVariant(seed);
        const palette = variant.palette;
        const markerScale = marker.stepMagnitude * boxHeightScale * 0.025;
        const sprite3d =
          stepMarkerStyle === 'flowers-3d'
            ? generateStepFlowerSprite3D(seed, lifeScale, markerScale)
            : null;
        const flowerShape = sprite3d
          ? sprite3d.shape
          : generateStepFlowerShape(seed, lifeScale, markerScale);
        const depthScale = sprite3d?.depthScale ?? 1;
        const whimsy = Math.max(0, whimsyIntensity);
        const squashX = lifecycle.transform.scaleX;
        const stretchY = lifecycle.transform.scaleY;
        const offsetY = lifecycle.transform.offsetY;
        const sway = lifecycle.transform.sway;
        const droop = lifecycle.transform.droop;
        const bloomBoost = 1 + lifecycle.stateProgress * 0.18;
        const seqProgress =
          lifecycle.state === 'growing'
            ? lifecycle.stateProgress
            : lifecycle.state === 'holding'
              ? 1
              : 1 - lifecycle.stateProgress * 0.18;
        const decayProgress = lifecycle.state === 'decaying' ? lifecycle.stateProgress : 0;
        const segmentRamp = (start: number, end: number) => {
          if (end <= start) return seqProgress >= end ? 1 : 0;
          const t = Math.max(0, Math.min(1, (seqProgress - start) / (end - start)));
          return t * t * (3 - 2 * t);
        };
        const stemReveal = segmentRamp(0.02, 0.48);
        const leafReveal = segmentRamp(0.34, 0.7);
        const pollenReveal = segmentRamp(0.56, 0.82);
        const petalReveal = segmentRamp(0.7, 1);

        const mapPoint = (point: { x: number; y: number }) => ({
          x:
            drawX +
            point.x * depthScale * squashX +
            point.y * depthScale * sway * 0.35,
          y:
            drawY +
            offsetY +
            point.y * depthScale * stretchY +
            Math.abs(point.y) * droop * 0.05,
        });
        const toOpaqueTone = (hex: string, lift: number) => {
          const clean = hex.trim().replace('#', '');
          const expanded =
            clean.length === 3
              ? `${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`
              : clean;
          if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return 'rgb(24, 24, 32)';
          const r = parseInt(expanded.slice(0, 2), 16);
          const g = parseInt(expanded.slice(2, 4), 16);
          const b = parseInt(expanded.slice(4, 6), 16);
          if (lift >= 0) {
            const k = Math.min(1, lift);
            return `rgb(${Math.round(r + (255 - r) * k)}, ${Math.round(g + (255 - g) * k)}, ${Math.round(b + (255 - b) * k)})`;
          }
          const k = Math.max(0, 1 + lift);
          return `rgb(${Math.round(r * k)}, ${Math.round(g * k)}, ${Math.round(b * k)})`;
        };
        const mixOpaqueHex = (fromHex: string, toHex: string, t: number) => {
          const from = fromHex.trim().replace('#', '');
          const to = toHex.trim().replace('#', '');
          const expand = (v: string) =>
            v.length === 3 ? `${v[0]}${v[0]}${v[1]}${v[1]}${v[2]}${v[2]}` : v;
          const a = expand(from);
          const b = expand(to);
          if (!/^[0-9a-fA-F]{6}$/.test(a) || !/^[0-9a-fA-F]{6}$/.test(b)) return fromHex;
          const p = Math.max(0, Math.min(1, t));
          const ar = parseInt(a.slice(0, 2), 16);
          const ag = parseInt(a.slice(2, 4), 16);
          const ab = parseInt(a.slice(4, 6), 16);
          const br = parseInt(b.slice(0, 2), 16);
          const bg = parseInt(b.slice(2, 4), 16);
          const bb = parseInt(b.slice(4, 6), 16);
          return `rgb(${Math.round(ar + (br - ar) * p)}, ${Math.round(ag + (bg - ag) * p)}, ${Math.round(ab + (bb - ab) * p)})`;
        };
        const stemDecayColor =
          decayProgress < 0.38
            ? mixOpaqueHex('#16a34a', '#f59e0b', decayProgress / 0.38)
            : mixOpaqueHex('#f59e0b', '#4a1f0f', (decayProgress - 0.38) / 0.62);
        const botanicalLineColor = lifecycle.state === 'decaying' ? stemDecayColor : toOpaqueTone('#16a34a', 0.08);

        const strokeOutlined = (points: Array<{ x: number; y: number }>, color: string, lineWidth: number) => {
          if (whimsy > 0.01) {
            const outlineAlphaBase = lifecycle.state === 'decaying' ? 0.16 : 0.34;
            const outlineAlphaWhimsy = lifecycle.state === 'decaying' ? 0.24 : 0.44;
            const outlineWidthWhimsy = lifecycle.state === 'decaying' ? 0.72 : 1.45;
            ctx.strokeStyle = `rgba(2, 6, 23, ${outlineAlphaBase + whimsy * outlineAlphaWhimsy})`;
            ctx.lineWidth = lineWidth * (1 + whimsy * outlineWidthWhimsy);
            ctx.beginPath();
            points.forEach((point, idx) => {
              const p = mapPoint(point);
              if (idx === 0) {
                ctx.moveTo(p.x, p.y);
              } else {
                ctx.lineTo(p.x, p.y);
              }
            });
            ctx.stroke();
          }

          ctx.strokeStyle = color;
          ctx.lineWidth = lineWidth;
          ctx.beginPath();
          points.forEach((point, idx) => {
            const p = mapPoint(point);
            if (idx === 0) {
              ctx.moveTo(p.x, p.y);
            } else {
              ctx.lineTo(p.x, p.y);
            }
          });
          ctx.stroke();
        };
        const fillPetalGradient = (points: Array<{ x: number; y: number }>, petalColor: string) => {
          if (points.length < 3) return;
          const first = points[0];
          const last = points[points.length - 1];
          const tip = points[Math.floor(points.length / 2)];
          const baseMapped = mapPoint({
            x: (first.x + last.x) * 0.5,
            y: (first.y + last.y) * 0.5,
          });
          const tipMapped = mapPoint(tip);
          const darkBase = toOpaqueTone(petalColor, -0.48);
          const brightTip = toOpaqueTone(petalColor, 0.62);
          const gradient = ctx.createLinearGradient(baseMapped.x, baseMapped.y, tipMapped.x, tipMapped.y);
          gradient.addColorStop(0, darkBase);
          gradient.addColorStop(0.58, petalColor);
          gradient.addColorStop(1, brightTip);
          ctx.fillStyle = gradient;
          ctx.beginPath();
          points.forEach((point, idx) => {
            const p = mapPoint(point);
            if (idx === 0) {
              ctx.moveTo(p.x, p.y);
            } else {
              ctx.lineTo(p.x, p.y);
            }
          });
          ctx.closePath();
          ctx.fill();
        };
        const applyToonTexture = (
          points: Array<{ x: number; y: number }>,
          shadeColor: string,
          strength: number
        ) => {
          if (toonTextureMode === 'none') return;
          if (strength <= 0.01 || points.length < 3) return;
          const mapped = points.map(mapPoint);
          const minX = Math.min(...mapped.map((p) => p.x));
          const maxX = Math.max(...mapped.map((p) => p.x));
          const minY = Math.min(...mapped.map((p) => p.y));
          const maxY = Math.max(...mapped.map((p) => p.y));
          const spacing = Math.max(3.2, 7.2 - strength * 2.4);

          ctx.save();
          ctx.beginPath();
          mapped.forEach((p, idx) => {
            if (idx === 0) {
              ctx.moveTo(p.x, p.y);
            } else {
              ctx.lineTo(p.x, p.y);
            }
          });
          ctx.closePath();
          ctx.clip();

          const phase = Math.abs(seed % 97);
          if (toonTextureMode === 'hatch') {
            ctx.strokeStyle = shadeColor;
            ctx.lineWidth = Math.max(0.45, 0.35 + strength * 0.6);
            const span = Math.max(maxX - minX, maxY - minY) + spacing * 3;
            for (let x = minX - span; x <= maxX + span; x += spacing) {
              ctx.beginPath();
              ctx.moveTo(x + phase, minY - spacing);
              ctx.lineTo(x + span * 0.7 + phase, maxY + spacing);
              ctx.stroke();
            }
          } else {
            const dotSize = 0.7 + strength * 0.85;
            ctx.fillStyle = shadeColor;
            for (let y = minY - spacing; y <= maxY + spacing; y += spacing) {
              for (let x = minX - spacing; x <= maxX + spacing; x += spacing) {
                const checker = (Math.floor((x + phase) / spacing) + Math.floor((y + phase) / spacing)) % 2;
                if (checker !== 0) continue;
                ctx.beginPath();
                ctx.arc(x, y, dotSize, 0, Math.PI * 2);
                ctx.fill();
              }
            }
          }
          ctx.restore();
        };
        const fillLeafGradient = (points: Array<{ x: number; y: number }>) => {
          if (points.length < 3) return;
          const mapped = points.map(mapPoint);
          const minY = Math.min(...mapped.map((p) => p.y));
          const maxY = Math.max(...mapped.map((p) => p.y));
          const centerX = mapped.reduce((sum, p) => sum + p.x, 0) / mapped.length;
          const leafBaseColor = mixOpaqueHex(palette.leafStroke, '#b45309', decayProgress * 0.92);
          const gradient = ctx.createLinearGradient(centerX, maxY, centerX, minY);
          gradient.addColorStop(0, toOpaqueTone(leafBaseColor, -0.45));
          gradient.addColorStop(0.6, leafBaseColor);
          gradient.addColorStop(1, toOpaqueTone(leafBaseColor, 0.45));
          ctx.fillStyle = gradient;
          ctx.beginPath();
          mapped.forEach((p, idx) => {
            if (idx === 0) {
              ctx.moveTo(p.x, p.y);
            } else {
              ctx.lineTo(p.x, p.y);
            }
          });
          ctx.closePath();
          ctx.fill();
        };
        const trimStrokeByReveal = (points: Array<{ x: number; y: number }>, reveal: number) => {
          if (reveal <= 0.001 || points.length <= 1) return [] as Array<{ x: number; y: number }>;
          if (reveal >= 0.999) return points;
          const idx = Math.max(1, Math.floor((points.length - 1) * reveal));
          return points.slice(0, idx + 1);
        };

        const primaryLineWidth = 1.2 + lifeScale * 0.95;
        const detailLineWidth = 1 + lifeScale * 0.75;
        ctx.save();
        const visibleAlpha =
          lifecycle.state === 'decaying'
            ? Math.max(0.18, lifeScale * 0.95 + 0.12)
            : Math.max(0.1, lifeScale);
        ctx.globalAlpha *= visibleAlpha;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        if (sprite3d) {
          const shadowY = drawY + lifecycle.transform.offsetY + sprite3d.shadowOffsetY;
          const shadowGrad = ctx.createRadialGradient(
            drawX,
            shadowY,
            sprite3d.shadowRadius * 0.15,
            drawX,
            shadowY,
            sprite3d.shadowRadius
          );
          shadowGrad.addColorStop(0, palette.shadowInner);
          shadowGrad.addColorStop(1, palette.shadowOuter);
          ctx.fillStyle = shadowGrad;
          ctx.beginPath();
          ctx.ellipse(
            drawX,
            shadowY,
            sprite3d.shadowRadius * squashX * 1.08,
            sprite3d.shadowRadius * 0.42 * Math.max(0.72, 1 - lifecycle.transform.droop * 0.9),
            0,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }

        const stemShrink = Math.max(0.14, 1 - decayProgress * 0.78);
        const animateStemStroke = (
          points: Array<{ x: number; y: number }>,
          parentShift: { x: number; y: number } = { x: 0, y: 0 }
        ) => {
          const visibleBase = trimStrokeByReveal(points, stemReveal);
          const stemRoot = visibleBase[0] ?? { x: 0, y: 0 };
          const visible = visibleBase.map((p) => ({
            x: stemRoot.x + (p.x - stemRoot.x) * stemShrink + parentShift.x,
            y:
              stemRoot.y +
              (p.y - stemRoot.y) * stemShrink +
              decayProgress * Math.abs(p.y - stemRoot.y) * 0.34 +
              parentShift.y,
          }));
          return { visibleBase, visible };
        };

        const mainStem = animateStemStroke(flowerShape.stem.points);
        const stemStrokes = [flowerShape.stem, ...(flowerShape.branches ?? [])];
        const animatedStemRecords: Array<{
          visibleBase: Array<{ x: number; y: number }>;
          visible: Array<{ x: number; y: number }>;
          baseTip: { x: number; y: number };
          animatedTip: { x: number; y: number };
          shift: { x: number; y: number };
        }> = [];
        for (let idx = 0; idx < stemStrokes.length; idx += 1) {
          const stemStroke = stemStrokes[idx];
          let parentShift = { x: 0, y: 0 };
          if (idx > 0) {
            const stemRoot = stemStroke.points[0] ?? { x: 0, y: 0 };
            let bestDist = Number.POSITIVE_INFINITY;
            let bestShift = { x: 0, y: 0 };
            for (const parentStem of animatedStemRecords) {
              for (let i = 0; i < parentStem.visibleBase.length; i += 1) {
                const basePoint = parentStem.visibleBase[i];
                const animatedPoint = parentStem.visible[i] ?? basePoint;
                const dx = stemRoot.x - basePoint.x;
                const dy = stemRoot.y - basePoint.y;
                const d2 = dx * dx + dy * dy;
                if (d2 < bestDist) {
                  bestDist = d2;
                  bestShift = { x: animatedPoint.x - basePoint.x, y: animatedPoint.y - basePoint.y };
                }
              }
            }
            parentShift = bestShift;
          }
          const animated = idx === 0 ? mainStem : animateStemStroke(stemStroke.points, parentShift);
          const baseTip =
            animated.visibleBase[animated.visibleBase.length - 1] ??
            stemStroke.points[stemStroke.points.length - 1] ?? { x: 0, y: 0 };
          const animatedTip = animated.visible[animated.visible.length - 1] ?? baseTip;
          animatedStemRecords.push({
            visibleBase: animated.visibleBase,
            visible: animated.visible,
            baseTip,
            animatedTip,
            shift: { x: animatedTip.x - baseTip.x, y: animatedTip.y - baseTip.y },
          });
        }
        for (const stemRecord of animatedStemRecords) {
          if (stemRecord.visible.length > 1) {
            strokeOutlined(
              stemRecord.visible,
              botanicalLineColor,
              Math.max(0.65, primaryLineWidth * (1 - decayProgress * 0.28))
            );
          }
        }
        const mainStemRecord = animatedStemRecords[0];
        const animatedTip = mainStemRecord?.animatedTip ?? { x: 0, y: 0 };
        const getClosestStemRecord = (point: { x: number; y: number }) => {
          let bestRecord = mainStemRecord;
          let bestDist = Number.POSITIVE_INFINITY;
          for (const stemRecord of animatedStemRecords) {
            const dx = point.x - stemRecord.baseTip.x;
            const dy = point.y - stemRecord.baseTip.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestDist) {
              bestDist = d2;
              bestRecord = stemRecord;
            }
          }
          return bestRecord ?? {
            visible: [] as Array<{ x: number; y: number }>,
            baseTip: { x: 0, y: 0 },
            animatedTip: { x: 0, y: 0 },
            shift: { x: 0, y: 0 },
          };
        };

        const getClosestStemPointShift = (point: { x: number; y: number }) => {
          let bestShift = { x: 0, y: 0 };
          let bestDist = Number.POSITIVE_INFINITY;
          for (const stemRecord of animatedStemRecords) {
            for (let i = 0; i < stemRecord.visibleBase.length; i += 1) {
              const basePoint = stemRecord.visibleBase[i];
              const animatedPoint = stemRecord.visible[i] ?? basePoint;
              const dx = point.x - basePoint.x;
              const dy = point.y - basePoint.y;
              const d2 = dx * dx + dy * dy;
              if (d2 < bestDist) {
                bestDist = d2;
                bestShift = { x: animatedPoint.x - basePoint.x, y: animatedPoint.y - basePoint.y };
              }
            }
          }
          return bestShift;
        };

        for (const leaf of flowerShape.leaves) {
          const base = leaf.points[0] ?? { x: 0, y: 0 };
          const stemPointShift = getClosestStemPointShift(base);
          const leafDroop = decayProgress * (0.9 + droop * 2.6);
          const animated = leaf.points.map((p) => ({
            x:
              base.x +
              stemPointShift.x +
              (p.x - base.x) * leafReveal * (1 - decayProgress * 0.48) -
              (p.x - base.x) * leafDroop * 0.22,
            y:
              base.y +
              stemPointShift.y +
              (p.y - base.y) * leafReveal * (1 - decayProgress * 0.24) +
              decayProgress * (0.9 + Math.abs(p.x - base.x) * 0.18) +
              leafDroop * (0.55 + Math.abs(p.x - base.x) * 0.24 + Math.max(0, -(p.y - base.y)) * 0.28),
          }));
          fillLeafGradient(animated);
          applyToonTexture(animated, toOpaqueTone('#3f1d0d', -0.15), whimsy * 0.35 * leafReveal);
          strokeOutlined(animated, botanicalLineColor, detailLineWidth);
        }

        const petalPalette = palette.petalLayerStrokes?.length ? palette.petalLayerStrokes : [palette.petalStroke];
        for (const petal of flowerShape.petals) {
          const petalBaseColor = petalPalette[petal.colorIndex % petalPalette.length] ?? palette.petalStroke;
          const petalToGold = mixOpaqueHex(petalBaseColor, '#d97706', Math.min(1, decayProgress * 1.25));
          const petalColor = mixOpaqueHex(petalToGold, '#7c2d12', Math.max(0, (decayProgress - 0.4) / 0.6));
          const layeredWidth = Math.max(0.7, detailLineWidth * (1 - Math.min(0.35, petal.layer * 0.09)));
          const base = petal.points[0] ?? { x: 0, y: 0 };
          const gravityDrop = (1 - petalReveal) * (0.6 + whimsy * 0.35) * (1 + petal.layer * 0.2);
          const bloomT = petalReveal * petalReveal * (3 - 2 * petalReveal);
          const spread = 0.03 + bloomT * 1.02;
          const lift = 0.08 + bloomT * 0.92;
          const budPull = (1 - bloomT) * 0.34;
          const petalDroop = decayProgress * (0.65 + droop * 2.4);
          const animated = petal.points.map((p, idx) => {
            const relX = p.x - base.x;
            const relY = p.y - base.y;
            const tipBias = idx / Math.max(1, petal.points.length - 1);
            const stemRecord = getClosestStemRecord(base);
            const stemShift = stemRecord.shift;
            const anchorX = base.x + stemShift.x;
            const anchorY = base.y + stemShift.y;
            const bloomX = relX * spread * (1 - decayProgress * 0.22) - relX * budPull;
            const bloomY =
              relY * lift * (1 - decayProgress * 0.14) +
              gravityDrop * (0.4 + tipBias * 0.9) +
              Math.abs(relX) * (1 - petalReveal) * 0.12 +
              decayProgress * (0.16 + tipBias * 0.36);
            const wiltCollapse = 1 - Math.min(0.7, petalDroop * (0.5 + tipBias * 0.7));
            const wiltTilt = petalDroop * (0.35 + tipBias * 0.95);
            const wiltX = bloomX * wiltCollapse;
            const wiltY =
              bloomY +
              petalDroop * (0.55 + tipBias * 1.45 + Math.abs(relX) * 0.45) +
              Math.abs(wiltX) * wiltTilt * 0.9;
            const centerDx = base.x - stemRecord.animatedTip.x;
            const centerSign =
              Math.abs(centerDx) > 0.001 ? Math.sign(centerDx) : Math.sign(relX || 1);
            const rotateAway =
              centerSign *
              petalDroop *
              (0.22 + tipBias * 0.55 + Math.min(0.3, Math.abs(centerDx) * 0.08));
            const cosRot = Math.cos(rotateAway);
            const sinRot = Math.sin(rotateAway);
            const rotatedX = wiltX * cosRot - wiltY * sinRot;
            const rotatedY = wiltX * sinRot + wiltY * cosRot;
            return {
              x: anchorX + rotatedX - relX * petalDroop * 0.22,
              y: anchorY + rotatedY,
            };
          });
          fillPetalGradient(animated, petalColor);
          applyToonTexture(animated, toOpaqueTone(petalColor, -0.62), whimsy * (0.45 + petal.layer * 0.08) * petalReveal);
          strokeOutlined(animated, petalColor, layeredWidth);
        }

        const blossomCenter = mapPoint(animatedTip);
        const pollenRadius =
          (sprite3d ? sprite3d.coreRadius * 0.85 : 1.5 + markerScale * 1.35) *
          (0.82 + lifeScale * 0.35) *
          pollenReveal *
          (lifecycle.state === 'decaying' ? Math.max(0, 1 - decayProgress * 2.6) : 1);
        ctx.fillStyle = palette.pollenFill;
        ctx.strokeStyle = 'rgba(2, 6, 23, 0.72)';
        ctx.lineWidth = Math.max(0.7, 0.55 + whimsy * 0.5);
        if (pollenRadius > 0.01) {
          ctx.beginPath();
          ctx.arc(blossomCenter.x, blossomCenter.y, pollenRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }

        if (sprite3d) {
          const blossomY = drawY + animatedTip.y * sprite3d.depthScale * stretchY;
          const blossomGrad = ctx.createRadialGradient(
            drawX,
            blossomY,
            sprite3d.coreRadius * 0.2,
            drawX,
            blossomY,
            sprite3d.blossomRadius * bloomBoost
          );
          blossomGrad.addColorStop(0, palette.glowInner);
          blossomGrad.addColorStop(1, palette.glowOuter);
          ctx.fillStyle = blossomGrad;
          ctx.beginPath();
          ctx.ellipse(
            drawX,
            blossomY,
            sprite3d.blossomRadius * squashX * bloomBoost,
            sprite3d.blossomRadius * stretchY * bloomBoost,
            0,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }

        ctx.restore();
      };
      if (
        markers.length > 0 &&
        (showStepPoints || stepMarkerStyle === 'boxes' || stepMarkerStyle === 'flowers' || stepMarkerStyle === 'flowers-3d')
      ) {
        ctx.strokeStyle = '#111827';
        ctx.lineWidth = 2;
        for (const marker of markers) {
          if (sourceMode === 'upload' && (marker.time < trimStart || marker.time > trimEnd)) continue;
          const markerSeed = Math.floor(marker.time * 1000 + marker.stepMagnitude * 1000);
          const markerPalette = getStepFlowerVariant(markerSeed).palette;
          const useVariantPalette = stepMarkerStyle === 'flowers' || stepMarkerStyle === 'flowers-3d';
          const solidColor = useVariantPalette
            ? markerPalette.markerSolid
            : marker.foot === 'left'
              ? '#22d3ee'
              : '#f472b6';
          const translucentColor = useVariantPalette
            ? markerPalette.markerTranslucent
            : marker.foot === 'left'
              ? 'rgba(34, 211, 238, 0.65)'
              : 'rgba(244, 114, 182, 0.65)';
          const offsetX = cameraMotionRef.current.cumulativeX - marker.camRefX;
          const offsetY = cameraMotionRef.current.cumulativeY - marker.camRefY;
          const drawX = (marker.x + offsetX) * canvas.width;
          const drawY = (marker.y + offsetY) * canvas.height;
          const radius = Math.max(4, Math.min(24, 4 + marker.stepMagnitude * 40 * pointSizeScale));
          const fullBoxHeight = Math.max(
            6,
            Math.min(canvas.height * 0.85, radius * 1.2 + marker.stepMagnitude * 260 * boxHeightScale)
          );
          const markerAge = Math.max(0, timelineNowSeconds - marker.time);
          const growthProgress = Math.max(0, Math.min(1, markerAge / Math.max(0.05, boxGrowthSeconds)));
          const easedGrowth = 1 - Math.pow(1 - growthProgress, 3);
          const boxHeight = fullBoxHeight * easedGrowth;
          const boxWidth = Math.max(6, radius * 1.15);
          if (stepMarkerStyle === 'boxes') {
            // Grow a box upward from the center of the marker, scaled by raw step magnitude.
            ctx.fillStyle = translucentColor;
            ctx.fillRect(drawX - boxWidth / 2, drawY - boxHeight, boxWidth, boxHeight);
            ctx.strokeStyle = solidColor;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(drawX - boxWidth / 2, drawY - boxHeight, boxWidth, boxHeight);
          } else if (stepMarkerStyle === 'flowers' || stepMarkerStyle === 'flowers-3d') {
            const lifecycle = getFlowerMarkerLifecycleFrame(
              markerAge,
              {
                growSeconds: flowerBloomSeconds,
                holdSeconds: 0.22,
                decaySeconds: flowerDecaySeconds,
              },
              whimsyIntensity
            );
            if (!shouldOverlayFlowersRealtime) {
              drawFlowerMarker(marker, drawX, drawY, lifecycle);
            }
          }
          if (showStepPoints) {
            ctx.fillStyle = solidColor;
            ctx.beginPath();
            ctx.arc(drawX, drawY, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#111827';
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        }
      }

      // Composite segmented person on top of background/marker layers.
      const segmentationMask =
        bodyTrackingEnabled && (sourceMode !== 'realtime' || realtimeBackgroundSegmentationEnabled)
          ? segmentationMaskRef.current
          : null;
      const personLayer = personLayerCanvasRef.current;
      if (segmentationMask && personLayer) {
        const personCtx = personLayer.getContext('2d');
        if (personCtx) {
          personCtx.clearRect(0, 0, personLayer.width, personLayer.height);
          personCtx.drawImage(segmentationMask, 0, 0, personLayer.width, personLayer.height);
          personCtx.globalCompositeOperation = 'source-in';
          personCtx.drawImage(video, 0, 0, personLayer.width, personLayer.height);
          personCtx.globalCompositeOperation = 'source-over';
          ctx.drawImage(personLayer, 0, 0, canvas.width, canvas.height);
        }
      }

      // Pose stays on top of the person cutout.
      if (bodyTrackingEnabled && latestPose && latestPose.length > 0) {
        drawPose(ctx, latestPose, showBodyCamPoints);
      }

      if (markers.length > 0 && shouldOverlayFlowersRealtime) {
        for (const marker of markers) {
          const offsetX = cameraMotionRef.current.cumulativeX - marker.camRefX;
          const offsetY = cameraMotionRef.current.cumulativeY - marker.camRefY;
          const drawX = (marker.x + offsetX) * canvas.width;
          const drawY = (marker.y + offsetY) * canvas.height;
          const markerAge = Math.max(0, timelineNowSeconds - marker.time);
          const lifecycle = getFlowerMarkerLifecycleFrame(
            markerAge,
            {
                growSeconds: flowerBloomSeconds,
              holdSeconds: 0.22,
                decaySeconds: flowerDecaySeconds,
            },
            whimsyIntensity
          );
          drawFlowerMarker(marker, drawX, drawY, lifecycle);
        }
      }

      frameCountRef.current += 1;
      const now = performance.now();
      if (now - lastFpsUpdateRef.current >= 1000) {
        setFps(frameCountRef.current);
        frameCountRef.current = 0;
        lastFpsUpdateRef.current = now;
      }

      previousGrayFrameRef.current = gray;
    }

    if (!video.paused && !video.ended) {
      rafRef.current = requestAnimationFrame(() => {
        void drawFrame();
      });
    } else {
      setIsPlaying(false);
    }
  }, [
    bodyTrackingEnabled,
    boxGrowthSeconds,
    boxHeightScale,
    ensurePersonLayerCanvas,
    flowerBloomSeconds,
    flowerDecaySeconds,
    loopPlayback,
    pointSizeScale,
    realtimeBackgroundSegmentationEnabled,
    resetLoopRelativeMotion,
    showStepPoints,
    showBodyCamPoints,
    sourceMode,
    stepMarkerStyle,
    stepSensitivityPercent,
    trimEnd,
    trimStart,
    whimsyIntensity,
    toonTextureMode,
  ]);

  useEffect(() => {
    let isMounted = true;
    const initPose = async () => {
      try {
        const pose = await createPoseDetector({
          modelComplexity: 1,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
          smoothLandmarks: true,
          enableSegmentation: true,
          smoothSegmentation: true,
        });

        pose.onResults((results: any) => {
          const processed = processPoseResults(results);
          const poseLandmarks = processed?.poseLandmarks ?? null;
          segmentationMaskRef.current = results?.segmentationMask ?? null;
          const video = videoRef.current;
          if (video) {
            if (sourceModeRef.current === 'realtime') {
              lastPoseUpdateTimeRef.current =
                realtimeStartPerfRef.current === null
                  ? 0
                  : (performance.now() - realtimeStartPerfRef.current) / 1000;
            } else {
              lastPoseUpdateTimeRef.current = video.currentTime;
            }
          }
          latestPoseRef.current = poseLandmarks;
          setFootLayout({
            left: extractFootLayout(poseLandmarks, 'left'),
            right: extractFootLayout(poseLandmarks, 'right'),
          });
        });

        if (!isMounted) {
          pose.close?.();
          return;
        }
        poseRef.current = pose;
        setIsPoseReady(true);
      } catch (initError: any) {
        console.error(initError);
        setError(initError?.message ?? 'Failed to initialize MediaPipe Pose.');
      }
    };

    void initPose();

    return () => {
      isMounted = false;
      cleanupLoop();
      stopRealtimeStream();
      try {
        poseRef.current?.close?.();
      } catch {
        // ignore
      }
      poseRef.current = null;
      segmentationMaskRef.current = null;
      personLayerCanvasRef.current = null;
      if (currentObjectUrlRef.current) {
        URL.revokeObjectURL(currentObjectUrlRef.current);
        currentObjectUrlRef.current = null;
      }
    };
  }, [cleanupLoop, stopRealtimeStream]);

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (currentObjectUrlRef.current) {
      URL.revokeObjectURL(currentObjectUrlRef.current);
    }

    const objectUrl = URL.createObjectURL(file);
    currentObjectUrlRef.current = objectUrl;
    setVideoName(file.name);
    setError(null);
    setFps(0);
    setDuration(0);
    setTrimStart(0);
    setTrimEnd(0);
    resetDetectionState();

    const video = videoRef.current;
    if (video) {
      stopRealtimeStream();
      realtimeStartPerfRef.current = null;
      video.srcObject = null;
      video.src = objectUrl;
      video.load();
      setIsPlaying(false);
    }
  }, [resetDetectionState, stopRealtimeStream]);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const nextDuration = Number.isFinite(video.duration) ? video.duration : 0;
    setDuration(nextDuration);
    const normalized = normalizeTrimWindow(0, nextDuration, nextDuration);
    setTrimStart(normalized.start);
    setTrimEnd(normalized.end);
    video.currentTime = normalized.start;
  }, []);

  const handlePlayPause = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    if (sourceMode === 'realtime') {
      if (video.paused) {
        try {
          if (!mediaStreamRef.current) {
            mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: 'user' },
              audio: false,
            });
          }
          video.srcObject = mediaStreamRef.current;
          await video.play();
          if (realtimeStartPerfRef.current === null) {
            realtimeStartPerfRef.current = performance.now();
          }
          setIsPlaying(true);
          cleanupLoop();
          rafRef.current = requestAnimationFrame(() => {
            void drawFrame();
          });
        } catch (streamError: any) {
          setError(streamError?.message ?? 'Could not access webcam.');
        }
      } else {
        video.pause();
        setIsPlaying(false);
        cleanupLoop();
      }
      return;
    }

    if (video.paused) {
      try {
        const normalized = normalizeTrimWindow(trimStart, trimEnd, duration);
        if (video.currentTime < normalized.start || video.currentTime >= normalized.end) {
          video.currentTime = normalized.start;
        }
        await video.play();
        setIsPlaying(true);
        cleanupLoop();
        rafRef.current = requestAnimationFrame(() => {
          void drawFrame();
        });
      } catch (playError: any) {
        setError(playError?.message ?? 'Could not play the uploaded video.');
      }
    } else {
      video.pause();
      setIsPlaying(false);
      cleanupLoop();
    }
  }, [cleanupLoop, drawFrame, duration, sourceMode, trimEnd, trimStart]);

  const handleTrimStartChange = useCallback((value: number) => {
    const normalized = normalizeTrimWindow(value, trimEnd, duration);
    setTrimStart(normalized.start);
    setTrimEnd(normalized.end);
  }, [duration, trimEnd]);

  const handleTrimEndChange = useCallback((value: number) => {
    const normalized = normalizeTrimWindow(trimStart, value, duration);
    setTrimStart(normalized.start);
    setTrimEnd(normalized.end);
  }, [duration, trimStart]);

  const handleClearPoints = useCallback(() => {
    stepMarkersRef.current = [];
    setStepMarkers([]);
    // Reset alternation seed so either foot can trigger after a manual clear.
    lastGroundFootRef.current = null;
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setError(null);
    setIsPlaying(false);
    cleanupLoop();
    resetDetectionState();

    if (sourceMode === 'upload') {
      stopRealtimeStream();
      realtimeStartPerfRef.current = null;
      video.srcObject = null;
      return;
    }

    // Entering realtime mode: clear file source and trim constraints.
    if (currentObjectUrlRef.current) {
      URL.revokeObjectURL(currentObjectUrlRef.current);
      currentObjectUrlRef.current = null;
    }
    setVideoName('');
    setDuration(0);
    setTrimStart(0);
    setTrimEnd(0);
    video.src = '';
  }, [cleanupLoop, resetDetectionState, sourceMode, stopRealtimeStream]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || duration <= 0 || sourceMode !== 'upload') return;
    const normalized = normalizeTrimWindow(trimStart, trimEnd, duration);
    if (normalized.start !== trimStart || normalized.end !== trimEnd) {
      setTrimStart(normalized.start);
      setTrimEnd(normalized.end);
      return;
    }
    if (video.currentTime < normalized.start) {
      video.currentTime = normalized.start;
    } else if (video.currentTime > normalized.end) {
      video.currentTime = normalized.end;
    }
  }, [duration, sourceMode, trimEnd, trimStart]);

  const latestMarkerTime = stepMarkers.length > 0 ? stepMarkers[stepMarkers.length - 1].time : 0;
  const timelineWindowStart = sourceMode === 'upload' ? trimStart : Math.max(0, latestMarkerTime - 10);
  const timelineWindowEnd =
    sourceMode === 'upload'
      ? trimEnd
      : Math.max(timelineWindowStart + 10, latestMarkerTime + 0.001);
  const timelineMarkers = stepMarkers.filter(
    (marker) => marker.time >= timelineWindowStart && marker.time <= timelineWindowEnd
  );

  return (
    <div className={`w-full h-full overflow-y-auto bg-slate-950 text-white p-4 ${className}`}>
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded border border-slate-700 overflow-hidden">
            <button
              type="button"
              onClick={() => setSourceMode('upload')}
              className={`px-3 py-2 text-xs ${sourceMode === 'upload' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-300'}`}
            >
              Uploaded video
            </button>
            <button
              type="button"
              onClick={() => setSourceMode('realtime')}
              className={`px-3 py-2 text-xs ${sourceMode === 'realtime' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-300'}`}
            >
              Realtime camera
            </button>
          </div>
          <input
            type="file"
            accept="video/*"
            onChange={handleFileUpload}
            disabled={sourceMode !== 'upload'}
            className="block text-sm text-slate-200 file:mr-4 file:rounded file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-white hover:file:bg-blue-700"
          />
          <button
            type="button"
            onClick={handlePlayPause}
            disabled={(sourceMode === 'upload' && !videoName) || (bodyTrackingEnabled && !isPoseReady)}
            className="rounded bg-emerald-600 px-3 py-2 text-sm hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          {sourceMode === 'realtime' && (
            <button
              type="button"
              onClick={handleClearPoints}
              className="rounded bg-amber-600 px-3 py-2 text-sm hover:bg-amber-700"
            >
              Clear points
            </button>
          )}
          <span className="text-xs text-slate-300">
            {sourceMode === 'upload' ? (videoName || 'Upload a video to begin.') : 'Realtime webcam feed'}
          </span>
        </div>

        <div className="rounded border border-slate-700 bg-black/40 p-2 text-xs text-slate-300 flex flex-wrap gap-4">
          <span>Pose model: {bodyTrackingEnabled ? (isPoseReady ? 'ready' : 'loading...') : 'disabled'}</span>
          <span>Overlay FPS: {fps}</span>
          <span>Landmarks: 33-point MediaPipe Pose</span>
          <span>Detected steps: {stepMarkers.length}</span>
          <span>
            Camera motion: dx {cameraMotion.dx.toFixed(2)}px, dy {cameraMotion.dy.toFixed(2)}px
          </span>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={bodyTrackingEnabled}
              onChange={(event) => setBodyTrackingEnabled(event.target.checked)}
              className="w-4 h-4"
            />
            <span>Body tracking model</span>
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showBodyCamPoints}
              onChange={(event) => setShowBodyCamPoints(event.target.checked)}
              className="w-4 h-4"
            />
            <span>Show body cam points</span>
          </label>
        </div>

        {sourceMode === 'upload' && (
          <div className="rounded border border-slate-700 bg-black/40 p-3 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-300">
            <span>Trim selection</span>
            <span>
              {trimStart.toFixed(2)}s - {trimEnd.toFixed(2)}s {duration > 0 ? `(of ${duration.toFixed(2)}s)` : ''}
            </span>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Trim start</label>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.01}
              value={trimStart}
              onChange={(event) => handleTrimStartChange(parseFloat(event.target.value))}
              disabled={duration <= 0}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Trim end</label>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.01}
              value={trimEnd}
              onChange={(event) => handleTrimEndChange(parseFloat(event.target.value))}
              disabled={duration <= 0}
              className="w-full"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={loopPlayback}
              onChange={(event) => setLoopPlayback(event.target.checked)}
              className="w-4 h-4"
            />
            <span>Loop within trim window</span>
          </label>
          <div>
            <div className="flex items-center justify-between text-xs text-slate-300 mb-1">
              <label htmlFor="step-sensitivity">Step sensitivity</label>
              <span>{stepSensitivityPercent.toFixed(1)}% of heel-to-ankle span</span>
            </div>
            <input
              id="step-sensitivity"
              type="range"
              min={1}
              max={20}
              step={0.5}
              value={stepSensitivityPercent}
              onChange={(event) => setStepSensitivityPercent(parseFloat(event.target.value))}
              className="w-full"
            />
            <div className="text-[11px] text-slate-400 mt-1">
              Reversal must exceed this per-frame rise/fall percentage relative to heel-to-ankle span.
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-xs text-slate-300 mb-1">
              <label htmlFor="point-size-scale">Point size scale</label>
              <span>{pointSizeScale.toFixed(1)}x</span>
            </div>
            <input
              id="point-size-scale"
              type="range"
              min={0.5}
              max={4}
              step={0.1}
              value={pointSizeScale}
              onChange={(event) => setPointSizeScale(parseFloat(event.target.value))}
              className="w-full"
            />
            <div className="text-[11px] text-slate-400 mt-1">
              Scales marker radius while preserving step-size-based differences.
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-xs text-slate-300 mb-1">
              <label htmlFor="box-height-scale">Step marker height scale</label>
              <span>{boxHeightScale.toFixed(1)}x</span>
            </div>
            <input
              id="box-height-scale"
              type="range"
              min={0.5}
              max={500}
              step={0.5}
              value={boxHeightScale}
              onChange={(event) => setBoxHeightScale(parseFloat(event.target.value))}
              className="w-full"
            />
            <div className="text-[11px] text-slate-400 mt-1">
              Scales marker growth height (boxes) and flower size envelope (flowers / 3D flowers) from each step center.
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-xs text-slate-300 mb-1">
              <label htmlFor="box-growth-speed">Box growth duration</label>
              <span>{boxGrowthSeconds.toFixed(2)}s</span>
            </div>
            <input
              id="box-growth-speed"
              type="range"
              min={0.05}
              max={3}
              step={0.05}
              value={boxGrowthSeconds}
              onChange={(event) => setBoxGrowthSeconds(parseFloat(event.target.value))}
              className="w-full"
            />
            <div className="text-[11px] text-slate-400 mt-1">
              Controls how quickly each step marker grows from zero to full size.
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-xs text-slate-300 mb-1">
              <label htmlFor="flower-bloom-seconds">Bloom timing</label>
              <span>{flowerBloomSeconds.toFixed(2)}s</span>
            </div>
            <input
              id="flower-bloom-seconds"
              type="range"
              min={0.05}
              max={3}
              step={0.05}
              value={flowerBloomSeconds}
              onChange={(event) => setFlowerBloomSeconds(parseFloat(event.target.value))}
              className="w-full"
            />
            <div className="text-[11px] text-slate-400 mt-1">
              Controls how quickly flower petals open from bud to bloom.
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-xs text-slate-300 mb-1">
              <label htmlFor="flower-decay-seconds">Decay timing</label>
              <span>{flowerDecaySeconds.toFixed(2)}s</span>
            </div>
            <input
              id="flower-decay-seconds"
              type="range"
              min={0.2}
              max={5}
              step={0.05}
              value={flowerDecaySeconds}
              onChange={(event) => setFlowerDecaySeconds(parseFloat(event.target.value))}
              className="w-full"
            />
            <div className="text-[11px] text-slate-400 mt-1">
              Extends or shortens the wilt/decay phase for flower markers.
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-xs text-slate-300 mb-1">
              <label htmlFor="whimsy-intensity">Whimsy intensity</label>
              <span>{whimsyIntensity.toFixed(2)}x</span>
            </div>
            <input
              id="whimsy-intensity"
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={whimsyIntensity}
              onChange={(event) => setWhimsyIntensity(parseFloat(event.target.value))}
              className="w-full"
            />
            <div className="text-[11px] text-slate-400 mt-1">
              Scales cartoon outline thickness, squash/stretch bloom, and toon texture density for flower markers.
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-200">
            <label htmlFor="toon-texture-mode" className="text-slate-300">Toon texture</label>
            <select
              id="toon-texture-mode"
              value={toonTextureMode}
              onChange={(event) => setToonTextureMode(event.target.value as ToonTextureMode)}
              className="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-slate-100"
            >
              <option value="none">None</option>
              <option value="stipple">Stipple</option>
              <option value="hatch">Hatch</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={showStepPoints}
                onChange={(event) => setShowStepPoints(event.target.checked)}
                className="w-4 h-4"
              />
              <span>Show step points</span>
            </label>
            <div className="flex items-center gap-2 text-sm text-slate-200">
              <label htmlFor="step-marker-style" className="text-slate-300">Step marker style</label>
              <select
                id="step-marker-style"
                value={stepMarkerStyle}
                onChange={(event) => setStepMarkerStyle(event.target.value as StepMarkerStyle)}
                className="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-slate-100"
              >
                <option value="flowers">Growing flowers</option>
                <option value="flowers-3d">Growing flowers (3D)</option>
                <option value="boxes">Boxes</option>
              </select>
            </div>
          </div>
          </div>
        )}

        {sourceMode === 'realtime' && (
          <div className="rounded border border-slate-700 bg-black/40 p-3 space-y-3">
            <div className="text-xs text-slate-300">Realtime marker + detection controls</div>
            <div>
              <div className="flex items-center justify-between text-xs text-slate-300 mb-1">
                <label htmlFor="step-sensitivity-realtime">Step sensitivity</label>
                <span>{stepSensitivityPercent.toFixed(1)}% of heel-to-ankle span</span>
              </div>
              <input
                id="step-sensitivity-realtime"
                type="range"
                min={1}
                max={20}
                step={0.5}
                value={stepSensitivityPercent}
                onChange={(event) => setStepSensitivityPercent(parseFloat(event.target.value))}
                className="w-full"
              />
            </div>
            <div>
              <div className="flex items-center justify-between text-xs text-slate-300 mb-1">
                <label htmlFor="point-size-scale-realtime">Point size scale</label>
                <span>{pointSizeScale.toFixed(1)}x</span>
              </div>
              <input
                id="point-size-scale-realtime"
                type="range"
                min={0.5}
                max={4}
                step={0.1}
                value={pointSizeScale}
                onChange={(event) => setPointSizeScale(parseFloat(event.target.value))}
                className="w-full"
              />
            </div>
            <div>
              <div className="flex items-center justify-between text-xs text-slate-300 mb-1">
                <label htmlFor="box-height-scale-realtime">Step marker height scale</label>
                <span>{boxHeightScale.toFixed(1)}x</span>
              </div>
              <input
                id="box-height-scale-realtime"
                type="range"
                min={0.5}
                max={500}
                step={0.5}
                value={boxHeightScale}
                onChange={(event) => setBoxHeightScale(parseFloat(event.target.value))}
                className="w-full"
              />
            </div>
            <div>
              <div className="flex items-center justify-between text-xs text-slate-300 mb-1">
                <label htmlFor="box-growth-speed-realtime">Marker growth duration</label>
                <span>{boxGrowthSeconds.toFixed(2)}s</span>
              </div>
              <input
                id="box-growth-speed-realtime"
                type="range"
                min={0.05}
                max={3}
                step={0.05}
                value={boxGrowthSeconds}
                onChange={(event) => setBoxGrowthSeconds(parseFloat(event.target.value))}
                className="w-full"
              />
            </div>
            <div>
              <div className="flex items-center justify-between text-xs text-slate-300 mb-1">
                <label htmlFor="flower-bloom-seconds-realtime">Bloom timing</label>
                <span>{flowerBloomSeconds.toFixed(2)}s</span>
              </div>
              <input
                id="flower-bloom-seconds-realtime"
                type="range"
                min={0.05}
                max={3}
                step={0.05}
                value={flowerBloomSeconds}
                onChange={(event) => setFlowerBloomSeconds(parseFloat(event.target.value))}
                className="w-full"
              />
            </div>
            <div>
              <div className="flex items-center justify-between text-xs text-slate-300 mb-1">
                <label htmlFor="flower-decay-seconds-realtime">Decay timing</label>
                <span>{flowerDecaySeconds.toFixed(2)}s</span>
              </div>
              <input
                id="flower-decay-seconds-realtime"
                type="range"
                min={0.2}
                max={5}
                step={0.05}
                value={flowerDecaySeconds}
                onChange={(event) => setFlowerDecaySeconds(parseFloat(event.target.value))}
                className="w-full"
              />
            </div>
            <div>
              <div className="flex items-center justify-between text-xs text-slate-300 mb-1">
                <label htmlFor="whimsy-intensity-realtime">Whimsy intensity</label>
                <span>{whimsyIntensity.toFixed(2)}x</span>
              </div>
              <input
                id="whimsy-intensity-realtime"
                type="range"
                min={0}
                max={2}
                step={0.05}
                value={whimsyIntensity}
                onChange={(event) => setWhimsyIntensity(parseFloat(event.target.value))}
                className="w-full"
              />
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-200">
              <label htmlFor="toon-texture-mode-realtime" className="text-slate-300">Toon texture</label>
              <select
                id="toon-texture-mode-realtime"
                value={toonTextureMode}
                onChange={(event) => setToonTextureMode(event.target.value as ToonTextureMode)}
                className="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-slate-100"
              >
                <option value="none">None</option>
                <option value="stipple">Stipple</option>
                <option value="hatch">Hatch</option>
              </select>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showStepPoints}
                  onChange={(event) => setShowStepPoints(event.target.checked)}
                  className="w-4 h-4"
                />
                <span>Show step points</span>
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={realtimeBackgroundSegmentationEnabled}
                  onChange={(event) => setRealtimeBackgroundSegmentationEnabled(event.target.checked)}
                  className="w-4 h-4"
                />
                <span>Background segmentation (flowers behind person)</span>
              </label>
              <div className="flex items-center gap-2 text-sm text-slate-200">
                <label htmlFor="step-marker-style-realtime" className="text-slate-300">Step marker style</label>
                <select
                  id="step-marker-style-realtime"
                  value={stepMarkerStyle}
                  onChange={(event) => setStepMarkerStyle(event.target.value as StepMarkerStyle)}
                  className="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-slate-100"
                >
                  <option value="flowers">Growing flowers</option>
                  <option value="flowers-3d">Growing flowers (3D)</option>
                  <option value="boxes">Boxes</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded border border-red-700 bg-red-950/40 p-2 text-sm text-red-300">{error}</div>
        )}

        <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-slate-700 bg-black">
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-contain bg-black"
            playsInline
            controls={false}
            onLoadedMetadata={handleLoadedMetadata}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
          />
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
          <div className="absolute top-2 right-2 rounded bg-black/65 px-2 py-1 text-[11px] text-slate-100">
            <div className="font-medium">Camera Motion</div>
            <div className="flex items-center gap-2">
              <svg width="42" height="42" viewBox="0 0 42 42" className="shrink-0">
                <circle cx="21" cy="21" r="19" fill="none" stroke="#475569" strokeWidth="1.5" />
                <line x1="21" y1="21" x2={21 + cameraMotion.dx * 2} y2={21 + cameraMotion.dy * 2} stroke="#22d3ee" strokeWidth="2.2" />
                <circle cx={21 + cameraMotion.dx * 2} cy={21 + cameraMotion.dy * 2} r="2.6" fill="#22d3ee" />
              </svg>
              <div>
                <div>dx: {cameraMotion.dx.toFixed(2)} px</div>
                <div>dy: {cameraMotion.dy.toFixed(2)} px</div>
              </div>
            </div>
          </div>
        </div>
        <div className="rounded border border-slate-700 bg-black/40 p-2">
          <div className="text-xs text-slate-400 mb-2">Step detection debug (sampled timeline)</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-slate-200">
            <div className="rounded border border-cyan-700/40 bg-cyan-950/20 p-2">
              <div className="font-medium text-cyan-300 mb-1">Left foot</div>
              <div>phase: {stepDebug.left.phase}</div>
              <div>stable samples: {stepDebug.left.stableSamples}</div>
              <div>contact: {stepDebug.left.contactScore.toFixed(2)}</div>
              <div>norm velocity: {stepDebug.left.normalizedVelocity.toFixed(3)}</div>
            </div>
            <div className="rounded border border-pink-700/40 bg-pink-950/20 p-2">
              <div className="font-medium text-pink-300 mb-1">Right foot</div>
              <div>phase: {stepDebug.right.phase}</div>
              <div>stable samples: {stepDebug.right.stableSamples}</div>
              <div>contact: {stepDebug.right.contactScore.toFixed(2)}</div>
              <div>norm velocity: {stepDebug.right.normalizedVelocity.toFixed(3)}</div>
            </div>
          </div>
          <div className="text-[11px] text-slate-400 mt-2">sample tick: {stepDebug.sampleTick}</div>
        </div>
        <div className="rounded border border-slate-700 bg-black/40 p-3">
          <div className="text-xs text-slate-400 mb-2">Foot motion isolator (ankle/heel/toe)</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(['left', 'right'] as const).map((side) => {
              const raw = footLayout[side];
              const normalized = raw ? normalizeFootLayout(raw) : null;
              return (
                <div key={side} className="rounded border border-slate-700 bg-slate-900/60 p-2">
                  <div className="text-xs text-slate-300 mb-2 capitalize">{side} foot (2D)</div>
                  {normalized ? (
                    <svg viewBox="0 0 120 120" className="w-full h-32 rounded bg-slate-950">
                      <line x1="60" y1="0" x2="60" y2="120" stroke="#334155" strokeWidth="1" />
                      <line x1="0" y1="60" x2="120" y2="60" stroke="#334155" strokeWidth="1" />
                      {(() => {
                        const ankle = normalized.find((p) => p.label === 'ankle');
                        const heel = normalized.find((p) => p.label === 'heel');
                        const toe = normalized.find((p) => p.label === 'toe');
                        if (!ankle || !heel || !toe) return null;
                        const toCanvas = (point: FootLayoutPoint) => ({
                          x: 60 + point.x * 36,
                          y: 60 + point.y * 36,
                        });
                        const a = toCanvas(ankle);
                        const h = toCanvas(heel);
                        const t = toCanvas(toe);
                        return (
                          <>
                            <polyline
                              points={`${h.x},${h.y} ${a.x},${a.y} ${t.x},${t.y}`}
                              fill="none"
                              stroke="#38bdf8"
                              strokeWidth="2.5"
                            />
                            <line
                              x1={h.x}
                              y1={h.y}
                              x2={t.x}
                              y2={t.y}
                              stroke="#38bdf8"
                              strokeWidth="2"
                              opacity="0.9"
                            />
                            <circle cx={a.x} cy={a.y} r="4" fill="#22c55e" />
                            <circle cx={h.x} cy={h.y} r="4" fill="#eab308" />
                            <circle cx={t.x} cy={t.y} r="4" fill="#f97316" />
                          </>
                        );
                      })()}
                    </svg>
                  ) : (
                    <div className="h-32 flex items-center justify-center text-xs text-slate-500 bg-slate-950 rounded">
                      Foot landmarks not visible
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="rounded border border-slate-700 bg-black/40 p-2">
          <div className="text-xs text-slate-400 mb-1">Step markers timeline</div>
          <div className="relative h-5 rounded bg-slate-800/70 overflow-hidden">
            {(sourceMode === 'upload' ? duration > 0 : timelineMarkers.length > 0) &&
              timelineMarkers.map((marker, index) => {
                  const relative =
                    (marker.time - timelineWindowStart) /
                    Math.max(0.0001, timelineWindowEnd - timelineWindowStart);
                  return (
                    <div
                      key={`${marker.time}-${index}`}
                      className={`absolute top-0 h-full w-[3px] ${marker.foot === 'left' ? 'bg-cyan-400' : 'bg-pink-400'}`}
                      style={{ left: `${Math.max(0, Math.min(100, relative * 100))}%` }}
                      title={`${marker.foot} step @ ${marker.time.toFixed(2)}s`}
                    />
                  );
                })}
          </div>
          <div className="mt-2 flex items-center gap-4 text-[11px] text-slate-300">
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-cyan-400" />
              <span>Left foot</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-pink-400" />
              <span>Right foot</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

