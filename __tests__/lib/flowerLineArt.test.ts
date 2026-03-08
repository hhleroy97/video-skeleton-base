import { buildLSystem, generateFlowerLineArt } from '@/lib/flowerLineArt';

describe('flowerLineArt', () => {
  it('builds bounded L-system strings', () => {
    const s1 = buildLSystem(1);
    const s5 = buildLSystem(9);
    expect(s1.length).toBeGreaterThan(0);
    expect(s5.length).toBeGreaterThan(s1.length);
  });

  it('is deterministic for the same seed', () => {
    const a = generateFlowerLineArt(42);
    const b = generateFlowerLineArt(42);
    expect(a.branches.length).toBe(b.branches.length);
    expect(a.branches[0].points.length).toBe(b.branches[0].points.length);
    expect(a.blossoms.length).toBe(b.blossoms.length);
    expect(a.blossoms[0].curves.length).toBe(b.blossoms[0].curves.length);
    expect(a.leaves.length).toBe(b.leaves.length);
    expect(a.maxHeight).toBeCloseTo(b.maxHeight, 6);
    expect(a.blossoms[0].center.x).toBeCloseTo(b.blossoms[0].center.x, 6);
  });

  it('varies geometry for different seeds', () => {
    const a = generateFlowerLineArt(42);
    const b = generateFlowerLineArt(1337);
    expect(a.blossoms[0].center.x).not.toBeCloseTo(b.blossoms[0].center.x, 6);
    expect(a.blossoms.length).toBeGreaterThan(1);
    expect(b.blossoms.length).toBeGreaterThan(1);
    expect(a.leaves.length).toBeGreaterThan(0);
    expect(b.leaves.length).toBeGreaterThan(0);
  });

  it('produces sampled Bezier petal curves', () => {
    const variant = generateFlowerLineArt(77);
    expect(variant.blossoms.length).toBeGreaterThan(1);
    expect(variant.blossoms[0].curves.length).toBeGreaterThan(0);
    expect(variant.blossoms[0].curves[0].points.length).toBeGreaterThan(10);
    expect(variant.leaves[0].points.length).toBeGreaterThan(8);
  });
});
