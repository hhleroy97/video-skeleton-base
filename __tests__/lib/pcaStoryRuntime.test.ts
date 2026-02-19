import {
  applyStateStep,
  clamp01,
  interpolatePointCloudPath,
  interpolatePointPath,
  lerpPointCloud,
  mapPinchDistanceToScrub,
  PCA_INITIAL_CAMERA_POSE,
} from '@/lib/storyboards/pcaStoryRuntime';

describe('pcaStoryRuntime', () => {
  it('clamps values to 0..1', () => {
    expect(clamp01(-2)).toBe(0);
    expect(clamp01(0.2)).toBe(0.2);
    expect(clamp01(5)).toBe(1);
  });

  it('maps pinch distance into scrub range', () => {
    expect(mapPinchDistanceToScrub(0.01, 0.02, 0.12)).toBe(0);
    expect(mapPinchDistanceToScrub(0.07, 0.02, 0.12)).toBeCloseTo(0.5);
    expect(mapPinchDistanceToScrub(0.2, 0.02, 0.12)).toBe(1);
  });

  it('applies bounded step actions', () => {
    expect(applyStateStep(0, 'prev', 10)).toBe(0);
    expect(applyStateStep(0, 'next', 10)).toBe(1);
    expect(applyStateStep(9, 'next', 10)).toBe(9);
  });

  it('linearly interpolates point clouds', () => {
    const a = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 1, z: 1 },
    ];
    const b = [
      { x: 2, y: 2, z: 2 },
      { x: 3, y: 3, z: 3 },
    ];
    const half = lerpPointCloud(a, b, 0.5);

    expect(half[0]).toEqual({ x: 1, y: 1, z: 1 });
    expect(half[1]).toEqual({ x: 2, y: 2, z: 2 });
  });

  it('keeps path interpolation endpoints exact', () => {
    const a = { x: 0, y: 0, z: 0 };
    const b = { x: 1, y: 1, z: 1 };
    expect(interpolatePointPath(a, b, 0, 5)).toEqual(a);
    expect(interpolatePointPath(a, b, 1, 5)).toEqual(b);
  });

  it('interpolates full point cloud along curved paths', () => {
    const a = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 1, z: 1 },
    ];
    const b = [
      { x: 2, y: 2, z: 2 },
      { x: 3, y: 3, z: 3 },
    ];
    const mid = interpolatePointCloudPath(a, b, 0.5);
    expect(mid).toHaveLength(2);
    expect(mid[0].x).toBeGreaterThan(0.8);
    expect(mid[0].x).toBeLessThan(1.2);
    expect(mid[1].z).toBeGreaterThan(1.8);
    expect(mid[1].z).toBeLessThan(2.2);
  });

  it('exports a stable initial camera pose', () => {
    expect(PCA_INITIAL_CAMERA_POSE.position).toEqual({ x: 2.9, y: 1.45, z: 3.3 });
    expect(PCA_INITIAL_CAMERA_POSE.target).toEqual({ x: 0, y: 0, z: 0 });
  });
});

