import { getFlowerLifecycleState } from '@/lib/flowerLifecycle';

describe('flowerLifecycle', () => {
  it('clamps out-of-range timeline values', () => {
    const low = getFlowerLifecycleState(-2);
    const high = getFlowerLifecycleState(3);

    expect(low.t).toBe(0);
    expect(high.t).toBe(1);
  });

  it('is monotonic for growth during grow phase', () => {
    const early = getFlowerLifecycleState(0.05);
    const mid = getFlowerLifecycleState(0.2);
    const late = getFlowerLifecycleState(0.4);

    expect(early.phase).toBe('grow');
    expect(mid.phase).toBe('grow');
    expect(late.phase).toBe('grow');
    expect(early.growth).toBeLessThan(mid.growth);
    expect(mid.growth).toBeLessThan(late.growth);
  });

  it('starts wilt behavior after bloom phase', () => {
    const bloomEdge = getFlowerLifecycleState(0.7);
    const wiltMid = getFlowerLifecycleState(0.85);

    expect(bloomEdge.phase).toBe('bloom');
    expect(wiltMid.phase).toBe('wilt');
    expect(wiltMid.stemDroop).toBeGreaterThan(bloomEdge.stemDroop);
    expect(wiltMid.desaturation).toBeGreaterThan(bloomEdge.desaturation);
    expect(wiltMid.bloomOpen).toBeLessThan(bloomEdge.bloomOpen);
  });

  it('returns stable endpoints for start and end of lifecycle', () => {
    const start = getFlowerLifecycleState(0);
    const end = getFlowerLifecycleState(1);

    expect(start.phase).toBe('grow');
    expect(start.growth).toBeGreaterThan(0);
    expect(start.stemDroop).toBe(0);

    expect(end.phase).toBe('wilt');
    expect(end.desaturation).toBeGreaterThan(0.85);
    expect(end.stemDroop).toBeGreaterThan(0.85);
    expect(end.bloomOpen).toBeLessThan(0.25);
  });
});
