'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { estimateBorderTranslation, rgbaToGrayscale, sampleBorderPoints } from '@/lib/cameraMotion';
import { createPoseDetector, POSE_CONNECTIONS_LIST, processPoseResults } from '@/lib/mediapipe/pose';
import { isStepTransition } from '@/lib/stepDetection';
import { normalizeTrimWindow, resolvePlaybackBoundary } from '@/lib/videoTrim';

interface VideoPoseUploadVisualProps {
  className?: string;
}

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
  const rafRef = useRef<number | null>(null);
  const latestPoseRef = useRef<Array<{ x: number; y: number; visibility?: number }> | null>(null);
  const currentObjectUrlRef = useRef<string | null>(null);
  const processingFrameRef = useRef(false);
  const frameCountRef = useRef(0);
  const lastFpsUpdateRef = useRef(performance.now());

  const [isPoseReady, setIsPoseReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
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
  const [cameraMotion, setCameraMotion] = useState({ dx: 0, dy: 0, cumulativeX: 0, cumulativeY: 0 });
  const [footLayout, setFootLayout] = useState<FootLayoutData>({ left: null, right: null });
  const stepMarkersRef = useRef<StepMarker[]>([]);
  const prevFootYRef = useRef<Record<'left' | 'right', number | null>>({ left: null, right: null });
  const prevFootVelocityRef = useRef<Record<'left' | 'right', number | null>>({ left: null, right: null });
  const lastStepTimeRef = useRef<Record<'left' | 'right', number>>({ left: -Infinity, right: -Infinity });
  const previousBorderSamplesRef = useRef<ReturnType<typeof sampleBorderPoints> | null>(null);
  const frameIndexRef = useRef(0);
  const cameraMotionRef = useRef({ dx: 0, dy: 0, cumulativeX: 0, cumulativeY: 0 });

  const cleanupLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const resetLoopRelativeMotion = useCallback(() => {
    previousBorderSamplesRef.current = null;
    frameIndexRef.current = 0;
    cameraMotionRef.current = { dx: 0, dy: 0, cumulativeX: 0, cumulativeY: 0 };
    setCameraMotion(cameraMotionRef.current);
    prevFootYRef.current = { left: null, right: null };
    prevFootVelocityRef.current = { left: null, right: null };
    lastStepTimeRef.current = { left: -Infinity, right: -Infinity };

    stepMarkersRef.current = [];
    setStepMarkers([]);
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

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Estimate camera/global frame motion from border-only matching.
      frameIndexRef.current += 1;
      if (frameIndexRef.current % 2 === 0) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const gray = rgbaToGrayscale(imageData.data, canvas.width, canvas.height);
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

      const latestPose = latestPoseRef.current;
      if (latestPose && latestPose.length > 0) {
        drawPose(ctx, latestPose);
      }

      const markers = stepMarkersRef.current;
      if (markers.length > 0) {
        ctx.strokeStyle = '#111827';
        ctx.lineWidth = 2;
        for (const marker of markers) {
          if (marker.time < trimStart || marker.time > trimEnd) continue;
          ctx.fillStyle = marker.foot === 'left' ? '#22d3ee' : '#f472b6';
          const offsetX = cameraMotionRef.current.cumulativeX - marker.camRefX;
          const offsetY = cameraMotionRef.current.cumulativeY - marker.camRefY;
          const drawX = (marker.x + offsetX) * canvas.width;
          const drawY = (marker.y + offsetY) * canvas.height;
          const radius = Math.max(4, Math.min(24, 4 + marker.stepMagnitude * 40 * pointSizeScale));
          ctx.beginPath();
          ctx.arc(drawX, drawY, radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }

      frameCountRef.current += 1;
      const now = performance.now();
      if (now - lastFpsUpdateRef.current >= 1000) {
        setFps(frameCountRef.current);
        frameCountRef.current = 0;
        lastFpsUpdateRef.current = now;
      }
    }

    if (!video.paused && !video.ended) {
      rafRef.current = requestAnimationFrame(() => {
        void drawFrame();
      });
    } else {
      setIsPlaying(false);
    }
  }, [loopPlayback, pointSizeScale, resetLoopRelativeMotion, trimEnd, trimStart]);

  useEffect(() => {
    let isMounted = true;
    const initPose = async () => {
      try {
        const pose = await createPoseDetector({
          modelComplexity: 1,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
          smoothLandmarks: true,
        });

        pose.onResults((results: any) => {
          const processed = processPoseResults(results);
          const poseLandmarks = processed?.poseLandmarks ?? null;
          latestPoseRef.current = poseLandmarks;
          setFootLayout({
            left: extractFootLayout(poseLandmarks, 'left'),
            right: extractFootLayout(poseLandmarks, 'right'),
          });

          const video = videoRef.current;
          if (!video || !poseLandmarks) return;
          const sensitivityRatio = Math.max(0.001, stepSensitivityPercent / 100);

          (['left', 'right'] as const).forEach((side) => {
            const footAnchor = getSideFootAnchor(poseLandmarks, side);
            const heelToAnkleSpan = getSideHeelToAnkleSpan(poseLandmarks, side);
            if (!footAnchor || !heelToAnkleSpan) return;

            const previousY = prevFootYRef.current[side];
            if (previousY !== null) {
              const normalizedVelocity = (footAnchor.y - previousY) / heelToAnkleSpan;
              const stepMagnitude = Math.abs(normalizedVelocity);
              if (
                isStepTransition(prevFootVelocityRef.current[side], normalizedVelocity, {
                  downThreshold: sensitivityRatio,
                  upThreshold: sensitivityRatio,
                }) &&
                video.currentTime - lastStepTimeRef.current[side] > 0.25
              ) {
                lastStepTimeRef.current[side] = video.currentTime;
                setStepMarkers((previous) => {
                  const next = [
                    ...previous,
                    {
                      time: video.currentTime,
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
              prevFootVelocityRef.current[side] = normalizedVelocity;
            }
            prevFootYRef.current[side] = footAnchor.y;
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
      try {
        poseRef.current?.close?.();
      } catch {
        // ignore
      }
      poseRef.current = null;
      if (currentObjectUrlRef.current) {
        URL.revokeObjectURL(currentObjectUrlRef.current);
        currentObjectUrlRef.current = null;
      }
    };
  }, [cleanupLoop, stepSensitivityPercent]);

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
    setStepMarkers([]);
    setFootLayout({ left: null, right: null });
    stepMarkersRef.current = [];
    prevFootYRef.current = { left: null, right: null };
    prevFootVelocityRef.current = { left: null, right: null };
    lastStepTimeRef.current = { left: -Infinity, right: -Infinity };
    previousBorderSamplesRef.current = null;
    frameIndexRef.current = 0;
    cameraMotionRef.current = { dx: 0, dy: 0, cumulativeX: 0, cumulativeY: 0 };
    setCameraMotion(cameraMotionRef.current);
    latestPoseRef.current = null;

    const video = videoRef.current;
    if (video) {
      video.src = objectUrl;
      video.load();
      setIsPlaying(false);
    }
  }, []);

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
  }, [cleanupLoop, drawFrame, duration, trimEnd, trimStart]);

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

  useEffect(() => {
    const video = videoRef.current;
    if (!video || duration <= 0) return;
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
  }, [duration, trimEnd, trimStart]);

  return (
    <div className={`w-full h-full overflow-y-auto bg-slate-950 text-white p-4 ${className}`}>
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept="video/*"
            onChange={handleFileUpload}
            className="block text-sm text-slate-200 file:mr-4 file:rounded file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-white hover:file:bg-blue-700"
          />
          <button
            type="button"
            onClick={handlePlayPause}
            disabled={!videoName || !isPoseReady}
            className="rounded bg-emerald-600 px-3 py-2 text-sm hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <span className="text-xs text-slate-300">{videoName || 'Upload a video to begin.'}</span>
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
        </div>

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

