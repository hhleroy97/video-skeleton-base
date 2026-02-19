export interface TrimWindow {
  start: number;
  end: number;
}

export interface BoundaryResolution {
  nextTime: number;
  shouldPause: boolean;
}

const MIN_TRIM_SPAN_SECONDS = 0.1;

export function normalizeTrimWindow(start: number, end: number, duration: number): TrimWindow {
  const safeDuration = Math.max(0, duration);
  const clampedStart = Math.min(Math.max(0, start), safeDuration);
  const clampedEnd = Math.min(Math.max(0, end), safeDuration);

  if (safeDuration === 0) {
    return { start: 0, end: 0 };
  }

  if (clampedEnd - clampedStart >= MIN_TRIM_SPAN_SECONDS) {
    return { start: clampedStart, end: clampedEnd };
  }

  const adjustedEnd = Math.min(safeDuration, clampedStart + MIN_TRIM_SPAN_SECONDS);
  const adjustedStart = Math.max(0, adjustedEnd - MIN_TRIM_SPAN_SECONDS);
  return { start: adjustedStart, end: adjustedEnd };
}

export function resolvePlaybackBoundary(
  currentTime: number,
  trim: TrimWindow,
  shouldLoop: boolean
): BoundaryResolution {
  if (trim.end <= trim.start) {
    return { nextTime: trim.start, shouldPause: true };
  }

  if (currentTime < trim.start) {
    return { nextTime: trim.start, shouldPause: false };
  }

  if (currentTime >= trim.end) {
    if (shouldLoop) {
      return { nextTime: trim.start, shouldPause: false };
    }
    return { nextTime: trim.end, shouldPause: true };
  }

  return { nextTime: currentTime, shouldPause: false };
}

