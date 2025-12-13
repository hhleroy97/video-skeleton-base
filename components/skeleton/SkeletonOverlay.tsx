'use client';

import { useEffect, useRef, useState } from 'react';
import {
  POSE_CONNECTIONS_LIST,
  HAND_CONNECTIONS_LIST,
} from '@/lib/mediapipe';
import { FACE_CONNECTIONS } from '@/lib/mediapipe/face';
import type { MediaPipeResults } from '@/types/mediapipe';

// Lazy load drawing utils
const loadDrawingUtils = async () => {
  try {
    const module = await import('@mediapipe/drawing_utils');
    const drawConnectors = module.drawConnectors || (module as any).default?.drawConnectors;
    const drawLandmarks = module.drawLandmarks || (module as any).default?.drawLandmarks;
    
    if (!drawConnectors || !drawLandmarks) {
      console.error('Drawing utils not found. Module keys:', Object.keys(module));
      return { drawConnectors: null, drawLandmarks: null };
    }
    
    return { drawConnectors, drawLandmarks };
  } catch (error) {
    console.error('Failed to load drawing utils:', error);
    return { drawConnectors: null, drawLandmarks: null };
  }
};

interface SkeletonOverlayProps {
  videoElement: HTMLVideoElement | null;
  results: MediaPipeResults | null;
  width?: number;
  height?: number;
  className?: string;
  showBody?: boolean;
  showHands?: boolean;
  showFace?: boolean;
}

/**
 * SkeletonOverlay component that draws skeleton tracking on a canvas
 */
export function SkeletonOverlay({
  videoElement,
  results,
  width = 640,
  height = 480,
  className,
  showBody = true,
  showHands = true,
  showFace = true,
}: SkeletonOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingUtilsRef = useRef<{ drawConnectors: any; drawLandmarks: any } | null>(null);
  const [drawingUtilsLoaded, setDrawingUtilsLoaded] = useState(false);

  // Load drawing utils on mount
  useEffect(() => {
    loadDrawingUtils().then((utils) => {
      if (utils.drawConnectors && utils.drawLandmarks) {
        drawingUtilsRef.current = utils;
        setDrawingUtilsLoaded(true);
      }
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !videoElement || !drawingUtilsLoaded) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    // Set canvas size to match video
    canvas.width = width;
    canvas.height = height;

    const draw = () => {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (!results || !drawingUtilsRef.current) {
        requestAnimationFrame(draw);
        return;
      }

      const { drawConnectors, drawLandmarks } = drawingUtilsRef.current;

      // Scale landmarks from normalized coordinates (0-1) to canvas coordinates
      const scaleX = canvas.width;
      const scaleY = canvas.height;

      // Draw pose skeleton
      if (showBody && results.pose?.poseLandmarks) {
        const scaledLandmarks = results.pose.poseLandmarks.map((lm) => ({
          x: lm.x * scaleX,
          y: lm.y * scaleY,
          z: lm.z,
          visibility: lm.visibility,
        }));
        drawConnectors(ctx, scaledLandmarks, POSE_CONNECTIONS_LIST, {
          color: '#00FF00',
          lineWidth: 2,
        });
        drawLandmarks(ctx, scaledLandmarks, {
          color: '#00FF00',
          lineWidth: 1,
          radius: 3,
        });
      }

      // Draw hands skeleton
      if (showHands && results.hands) {
        results.hands.forEach((hand, index) => {
          const color = index === 0 ? '#FF0000' : '#0000FF'; // Red for first hand, blue for second
          const scaledLandmarks = hand.landmarks.map((lm) => ({
            x: lm.x * scaleX,
            y: lm.y * scaleY,
            z: lm.z,
          }));
          drawConnectors(ctx, scaledLandmarks, HAND_CONNECTIONS_LIST, {
            color,
            lineWidth: 2,
          });
          drawLandmarks(ctx, scaledLandmarks, {
            color,
            lineWidth: 1,
            radius: 2,
          });
        });
      }

      // Draw face mesh
      if (showFace && results.face?.multiFaceLandmarks) {
        results.face.multiFaceLandmarks.forEach((faceLandmarks) => {
          const scaledLandmarks = faceLandmarks.map((lm) => ({
            x: lm.x * scaleX,
            y: lm.y * scaleY,
            z: lm.z,
          }));
          // Draw face landmarks as points (connections can be added if needed)
          if (FACE_CONNECTIONS.length > 0) {
            drawConnectors(ctx, scaledLandmarks, FACE_CONNECTIONS, {
              color: '#FFFF00',
              lineWidth: 1,
            });
          }
          drawLandmarks(ctx, scaledLandmarks, {
            color: '#FFFF00',
            lineWidth: 0.5,
            radius: 1,
          });
        });
      }

      requestAnimationFrame(draw);
    };

    draw();
  }, [videoElement, results, width, height, showBody, showHands, showFace, drawingUtilsLoaded]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={`absolute top-0 left-0 ${className || ''}`}
      style={{
        pointerEvents: 'none',
      }}
    />
  );
}

