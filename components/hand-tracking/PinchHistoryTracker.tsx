'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { PinchVector } from './HandTracking';

export interface FinalVector {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  dx: number;
  dy: number;
  magnitude: number;
  duration: number;
}

// Number of dropped frames (frames without pinching) before marking vector as complete
// Default: 10 frames (~166ms at 60fps)
export const DROPPED_FRAMES_THRESHOLD = 10;

interface UsePinchHistoryOptions {
  onFinalVector?: (vector: FinalVector | null) => void;
  onCurrentVector?: (vector: FinalVector | null) => void; // For live preview while pinching
  droppedFramesThreshold?: number; // Number of frames without pinching before finalizing
}

/**
 * Hook that tracks start and end points while pinching
 * Updates end point continuously while pinching
 * Generates final vector only when user releases the pinch
 */
export function usePinchHistory(
  pinchVector: PinchVector | null,
  options: UsePinchHistoryOptions = {}
) {
  const {
    onFinalVector,
    onCurrentVector,
    droppedFramesThreshold = DROPPED_FRAMES_THRESHOLD,
  } = options;

  const wasPinchingRef = useRef(false);
  const startPositionRef = useRef<{ x: number; y: number; timestamp: number } | null>(null);
  const endPositionRef = useRef<{ x: number; y: number; timestamp: number } | null>(null);
  const droppedFramesCountRef = useRef(0);
  const [isTracking, setIsTracking] = useState(false);

  const calculateVector = useCallback((
    start: { x: number; y: number; timestamp: number },
    end: { x: number; y: number; timestamp: number }
  ): FinalVector => {
    // Calculate displacement
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const magnitude = Math.sqrt(dx * dx + dy * dy);
    const duration = end.timestamp - start.timestamp;
    
    // Normalize direction
    const normalizedDx = magnitude > 0 ? dx / magnitude : 0;
    const normalizedDy = magnitude > 0 ? dy / magnitude : 0;
    
    return {
      startX: start.x,
      startY: start.y,
      endX: end.x,
      endY: end.y,
      dx: normalizedDx,
      dy: normalizedDy,
      magnitude,
      duration,
    };
  }, []);

  // Frame counter effect - continuously counts dropped frames when waiting to finalize
  useEffect(() => {
    let animationFrameId: number;
    
    const countFrames = () => {
      // Only count if we're waiting to finalize (have a vector but not pinching)
      if (!pinchVector && startPositionRef.current && endPositionRef.current && droppedFramesCountRef.current > 0) {
        droppedFramesCountRef.current += 1;
        
        // Check if we've reached threshold to finalize
        if (droppedFramesCountRef.current >= droppedFramesThreshold) {
          // Generate final vector after delay
          const finalVector = calculateVector(
            startPositionRef.current,
            endPositionRef.current
          );
          
          if (onFinalVector) {
            onFinalVector(finalVector);
          }
          
          // Reset
          startPositionRef.current = null;
          endPositionRef.current = null;
          droppedFramesCountRef.current = 0;
          setIsTracking(false);
          
          if (onCurrentVector) {
            onCurrentVector(null);
          }
        } else {
          // Still within threshold - keep showing current vector but don't finalize yet
          // This allows user to resume pinching without losing the vector
          if (onCurrentVector) {
            const currentVector = calculateVector(
              startPositionRef.current,
              endPositionRef.current
            );
            onCurrentVector(currentVector);
          }
        }
      }
      
      animationFrameId = requestAnimationFrame(countFrames);
    };
    
    animationFrameId = requestAnimationFrame(countFrames);
    
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [pinchVector, onFinalVector, onCurrentVector, calculateVector, droppedFramesThreshold]);

  // Main effect for tracking pinch state
  useEffect(() => {
    const isPinching = pinchVector !== null;
    const wasPinching = wasPinchingRef.current;

    if (isPinching && !wasPinching) {
      // Started pinching - check if we should start new or continue existing
      if (!startPositionRef.current) {
        // New pinch - set start position
        const now = Date.now();
        startPositionRef.current = {
          x: pinchVector.x,
          y: pinchVector.y,
          timestamp: now,
        };
        endPositionRef.current = null;
        setIsTracking(true);
      }
      // If startPositionRef already exists, we're resuming - don't reset it
      
      // Reset dropped frames counter since we're pinching again
      droppedFramesCountRef.current = 0;
    }

    if (isPinching && startPositionRef.current) {
      // Update end position continuously while pinching
      const now = Date.now();
      endPositionRef.current = {
        x: pinchVector.x,
        y: pinchVector.y,
        timestamp: now,
      };
      
      // Reset dropped frames counter since we're pinching
      droppedFramesCountRef.current = 0;

      // Calculate current vector for live preview
      const currentVector = calculateVector(
        startPositionRef.current,
        endPositionRef.current
      );
      
      if (onCurrentVector) {
        onCurrentVector(currentVector);
      }
    } else if (wasPinching && !isPinching && startPositionRef.current && endPositionRef.current) {
      // Just stopped pinching - initialize dropped frames counter to start counting
      // Don't reset the vector data - keep it so user can resume
      droppedFramesCountRef.current = 1; // Start at 1 since this is the first dropped frame
      
      // Keep showing current vector
      if (onCurrentVector) {
        const currentVector = calculateVector(
          startPositionRef.current,
          endPositionRef.current
        );
        onCurrentVector(currentVector);
      }
    }

    wasPinchingRef.current = isPinching;
  }, [pinchVector, onCurrentVector, calculateVector]);

  // Return tracking state
  return {
    isTracking,
    startPosition: startPositionRef.current,
    endPosition: endPositionRef.current,
  };
}

