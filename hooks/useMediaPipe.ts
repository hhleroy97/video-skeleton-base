'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Pose } from '@mediapipe/pose';
import { Hands } from '@mediapipe/hands';
import { FaceMesh } from '@mediapipe/face_mesh';
import {
  createPoseDetector,
  createHandsDetector,
  createFaceDetector,
  processPoseResults,
  processHandsResults,
  processFaceResults,
} from '@/lib/mediapipe';
import type {
  MediaPipeResults,
  MediaPipeConfig,
  TrackingType,
} from '@/types/mediapipe';

interface UseMediaPipeOptions extends MediaPipeConfig {
  videoElement?: HTMLVideoElement | null;
  onResults?: (results: MediaPipeResults) => void;
}

/**
 * Hook to manage MediaPipe initialization and processing
 */
export function useMediaPipe(options: UseMediaPipeOptions = {}) {
  const {
    enableBody = true,
    enableHands = true,
    enableFace = true,
    minDetectionConfidence = 0.5,
    minTrackingConfidence = 0.5,
    videoElement,
    onResults,
  } = options;

  const poseRef = useRef<Pose | null>(null);
  const handsRef = useRef<Hands | null>(null);
  const faceRef = useRef<FaceMesh | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [fps, setFps] = useState(0);
  const frameCountRef = useRef(0);
  const lastFpsUpdateRef = useRef(Date.now());
  const animationFrameRef = useRef<number | null>(null);
  const isProcessingRef = useRef(false);

  /**
   * Initialize MediaPipe detectors
   */
  const initialize = useCallback(async () => {
    try {
      // Initialize pose detector
      if (enableBody) {
        poseRef.current = await createPoseDetector({
          modelComplexity: 1,
          smoothLandmarks: true,
          minDetectionConfidence,
          minTrackingConfidence,
        });
      }

      // Initialize hands detector
      if (enableHands) {
        handsRef.current = await createHandsDetector({
          maxNumHands: 2,
          modelComplexity: 1,
          minDetectionConfidence,
          minTrackingConfidence,
        });
      }

      // Initialize face detector
      if (enableFace) {
        faceRef.current = await createFaceDetector({
          maxNumFaces: 1,
          refineLandmarks: false,
          minDetectionConfidence,
          minTrackingConfidence,
        });
      }

      setIsInitialized(true);
    } catch (error) {
      console.error('Failed to initialize MediaPipe:', error);
      throw error;
    }
  }, [enableBody, enableHands, enableFace, minDetectionConfidence, minTrackingConfidence]);

  /**
   * Process a single frame
   */
  const processFrame = useCallback(async () => {
    if (!videoElement || !isInitialized || !isProcessingRef.current) {
      return;
    }

    if (videoElement.readyState !== videoElement.HAVE_ENOUGH_DATA) {
      // Continue loop even if video not ready
      animationFrameRef.current = requestAnimationFrame(() => processFrame());
      return;
    }

    const results: MediaPipeResults = {};

    try {
      // Process pose
      if (enableBody && poseRef.current) {
        await new Promise<void>((resolve) => {
          poseRef.current!.onResults((poseResults) => {
            const processed = processPoseResults(poseResults);
            if (processed) {
              results.pose = processed;
            }
            resolve();
          });
          poseRef.current!.send({ image: videoElement });
        });
      }

      // Process hands
      if (enableHands && handsRef.current) {
        await new Promise<void>((resolve) => {
          handsRef.current!.onResults((handsResults) => {
            const processed = processHandsResults(handsResults);
            if (processed.length > 0) {
              results.hands = processed;
            }
            resolve();
          });
          handsRef.current!.send({ image: videoElement });
        });
      }

      // Process face
      if (enableFace && faceRef.current) {
        await new Promise<void>((resolve) => {
          faceRef.current!.onResults((faceResults) => {
            const processed = processFaceResults(faceResults);
            if (processed) {
              results.face = processed;
            }
            resolve();
          });
          faceRef.current!.send({ image: videoElement });
        });
      }

      // Update FPS
      frameCountRef.current++;
      const now = Date.now();
      if (now - lastFpsUpdateRef.current >= 1000) {
        setFps(frameCountRef.current);
        frameCountRef.current = 0;
        lastFpsUpdateRef.current = now;
      }

      // Callback with results
      if (onResults) {
        onResults(results);
      }
    } catch (error) {
      console.error('Error processing frame:', error);
    }

    // Continue processing loop
    if (isProcessingRef.current) {
      animationFrameRef.current = requestAnimationFrame(() => processFrame());
    }
  }, [videoElement, isInitialized, enableBody, enableHands, enableFace, onResults]);

  /**
   * Start processing video frames
   */
  const startProcessing = useCallback(() => {
    if (!videoElement || !isInitialized || isProcessingRef.current) {
      return;
    }

    isProcessingRef.current = true;
    setIsProcessing(true);
    processFrame();
  }, [videoElement, isInitialized, processFrame]);

  /**
   * Stop processing video frames
   */
  const stopProcessing = useCallback(() => {
    isProcessingRef.current = false;
    setIsProcessing(false);
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  /**
   * Cleanup MediaPipe detectors
   */
  const cleanup = useCallback(() => {
    stopProcessing();
    if (poseRef.current) {
      poseRef.current.close();
      poseRef.current = null;
    }
    if (handsRef.current) {
      handsRef.current.close();
      handsRef.current = null;
    }
    if (faceRef.current) {
      faceRef.current.close();
      faceRef.current = null;
    }
    setIsInitialized(false);
  }, [stopProcessing]);

  // Initialize on mount (client-side only)
  useEffect(() => {
    // Only initialize on client side
    if (typeof window === 'undefined') {
      return;
    }
    
    initialize();

    return () => {
      cleanup();
    };
  }, [initialize, cleanup]);

  return {
    isInitialized,
    isProcessing,
    fps,
    processFrame,
    startProcessing,
    stopProcessing,
    cleanup,
    initialize,
  };
}

