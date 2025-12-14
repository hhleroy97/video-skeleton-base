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

interface UsePinchHistoryOptions {
  onFinalVector?: (vector: FinalVector | null) => void;
  onCurrentVector?: (vector: FinalVector | null) => void; // For live preview while pinching
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
  } = options;

  const wasPinchingRef = useRef(false);
  const startPositionRef = useRef<{ x: number; y: number; timestamp: number } | null>(null);
  const endPositionRef = useRef<{ x: number; y: number; timestamp: number } | null>(null);
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

  useEffect(() => {
    const isPinching = pinchVector !== null;
    const wasPinching = wasPinchingRef.current;

    if (isPinching && !wasPinching) {
      // Started pinching - set start position
      const now = Date.now();
      startPositionRef.current = {
        x: pinchVector.x,
        y: pinchVector.y,
        timestamp: now,
      };
      endPositionRef.current = null;
      setIsTracking(true);
    }

    if (isPinching && startPositionRef.current) {
      // Update end position continuously while pinching
      const now = Date.now();
      endPositionRef.current = {
        x: pinchVector.x,
        y: pinchVector.y,
        timestamp: now,
      };

      // Calculate current vector for live preview
      const currentVector = calculateVector(
        startPositionRef.current,
        endPositionRef.current
      );
      
      if (onCurrentVector) {
        onCurrentVector(currentVector);
      }
    } else if (wasPinching && !isPinching) {
      // Stopped pinching - generate final vector
      if (startPositionRef.current && endPositionRef.current) {
        const finalVector = calculateVector(
          startPositionRef.current,
          endPositionRef.current
        );
        
        if (onFinalVector) {
          onFinalVector(finalVector);
        }
      }
      
      // Reset
      startPositionRef.current = null;
      endPositionRef.current = null;
      setIsTracking(false);
      
      if (onCurrentVector) {
        onCurrentVector(null);
      }
    }

    wasPinchingRef.current = isPinching;
  }, [pinchVector, onFinalVector, onCurrentVector, calculateVector]);

  // Return tracking state
  return {
    isTracking,
    startPosition: startPositionRef.current,
    endPosition: endPositionRef.current,
  };
}

