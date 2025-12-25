'use client';

import { useEffect, useRef, useState } from 'react';

type Position = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface FpsOverlayProps {
  position?: Position;
  /**
   * How often to update the displayed FPS (ms). Lower = more responsive but more re-renders.
   */
  sampleMs?: number;
  className?: string;
}

function positionClass(position: Position) {
  switch (position) {
    case 'top-left':
      return 'top-3 left-3';
    case 'top-right':
      return 'top-3 right-3';
    case 'bottom-left':
      return 'bottom-3 left-3';
    case 'bottom-right':
      return 'bottom-3 right-3';
  }
}

export function FpsOverlay({ position = 'bottom-left', sampleMs = 500, className = '' }: FpsOverlayProps) {
  const [fps, setFps] = useState(0);
  const framesRef = useRef(0);
  const lastRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;
    framesRef.current = 0;
    lastRef.current = null;

    const loop = (now: number) => {
      framesRef.current += 1;

      if (lastRef.current === null) {
        lastRef.current = now;
      }

      const elapsed = now - lastRef.current;
      if (elapsed >= sampleMs) {
        const nextFps = Math.round((framesRef.current * 1000) / elapsed);
        framesRef.current = 0;
        lastRef.current = now;
        if (mounted) setFps(nextFps);
      }

      rafRef.current = window.requestAnimationFrame(loop);
    };

    rafRef.current = window.requestAnimationFrame(loop);
    return () => {
      mounted = false;
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    };
  }, [sampleMs]);

  return (
    <div
      data-testid="fps-overlay"
      className={[
        'fixed z-[60] pointer-events-none',
        positionClass(position),
        'rounded bg-black/60 text-white',
        'px-2 py-1 text-[11px] font-mono tracking-tight',
        className,
      ].join(' ')}
    >
      FPS: {fps}
    </div>
  );
}

