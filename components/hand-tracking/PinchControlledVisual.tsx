'use client';

import { useEffect, useRef } from 'react';
import type { FinalVector } from './PinchHistoryTracker';

interface PinchControlledVisualProps {
  vector: FinalVector | null;
  className?: string;
}

/**
 * Simple visual element controlled by the composite vector from pinch history
 */
export function PinchControlledVisual({
  vector,
  className = '',
}: PinchControlledVisualProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const visualRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !visualRef.current || !vector) return;

    const container = containerRef.current;
    const visual = visualRef.current;
    
    // Convert center-origin coordinates to pixel coordinates
    const centerX = container.offsetWidth / 2;
    const centerY = container.offsetHeight / 2;
    
    // Use the end position (current position)
    const x = centerX + vector.endX * container.offsetWidth;
    const y = centerY + vector.endY * container.offsetHeight;
    
    // Apply position
    visual.style.transform = `translate(${x}px, ${y}px)`;
    visual.style.opacity = '1';
    
    // Apply rotation based on direction
    const angle = Math.atan2(vector.dy, vector.dx) * (180 / Math.PI);
    visual.style.setProperty('--rotation', `${angle}deg`);
    
    // Scale based on magnitude
    const scale = Math.min(1 + vector.magnitude * 2, 2);
    visual.style.setProperty('--scale', `${scale}`);
    
  }, [vector]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-96 bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg border-2 border-gray-300 ${className}`}
    >
      {/* Center reference point */}
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-gray-400 rounded-full"></div>
      
      {/* Controlled visual element */}
      <div
        ref={visualRef}
        className="absolute top-1/2 left-1/2 w-16 h-16 bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 rounded-full shadow-2xl transition-all duration-150 ease-out pointer-events-none opacity-0"
        style={{
          transform: 'translate(-50%, -50%)',
          transformOrigin: 'center',
        }}
      >
        {/* Direction indicator */}
        {vector && (
          <div
            className="absolute top-1/2 left-1/2 w-0 h-0 border-l-16 border-l-purple-700 border-t-8 border-t-transparent border-b-8 border-b-transparent"
            style={{
              transform: `translate(-50%, -50%) rotate(var(--rotation, 0deg)) scale(var(--scale, 1))`,
              transformOrigin: 'center',
            }}
          />
        )}
        {/* Magnitude indicator ring */}
        {vector && (
          <div
            className="absolute inset-0 rounded-full border-2 border-white/60"
            style={{
              transform: `scale(var(--scale, 1))`,
              transformOrigin: 'center',
            }}
          />
        )}
      </div>
    </div>
  );
}

