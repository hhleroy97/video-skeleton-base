'use client';

import { useEffect, useRef } from 'react';
import type { FinalVector } from './PinchHistoryTracker';

interface FinalVectorVisualProps {
  finalVector: FinalVector | null;
  className?: string;
}

/**
 * Visual component controlled by the final vector from pinch history
 */
export function FinalVectorVisual({
  finalVector,
  className = '',
}: FinalVectorVisualProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const visualRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !visualRef.current || !finalVector) return;

    const container = containerRef.current;
    const visual = visualRef.current;
    
    // Convert center-origin coordinates to pixel coordinates
    const centerX = container.offsetWidth / 2;
    const centerY = container.offsetHeight / 2;
    
    // Use the end position (current position while pinching)
    const x = centerX + finalVector.endX * container.offsetWidth;
    const y = centerY + finalVector.endY * container.offsetHeight;
    
    // Apply position
    visual.style.transform = `translate(${x}px, ${y}px)`;
    visual.style.opacity = '1';
    
    // Apply rotation based on direction
    const angle = Math.atan2(finalVector.dy, finalVector.dx) * (180 / Math.PI);
    visual.style.setProperty('--rotation', `${angle}deg`);
    
  }, [finalVector]);

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 ${className}`}
    >
      <div
        ref={visualRef}
        className="absolute top-0 left-0 w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg shadow-xl transition-all duration-300 ease-out pointer-events-none opacity-0"
        style={{
          transform: 'translate(-50%, -50%)',
          transformOrigin: 'center',
        }}
      >
        {/* Direction indicator arrow */}
        {finalVector && (
          <div
            className="absolute top-1/2 left-1/2 w-0 h-0 border-l-12 border-l-purple-700 border-t-6 border-t-transparent border-b-6 border-b-transparent"
            style={{
              transform: `translate(-50%, -50%) rotate(var(--rotation, 0deg))`,
            }}
          />
        )}
        {/* Magnitude indicator (size based on magnitude) */}
        {finalVector && (
          <div
            className="absolute inset-0 rounded-lg border-2 border-white/50"
            style={{
              transform: `scale(${Math.min(1 + finalVector.magnitude * 2, 2)})`,
              transformOrigin: 'center',
            }}
          />
        )}
      </div>
    </div>
  );
}

