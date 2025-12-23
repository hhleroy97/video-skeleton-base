import { fillTrailSegments } from '@/components/hand-tracking/trailMath';

describe('fillTrailSegments', () => {
  test('fills segment buffer for one particle', () => {
    const particleCount = 1;
    const trailLength = 3; // points 0,1,2 => segments: (0->1), (1->2)

    // Newest at index 0: p0 = (0,0,0), then (1,0,0), then (2,0,0)
    const trailHistory = new Float32Array([
      0, 0, 0,
      1, 0, 0,
      2, 0, 0,
    ]);

    const out = new Float32Array(particleCount * (trailLength - 1) * 2 * 3);
    fillTrailSegments({ trailHistory, particleCount, trailLength, outSegments: out });

    expect(Array.from(out)).toEqual([
      // seg0: 0->1
      0, 0, 0, 1, 0, 0,
      // seg1: 1->2
      1, 0, 0, 2, 0, 0,
    ]);
  });

  test('fills segment buffer for two particles', () => {
    const particleCount = 2;
    const trailLength = 2; // one segment per particle
    const trailHistory = new Float32Array([
      // p0 newest, older
      0, 0, 0, 1, 0, 0,
      // p1 newest, older
      0, 1, 0, 1, 1, 0,
    ]);

    const out = new Float32Array(particleCount * (trailLength - 1) * 2 * 3);
    fillTrailSegments({ trailHistory, particleCount, trailLength, outSegments: out });

    expect(Array.from(out)).toEqual([
      // p0 seg: (0,0,0)->(1,0,0)
      0, 0, 0, 1, 0, 0,
      // p1 seg: (0,1,0)->(1,1,0)
      0, 1, 0, 1, 1, 0,
    ]);
  });
});


