import { normalizeTrimWindow, resolvePlaybackBoundary } from '@/lib/videoTrim';

describe('videoTrim helpers', () => {
  it('normalizes trim window inside duration bounds', () => {
    expect(normalizeTrimWindow(-4, 200, 90)).toEqual({ start: 0, end: 90 });
  });

  it('enforces a minimum trim span', () => {
    const trim = normalizeTrimWindow(10, 10.01, 40);
    expect(trim.end - trim.start).toBeCloseTo(0.1, 6);
  });

  it('loops back to trim start when boundary is reached', () => {
    const resolution = resolvePlaybackBoundary(12, { start: 3, end: 12 }, true);
    expect(resolution).toEqual({ nextTime: 3, shouldPause: false });
  });

  it('pauses at trim end when looping is disabled', () => {
    const resolution = resolvePlaybackBoundary(8, { start: 2, end: 8 }, false);
    expect(resolution).toEqual({ nextTime: 8, shouldPause: true });
  });
});

