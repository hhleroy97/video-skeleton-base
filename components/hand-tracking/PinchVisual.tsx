'use client';

import { useEffect, useRef } from 'react';
import type { PinchVector } from './HandTracking';

interface PinchVisualProps {
  vector: PinchVector | null;
  className?: string;
}

/**
 * Visual component that follows the pinch vector position
 * Automatically matches the size of its parent container (should match canvas size)
 */
export function PinchVisual({
  vector,
  className = '',
}: PinchVisualProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !vector) return;

    const container = containerRef.current;
    const centerX = container.offsetWidth / 2;
    const centerY = container.offsetHeight / 2;
    // Convert center-origin coordinates to pixel coordinates
    // vector.x and vector.y are in range -0.5 to 0.5 with (0,0) at center
    const x = centerX + vector.x * container.offsetWidth;
    const y = centerY + vector.y * container.offsetHeight;

    // Update visual position
    const visual = container.querySelector('.pinch-visual-element') as HTMLElement;
    if (visual) {
      visual.style.transform = `translate(${x}px, ${y}px)`;
      visual.style.opacity = '1';
    }
  }, [vector]);

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 ${className}`}
    >
      {/* Visual element that follows the pinch */}
      <div
        className="pinch-visual-element absolute top-0 left-0 w-8 h-8 bg-blue-500 rounded-full shadow-lg transition-all duration-75 ease-out pointer-events-none opacity-0"
        style={{
          transform: 'translate(-50%, -50%)',
        }}
      >
        {/* Optional: Add a direction indicator */}
        {vector && (
          <div
            className="absolute top-1/2 left-1/2 w-0 h-0 border-l-8 border-l-blue-700 border-t-4 border-t-transparent border-b-4 border-b-transparent"
            style={{
              transform: `translate(-50%, -50%) rotate(${Math.atan2(vector.dy, vector.dx) * (180 / Math.PI)}deg)`,
            }}
          />
        )}
      </div>
    </div>
  );
}

