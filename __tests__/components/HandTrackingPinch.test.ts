import { detectThumbFingerPinch } from '@/components/hand-tracking/HandTracking';

describe('HandTracking pinch helpers', () => {
  it('returns not pinching for missing landmarks', () => {
    expect(detectThumbFingerPinch([], 8, 0.05).isPinching).toBe(false);
  });

  it('detects thumb+middle pinch with a larger threshold', () => {
    const landmarks = new Array(21).fill(0).map(() => ({ x: 0, y: 0, z: 0 }));
    // thumb tip (4) at origin
    landmarks[4] = { x: 0, y: 0, z: 0 };
    // middle tip (12) slightly away
    landmarks[12] = { x: 0.06, y: 0, z: 0 };

    expect(detectThumbFingerPinch(landmarks, 12, 0.065).isPinching).toBe(true);
    expect(detectThumbFingerPinch(landmarks, 12, 0.05).isPinching).toBe(false);
  });
});

