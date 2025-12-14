'use client';

import type { FinalVector } from './PinchHistoryTracker';

interface FinalVectorArrowsProps {
  vector: FinalVector;
  scale?: number;
}

/**
 * Component that displays arrows for the final vector from history
 * Shows start position, end position, and direction vectors
 */
export function FinalVectorArrows({ vector, scale = 50 }: FinalVectorArrowsProps) {
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
    markerId: string,
    strokeWidth: number = 2
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
          strokeWidth={strokeWidth}
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

  // Convert center-origin coordinates to SVG coordinates
  const startX = centerX + vector.startX * scale * 2;
  const startY = centerY - vector.startY * scale * 2; // Invert Y for screen coordinates
  const endX = centerX + vector.endX * scale * 2;
  const endY = centerY - vector.endY * scale * 2;

  // Direction vector length based on magnitude
  const directionLength = vector.magnitude * scale * 2;

  return (
    <div>
      {/* Composite Vector (Start to End) */}
      <h4 className="text-sm font-semibold mb-2">Composite Vector</h4>
      <svg width="200" height="200" className="border border-gray-300 rounded bg-gray-50">
        <defs>
          <marker
            id="arrowhead-start-red"
            markerWidth="10"
            markerHeight="10"
            refX="9"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 10 3, 0 6" fill="#ef4444" />
          </marker>
          <marker
            id="arrowhead-end-green"
            markerWidth="10"
            markerHeight="10"
            refX="9"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 10 3, 0 6" fill="#22c55e" />
          </marker>
          <marker
            id="arrowhead-composite-purple"
            markerWidth="10"
            markerHeight="10"
            refX="9"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 10 3, 0 6" fill="#9333ea" />
          </marker>
        </defs>
        {/* Start position vector (from center to start) */}
        {drawArrow(
          centerX,
          centerY,
          startX,
          startY,
          '#ef4444',
          'Start',
          'arrowhead-start-red'
        )}
        {/* End position vector (from center to end) */}
        {drawArrow(
          centerX,
          centerY,
          endX,
          endY,
          '#22c55e',
          'End',
          'arrowhead-end-green'
        )}
        {/* Composite vector (from start to end) */}
        {drawArrow(
          startX,
          startY,
          endX,
          endY,
          '#9333ea',
          'Vector',
          'arrowhead-composite-purple',
          3
        )}
        {/* Start point */}
        <circle cx={startX} cy={startY} r="4" fill="#ef4444" />
        {/* End point */}
        <circle cx={endX} cy={endY} r="4" fill="#22c55e" />
        {/* Center point */}
        <circle cx={centerX} cy={centerY} r="3" fill="#000" />
      </svg>
    </div>
  );
}

