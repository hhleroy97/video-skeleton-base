'use client';

import type { PinchVector } from './HandTracking';

interface VectorArrowsProps {
  vector: PinchVector;
  scale?: number;
}

/**
 * Component that displays arrows for position (x, y, z) and direction (dx, dy, dz) vectors
 */
export function VectorArrows({ vector, scale = 50 }: VectorArrowsProps) {
  const arrowSize = 8;
  const centerX = 100;
  const centerY = 100;

  // Helper to draw an arrow
  const drawArrow = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string,
    label: string,
    markerId: string
  ) => {
    const dx = x2 - x1;
    const dy = y2 - y1;

    return (
      <g key={label}>
        {/* Arrow line */}
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={color}
          strokeWidth="2"
          markerEnd={`url(#${markerId})`}
        />
        {/* Label */}
        <text
          x={x2 + (dx > 0 ? 5 : -5)}
          y={y2 + (dy > 0 ? 15 : -5)}
          fill={color}
          fontSize="10"
          fontWeight="bold"
          textAnchor={dx > 0 ? 'start' : 'end'}
        >
          {label}
        </text>
      </g>
    );
  };

  return (
    <div>
      {/* Position Vectors (x, y) */}
      <div>
        <h4 className="text-sm font-semibold mb-2">Position Vectors</h4>
        <svg width="200" height="200" className="border border-gray-300 rounded bg-gray-50">
          <defs>
            <marker
              id="arrowhead-red"
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 10 3, 0 6" fill="#ef4444" />
            </marker>
            <marker
              id="arrowhead-green"
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 10 3, 0 6" fill="#22c55e" />
            </marker>
          </defs>
          {/* X axis (red) - horizontal */}
          {/* vector.x is in center-origin: -0.5 to 0.5, where 0 is center */}
          {drawArrow(
            centerX,
            centerY,
            centerX + vector.x * scale * 2,
            centerY,
            '#ef4444',
            'X',
            'arrowhead-red'
          )}
          {/* Y axis (green) - vertical (inverted for screen coordinates) */}
          {drawArrow(
            centerX,
            centerY,
            centerX,
            centerY - vector.y * scale * 2,
            '#22c55e',
            'Y',
            'arrowhead-green'
          )}
          {/* Center point */}
          <circle cx={centerX} cy={centerY} r="3" fill="#000" />
        </svg>
      </div>
    </div>
  );
}

