import { generateStepFlowerShape, generateStepFlowerSprite3D, getStepFlowerVariant } from '@/lib/stepFlowerAsset';

describe('stepFlowerAsset', () => {
  it('returns deterministic flower strokes for same seed', () => {
    const a = generateStepFlowerShape(101, 0.7, 1.4);
    const b = generateStepFlowerShape(101, 0.7, 1.4);
    expect(a.stem.points.length).toBe(b.stem.points.length);
    expect(a.branches.length).toBe(b.branches.length);
    expect(a.petals.length).toBe(b.petals.length);
    expect(a.leaves.length).toBe(b.leaves.length);
    expect(a.stem.points[3].x).toBeCloseTo(b.stem.points[3].x, 6);
    expect(a.petals[0].points[5].y).toBeCloseTo(b.petals[0].points[5].y, 6);
  });

  it('grows petal reach with progress', () => {
    const early = generateStepFlowerShape(55, 0.2, 1);
    const late = generateStepFlowerShape(55, 0.95, 1);
    const earlySpread = Math.max(...early.petals[0].points.map((p) => Math.abs(p.x)));
    const lateSpread = Math.max(...late.petals[0].points.map((p) => Math.abs(p.x)));
    expect(lateSpread).toBeGreaterThan(earlySpread);
  });

  it('builds petals as outward teardrop contours', () => {
    const shape = generateStepFlowerShape(808, 0.9, 1.1);
    const petal = shape.petals[0];
    const first = petal.points[0];
    const last = petal.points[petal.points.length - 1];
    const tip = petal.points[Math.floor(petal.points.length / 2)];
    expect(first.x).toBeCloseTo(last.x, 3);
    expect(first.y).toBeCloseTo(last.y, 3);
    expect(Math.abs(tip.x - first.x) + Math.abs(tip.y - first.y)).toBeGreaterThan(0.5);
  });

  it('keeps petal shape/size consistent within a single bud', () => {
    const shape = generateStepFlowerShape(4242, 0.9, 1.2);
    const mainLayer = shape.petals.filter((petal) => petal.layer === 0).slice(0, 5);
    const mainBudPetals = mainLayer.length >= 5 ? mainLayer : shape.petals.slice(0, 5);
    const petalSpans = mainBudPetals.map((petal) => {
      const first = petal.points[0];
      const last = petal.points[petal.points.length - 1];
      const tip = petal.points[Math.floor(petal.points.length / 2)];
      const baseX = (first.x + last.x) * 0.5;
      const baseY = (first.y + last.y) * 0.5;
      return Math.hypot(tip.x - baseX, tip.y - baseY);
    });
    const maxSpan = Math.max(...petalSpans);
    const minSpan = Math.min(...petalSpans);
    expect(maxSpan - minSpan).toBeLessThan(0.05);
  });

  it('creates multi-layer main petals with height and color variation', () => {
    const shape = generateStepFlowerShape(5151, 0.95, 1.25);
    const layers = new Set(shape.petals.map((petal) => petal.layer));
    expect(layers.size).toBeGreaterThanOrEqual(2);

    const layerBases = new Map<number, number[]>();
    for (const petal of shape.petals) {
      const arr = layerBases.get(petal.layer) ?? [];
      arr.push(petal.points[0].y);
      layerBases.set(petal.layer, arr);
    }
    const orderedLayerYs = Array.from(layerBases.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, ys]) => ys.reduce((sum, y) => sum + y, 0) / ys.length);
    for (let i = 1; i < orderedLayerYs.length; i++) {
      expect(orderedLayerYs[i]).toBeLessThan(orderedLayerYs[i - 1]);
    }

    const colorSet = new Set(shape.petals.map((petal) => petal.colorIndex));
    expect(colorSet.size).toBeGreaterThanOrEqual(2);
  });

  it('keeps main bloom petals ring-complete without large angular gaps', () => {
    const shape = generateStepFlowerShape(9090, 0.92, 1.3);
    const clusters = new Map<string, { x: number; y: number; petals: typeof shape.petals }>();
    for (const petal of shape.petals) {
      const base = petal.points[0];
      const key = `${base.x.toFixed(3)}:${base.y.toFixed(3)}`;
      const existing = clusters.get(key);
      if (existing) {
        existing.petals.push(petal);
      } else {
        clusters.set(key, { x: base.x, y: base.y, petals: [petal] });
      }
    }
    const dominant = Array.from(clusters.values()).sort((a, b) => b.petals.length - a.petals.length)[0];
    const mainBudPetals = dominant?.petals ?? [];
    expect(mainBudPetals.length).toBeGreaterThanOrEqual(5);
    const centerX = dominant?.x ?? 0;
    const centerY = dominant?.y ?? 0;
    const angles = mainBudPetals
      .map((petal) => {
        const tip = petal.points[Math.floor(petal.points.length / 2)];
        return Math.atan2(tip.y - centerY, tip.x - centerX);
      })
      .sort((a, b) => a - b);
    const gaps = angles.map((angle, i) => {
      const next = i === angles.length - 1 ? angles[0] + Math.PI * 2 : angles[i + 1];
      return next - angle;
    });
    const avgGap = (Math.PI * 2) / angles.length;
    const maxGap = Math.max(...gaps);
    expect(maxGap).toBeLessThan(avgGap * 2.1);
  });

  it('creates leaf strokes attached to stem', () => {
    const shape = generateStepFlowerShape(333, 0.8, 1.2);
    expect(shape.leaves.length).toBeGreaterThan(0);
    expect(shape.leaves[0].points[0].x).toBeCloseTo(0, 1);
  });

  it('builds leaves as teardrop contours', () => {
    const shape = generateStepFlowerShape(1201, 0.85, 1.15);
    const leaf = shape.leaves[0];
    const first = leaf.points[0];
    const last = leaf.points[leaf.points.length - 1];
    expect(first.x).toBeCloseTo(last.x, 3);
    expect(first.y).toBeCloseTo(last.y, 3);
  });

  it('introduces shape variation across leaves', () => {
    const shape = generateStepFlowerShape(7021, 0.9, 1.2);
    const leafSpans = shape.leaves.map((leaf) => {
      const first = leaf.points[0];
      const last = leaf.points[leaf.points.length - 1];
      const tip = leaf.points[Math.floor(leaf.points.length / 2)];
      const baseX = (first.x + last.x) * 0.5;
      const baseY = (first.y + last.y) * 0.5;
      return Math.hypot(tip.x - baseX, tip.y - baseY);
    });
    const maxSpan = Math.max(...leafSpans);
    const minSpan = Math.min(...leafSpans);
    expect(maxSpan - minSpan).toBeGreaterThan(0.12);
  });

  it('builds deterministic pseudo-3d sprite envelope', () => {
    const a = generateStepFlowerSprite3D(77, 0.9, 1.4);
    const b = generateStepFlowerSprite3D(77, 0.9, 1.4);
    expect(a.depthScale).toBeCloseTo(b.depthScale, 6);
    expect(a.blossomRadius).toBeCloseTo(b.blossomRadius, 6);
    expect(a.shadowRadius).toBeCloseTo(b.shadowRadius, 6);
    expect(a.shape.petals.length).toBeGreaterThan(0);
    expect(a.variant.id).toBe(b.variant.id);
    expect(a.variant.palette.petalStroke).toBeTruthy();
  });

  it('exposes deterministic variant palettes', () => {
    const a = getStepFlowerVariant(2048);
    const b = getStepFlowerVariant(2048);
    const c = getStepFlowerVariant(2049);
    expect(a.id).toBe(b.id);
    expect(a.palette.markerSolid).toBeTruthy();
    expect([a.id, b.id].includes(c.id)).toBe(false);
  });

  it('keeps stem palettes green-leaning', () => {
    const parseHex = (hex: string) => {
      const clean = hex.replace('#', '');
      const expanded =
        clean.length === 3
          ? `${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`
          : clean;
      return {
        r: parseInt(expanded.slice(0, 2), 16),
        g: parseInt(expanded.slice(2, 4), 16),
        b: parseInt(expanded.slice(4, 6), 16),
      };
    };
    for (let seed = 0; seed < 8; seed++) {
      const stem = parseHex(getStepFlowerVariant(seed).palette.stemStroke);
      expect(stem.g).toBeGreaterThanOrEqual(stem.b);
      expect(stem.g).toBeGreaterThanOrEqual(stem.r * 0.6);
    }
  });

  it('uses multiple growth templates across seeds', () => {
    const classic = getStepFlowerVariant(0);
    const branchingSeed = Array.from({ length: 32 }, (_, i) => i).find(
      (seed) => getStepFlowerVariant(seed).template === 'branching'
    );
    expect(classic.template).toBeTruthy();
    expect(branchingSeed).toBeDefined();
    if (branchingSeed === undefined) {
      return;
    }
    const classicShape = generateStepFlowerShape(0, 0.85, 1.1);
    const branchingShape = generateStepFlowerShape(branchingSeed, 0.85, 1.1);
    expect(branchingShape.branches.length).toBeGreaterThan(0);
    expect(branchingShape.leaves.length).toBeGreaterThanOrEqual(classicShape.leaves.length);
  });

  it('adds varied branch endings (petal/leaf/bare) across generated seeds', () => {
    const shapes = Array.from({ length: 40 }, (_, i) => generateStepFlowerShape(5000 + i, 0.92, 1.2));
    const hasRichPetalBranch = shapes.some((shape) => shape.branches.length > 0 && shape.petals.length >= 9);
    const hasRichLeafBranch = shapes.some((shape) => shape.branches.length > 0 && shape.leaves.length >= 4);
    const hasBareEnding = shapes.some((shape) => shape.branches.length >= 2 && shape.leaves.length <= 3);
    expect(hasRichPetalBranch).toBe(true);
    expect(hasRichLeafBranch).toBe(true);
    expect(hasBareEnding).toBe(true);
  });
});
