'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { estimateBorderTranslation, rgbaToGrayscale, sampleBorderPoints } from '@/lib/cameraMotion';
import { createPoseDetector, POSE_CONNECTIONS_LIST, processPoseResults } from '@/lib/mediapipe/pose';
import { smoothEwma, updateGaitPhase } from '@/lib/stepDetection';
import { normalizeTrimWindow, resolvePlaybackBoundary } from '@/lib/videoTrim';

interface VideoPoseUploadVisualProps {
  className?: string;
}

type SourceMode = 'upload' | 'realtime';

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
  landmarks: Array<{ x: number; y: number; visibility?: number }>
) => {
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
  const [stepSensitivityPercent, setStepSensitivityPercent] = useState(6);
  const [pointSizeScale, setPointSizeScale] = useState(1.2);
  const [boxHeightScale, setBoxHeightScale] = useState(12);
  const [boxGrowthSeconds, setBoxGrowthSeconds] = useState(0.4);
  const [showStepPoints, setShowStepPoints] = useState(true);
  const [showStepBoxes, setShowStepBoxes] = useState(true);
  const [cameraMotion, setCameraMotion] = useState({ dx: 0, dy: 0, cumulativeX: 0, cumulativeY: 0 });
  const [footLayout, setFootLayout] = useState<FootLayoutData>({ left: null, right: null });
  const [stepDebug, setStepDebug] = useState<StepDebugData>({
    sampleTick: 0,
    left: { phase: 'stance', stableSamples: 0, contactScore: 0, normalizedVelocity: 0 },
    right: { phase: 'stance', stableSamples: 0, contactScore: 0, normalizedVelocity: 0 },
  });
  const stepMarkersRef = useRef<StepMarker[]>([]);
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

      if (poseRef.current && !processingFrameRef.current && !video.paused && !video.ended) {
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
      if (markers.length > 0 && (showStepPoints || showStepBoxes)) {
        ctx.strokeStyle = '#111827';
        ctx.lineWidth = 2;
        for (const marker of markers) {
          if (sourceMode === 'upload' && (marker.time < trimStart || marker.time > trimEnd)) continue;
          const solidColor = marker.foot === 'left' ? '#22d3ee' : '#f472b6';
          const translucentColor =
            marker.foot === 'left' ? 'rgba(34, 211, 238, 0.65)' : 'rgba(244, 114, 182, 0.65)';
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
          if (showStepBoxes) {
            // Grow a box upward from the center of the marker, scaled by raw step magnitude.
            ctx.fillStyle = translucentColor;
            ctx.fillRect(drawX - boxWidth / 2, drawY - boxHeight, boxWidth, boxHeight);
            ctx.strokeStyle = solidColor;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(drawX - boxWidth / 2, drawY - boxHeight, boxWidth, boxHeight);
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
      const segmentationMask = segmentationMaskRef.current;
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
      if (latestPose && latestPose.length > 0) {
        drawPose(ctx, latestPose);
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
  }, [boxGrowthSeconds, boxHeightScale, ensurePersonLayerCanvas, loopPlayback, pointSizeScale, resetLoopRelativeMotion, showStepBoxes, showStepPoints, sourceMode, stepSensitivityPercent, trimEnd, trimStart]);

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
            lastPoseUpdateTimeRef.current = video.currentTime;
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
            disabled={(sourceMode === 'upload' && !videoName) || !isPoseReady}
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
          <span>Pose model: {isPoseReady ? 'ready' : 'loading...'}</span>
          <span>Overlay FPS: {fps}</span>
          <span>Landmarks: 33-point MediaPipe Pose</span>
          <span>Detected steps: {stepMarkers.length}</span>
          <span>
            Camera motion: dx {cameraMotion.dx.toFixed(2)}px, dy {cameraMotion.dy.toFixed(2)}px
          </span>
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
              <label htmlFor="box-height-scale">Step box height scale</label>
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
              Scales upward box growth from each marker center based on raw step size.
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
              Controls how quickly step boxes grow from zero to full height.
            </div>
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
                checked={showStepBoxes}
                onChange={(event) => setShowStepBoxes(event.target.checked)}
                className="w-4 h-4"
              />
              <span>Show step boxes</span>
            </label>
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
            {duration > 0 &&
              stepMarkers
                .filter((marker) => marker.time >= trimStart && marker.time <= trimEnd)
                .map((marker, index) => {
                  const relative = (marker.time - trimStart) / Math.max(0.0001, trimEnd - trimStart);
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

