export interface FlowerStrokePoint {
  x: number;
  y: number;
}

export interface FlowerStroke {
  points: FlowerStrokePoint[];
}

export interface StepFlowerPetal extends FlowerStroke {
  layer: number;
  colorIndex: number;
  phaseOffset: number;
}

export interface StepFlowerShape {
  stem: FlowerStroke;
  branches: FlowerStroke[];
  petals: StepFlowerPetal[];
  leaves: FlowerStroke[];
}

export type StepFlowerTemplateId = 'classic' | 'branching';

export interface StepFlowerPalette {
  stemStroke: string;
  leafStroke: string;
  petalStroke: string;
  petalLayerStrokes: string[];
  pollenFill: string;
  glowInner: string;
  glowOuter: string;
  shadowInner: string;
  shadowOuter: string;
  markerSolid: string;
  markerTranslucent: string;
}

export interface StepFlowerVariant {
  id: 'moonlit-iris' | 'sunset-poppy' | 'verdant-dawn' | 'night-orchid';
  name: string;
  template: StepFlowerTemplateId;
  palette: StepFlowerPalette;
}

export interface StepFlowerSprite3D {
  shape: StepFlowerShape;
  variant: StepFlowerVariant;
  depthScale: number;
  blossomRadius: number;
  coreRadius: number;
  shadowRadius: number;
  shadowOffsetY: number;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const seededRandom = (seed: number): (() => number) => {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

const STEP_FLOWER_VARIANTS: StepFlowerVariant[] = [
  {
    id: 'moonlit-iris',
    name: 'Moonlit Iris',
    template: 'classic',
    palette: {
      stemStroke: '#34d399',
      leafStroke: '#86efac',
      petalStroke: '#c4b5fd',
      petalLayerStrokes: ['#a78bfa', '#c4b5fd', '#f5d0fe'],
      pollenFill: '#fde68a',
      glowInner: 'rgba(224, 231, 255, 0.9)',
      glowOuter: 'rgba(129, 140, 248, 0.0)',
      shadowInner: 'rgba(15, 23, 42, 0.34)',
      shadowOuter: 'rgba(15, 23, 42, 0.0)',
      markerSolid: '#818cf8',
      markerTranslucent: 'rgba(129, 140, 248, 0.64)',
    },
  },
  {
    id: 'sunset-poppy',
    name: 'Sunset Poppy',
    template: 'classic',
    palette: {
      stemStroke: '#16a34a',
      leafStroke: '#bbf7d0',
      petalStroke: '#fb7185',
      petalLayerStrokes: ['#ef4444', '#fb7185', '#fdba74'],
      pollenFill: '#fde047',
      glowInner: 'rgba(254, 205, 211, 0.9)',
      glowOuter: 'rgba(251, 113, 133, 0.0)',
      shadowInner: 'rgba(69, 10, 10, 0.28)',
      shadowOuter: 'rgba(69, 10, 10, 0.0)',
      markerSolid: '#f97316',
      markerTranslucent: 'rgba(249, 115, 22, 0.62)',
    },
  },
  {
    id: 'verdant-dawn',
    name: 'Verdant Dawn',
    template: 'branching',
    palette: {
      stemStroke: '#22c55e',
      leafStroke: '#4ade80',
      petalStroke: '#facc15',
      petalLayerStrokes: ['#eab308', '#facc15', '#fef08a'],
      pollenFill: '#fef08a',
      glowInner: 'rgba(254, 249, 195, 0.92)',
      glowOuter: 'rgba(250, 204, 21, 0.0)',
      shadowInner: 'rgba(20, 83, 45, 0.26)',
      shadowOuter: 'rgba(20, 83, 45, 0.0)',
      markerSolid: '#84cc16',
      markerTranslucent: 'rgba(132, 204, 22, 0.58)',
    },
  },
  {
    id: 'night-orchid',
    name: 'Night Orchid',
    template: 'branching',
    palette: {
      stemStroke: '#15803d',
      leafStroke: '#5eead4',
      petalStroke: '#f0abfc',
      petalLayerStrokes: ['#d946ef', '#f0abfc', '#fbcfe8'],
      pollenFill: '#fef9c3',
      glowInner: 'rgba(250, 232, 255, 0.9)',
      glowOuter: 'rgba(217, 70, 239, 0.0)',
      shadowInner: 'rgba(49, 17, 74, 0.3)',
      shadowOuter: 'rgba(49, 17, 74, 0.0)',
      markerSolid: '#d946ef',
      markerTranslucent: 'rgba(217, 70, 239, 0.58)',
    },
  },
];

export function getStepFlowerVariant(seed: number): StepFlowerVariant {
  const idx = Math.abs(Math.floor(seed)) % STEP_FLOWER_VARIANTS.length;
  return STEP_FLOWER_VARIANTS[idx];
}

function sampleQuadratic(
  p0: FlowerStrokePoint,
  p1: FlowerStrokePoint,
  p2: FlowerStrokePoint,
  samples: number
): FlowerStrokePoint[] {
  const count = Math.max(6, samples);
  const points: FlowerStrokePoint[] = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const mt = 1 - t;
    points.push({
      x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
      y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
    });
  }
  return points;
}

function sampleTeardropStroke(
  base: FlowerStrokePoint,
  direction: FlowerStrokePoint,
  sideNormal: FlowerStrokePoint,
  length: number,
  width: number,
  samplesPerSide: number,
  asymmetry = 0,
  waist = 0.52
): FlowerStrokePoint[] {
  const dirLen = Math.hypot(direction.x, direction.y) || 1;
  const dx = direction.x / dirLen;
  const dy = direction.y / dirLen;
  const nx = sideNormal.x;
  const ny = sideNormal.y;

  const tip: FlowerStrokePoint = {
    x: base.x + dx * length,
    y: base.y + dy * length,
  };

  const leftWidth = width * (1 + asymmetry);
  const rightWidth = width * (1 - asymmetry);
  const waistT = Math.max(0.35, Math.min(0.72, waist));

  const leftCtrl: FlowerStrokePoint = {
    x: base.x + dx * length * waistT + nx * leftWidth,
    y: base.y + dy * length * waistT + ny * leftWidth,
  };
  const rightCtrl: FlowerStrokePoint = {
    x: base.x + dx * length * waistT - nx * rightWidth,
    y: base.y + dy * length * waistT - ny * rightWidth,
  };

  const leftSide = sampleQuadratic(base, leftCtrl, tip, samplesPerSide);
  const rightSide = sampleQuadratic(tip, rightCtrl, base, samplesPerSide);

  return [...leftSide, ...rightSide.slice(1)];
}

function samplePointOnStroke(points: FlowerStrokePoint[], t: number): FlowerStrokePoint {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];
  const clamped = clamp01(t);
  const f = clamped * (points.length - 1);
  const i = Math.floor(f);
  const j = Math.min(points.length - 1, i + 1);
  const local = f - i;
  return {
    x: points[i].x + (points[j].x - points[i].x) * local,
    y: points[i].y + (points[j].y - points[i].y) * local,
  };
}

export function generateStepFlowerShape(
  seed: number,
  growth: number,
  markerScale: number
): StepFlowerShape {
  const rand = seededRandom(seed);
  const g = clamp01(growth);
  const variant = getStepFlowerVariant(seed);
  const stemHeightBase =
    variant.template === 'branching' ? 19 + markerScale * 21 : 16 + markerScale * 18;
  const stemHeight = stemHeightBase * (0.18 + g * 0.82);
  const tipY = -stemHeight;

  const stemCurve =
    variant.template === 'branching'
      ? sampleQuadratic(
          { x: 0, y: 0 },
          { x: (rand() - 0.5) * 8, y: tipY * 0.56 },
          { x: (rand() - 0.5) * 6, y: tipY },
          20
        )
      : sampleQuadratic(
          { x: 0, y: 0 },
          { x: (rand() - 0.5) * 6, y: tipY * 0.5 },
          { x: (rand() - 0.5) * 4, y: tipY },
          16
        );
  const stem: FlowerStroke = { points: stemCurve };
  const branches: FlowerStroke[] = [];

  const petals: StepFlowerPetal[] = [];
  const petalCount =
    variant.template === 'branching' ? 7 + Math.floor(rand() * 4) : 5 + Math.floor(rand() * 4);
  const petalGrowth = Math.max(0, (g - 0.25) / 0.75);
  const petalLengthBase =
    variant.template === 'branching' ? 5 + markerScale * 5.2 : 6 + markerScale * 6;
  const petalLength = petalLengthBase * petalGrowth;
  const petalWidth = petalLength * (variant.template === 'branching' ? 0.26 : 0.3);
  const petalTilt = variant.template === 'branching' ? -0.44 : -0.36;
  const petalLayerCount = variant.template === 'branching' ? (rand() > 0.45 ? 3 : 2) : 2;
  const petalLayerGap = (0.45 + markerScale * 0.25) * (0.25 + petalGrowth * 0.75);
  const mainBudProfile = {
    length: petalLength * (0.72 + rand() * 0.6),
    width: petalWidth * (0.68 + rand() * 0.72),
    tilt: petalTilt + (rand() - 0.5) * 0.22,
    asymmetry: (rand() - 0.5) * 0.5,
    waist: 0.42 + rand() * 0.22,
    phase: rand() * Math.PI * 2,
  };
  const baseColorShift = Math.floor(rand() * Math.max(1, variant.palette.petalLayerStrokes.length));
  for (let layer = 0; layer < petalLayerCount; layer++) {
    const layerScale = Math.max(0.45, 1 - layer * 0.18);
    const layerPhase =
      mainBudProfile.phase + layer * (Math.PI / Math.max(3, petalCount + (layer % 2 === 0 ? 1 : 2)));
    const layerBase = { x: 0, y: tipY - layer * petalLayerGap };
    const layerColorIndex = (baseColorShift + layer) % Math.max(1, variant.palette.petalLayerStrokes.length);
    for (let i = 0; i < petalCount; i++) {
      const angle = (i / petalCount) * Math.PI * 2 + layerPhase;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const dir = {
        x: dx,
        y: dy + mainBudProfile.tilt + layer * 0.03,
      };
      const nLen = Math.hypot(-dir.y, dir.x) || 1;
      const normal = { x: -dir.y / nLen, y: dir.x / nLen };
      const curve = sampleTeardropStroke(
        layerBase,
        dir,
        normal,
        mainBudProfile.length * layerScale,
        mainBudProfile.width * Math.max(0.5, 1 - layer * 0.12),
        8,
        mainBudProfile.asymmetry,
        mainBudProfile.waist
      );
      petals.push({
        points: curve,
        layer,
        colorIndex: layerColorIndex,
        phaseOffset: layerPhase,
      });
    }
  }

  const leaves: FlowerStroke[] = [];
  const leafGrowth = Math.max(0, (g - 0.12) / 0.88);
  const leafLength = (7 + markerScale * (variant.template === 'branching' ? 6.5 : 5)) * leafGrowth;
  const leafPositions = variant.template === 'branching' ? [0.28, 0.47, 0.68] : [0.38, 0.62];
  for (const leafT of leafPositions) {
    const y = tipY * leafT;
    const side = rand() > 0.5 ? 1 : -1;
    const localLeafLength = leafLength * (0.72 + rand() * 0.62);
    const localLeafWidth = localLeafLength * (variant.template === 'branching' ? 0.16 : 0.14) * (0.75 + rand() * 0.65);
    const localLeafAsymmetry = (rand() - 0.5) * 0.45;
    const localLeafWaist = 0.42 + rand() * 0.28;
    const leafDir = {
      x: side * (0.62 + rand() * 0.4),
      y: -(0.68 + rand() * 0.32),
    };
    const nLen = Math.hypot(-leafDir.y, leafDir.x) || 1;
    const normal = { x: -leafDir.y / nLen, y: leafDir.x / nLen };
    const leaf = sampleTeardropStroke(
      { x: 0, y },
      leafDir,
      normal,
      localLeafLength,
      localLeafWidth,
      8,
      localLeafAsymmetry,
      localLeafWaist
    );
    leaves.push({ points: leaf });
  }

  const branchCount =
    variant.template === 'branching' ? 2 + Math.floor(rand() * 4) : Math.floor(rand() * 2);
  for (let i = 0; i < branchCount; i++) {
    const anchorT = 0.22 + rand() * 0.58;
    const branchBase = samplePointOnStroke(stemCurve, anchorT);
    const side = rand() > 0.5 ? 1 : -1;
    const branchLength = (4.5 + markerScale * 5.8) * (0.2 + g * 0.8) * (0.75 + rand() * 0.5);
    const branchTilt = 0.28 + rand() * 0.38;
    const branchDir = {
      x: side * (0.68 + rand() * 0.36),
      y: -branchTilt,
    };
    const branchCurve = sampleQuadratic(
      branchBase,
      {
        x: branchBase.x + branchDir.x * branchLength * 0.56,
        y: branchBase.y + branchDir.y * branchLength * 0.56,
      },
      {
        x: branchBase.x + branchDir.x * branchLength,
        y: branchBase.y + branchDir.y * branchLength,
      },
      12
    );
    branches.push({ points: branchCurve });

    const branchTip = branchCurve[branchCurve.length - 1];
    const branchLen = Math.hypot(branchDir.x, branchDir.y) || 1;
    const bdx = branchDir.x / branchLen;
    const bdy = branchDir.y / branchLen;
    const bnormal = { x: -bdy, y: bdx };
    const outcomeRoll = rand();

    // Branch tip can become blossom cluster, leaf, or a bare ending.
    if (outcomeRoll < 0.45) {
      const branchPetalCount = 2 + Math.floor(rand() * 3);
      const branchBudProfile = {
        length: branchLength * (0.28 + rand() * 0.2),
        width: branchLength * (0.08 + rand() * 0.08),
        tilt: -0.06 + (rand() - 0.5) * 0.18,
        asymmetry: (rand() - 0.5) * 0.35,
        waist: 0.44 + rand() * 0.2,
      };
      for (let p = 0; p < branchPetalCount; p++) {
        const spread = (p - (branchPetalCount - 1) / 2) * 0.5;
        const dir = {
          x: bdx + bnormal.x * spread,
          y: bdy + bnormal.y * spread + branchBudProfile.tilt,
        };
        const nLen = Math.hypot(-dir.y, dir.x) || 1;
        petals.push({
          points: sampleTeardropStroke(
            branchTip,
            dir,
            { x: -dir.y / nLen, y: dir.x / nLen },
            branchBudProfile.length,
            branchBudProfile.width,
            8,
            branchBudProfile.asymmetry,
            branchBudProfile.waist
          ),
          layer: 0,
          colorIndex: (baseColorShift + 1) % Math.max(1, variant.palette.petalLayerStrokes.length),
          phaseOffset: spread,
        });
      }
    } else if (outcomeRoll < 0.8) {
      const leafDir = {
        x: bdx + (rand() - 0.5) * 0.3,
        y: bdy - 0.05,
      };
      const nLen = Math.hypot(-leafDir.y, leafDir.x) || 1;
      leaves.push({
        points: sampleTeardropStroke(
          branchTip,
          leafDir,
          { x: -leafDir.y / nLen, y: leafDir.x / nLen },
          branchLength * (0.34 + rand() * 0.2),
          branchLength * 0.1,
          8
        ),
      });
    }
  }

  return { stem, branches, petals, leaves };
}

export function generateStepFlowerSprite3D(
  seed: number,
  growth: number,
  markerScale: number
): StepFlowerSprite3D {
  const rand = seededRandom(seed ^ 0x9e3779b9);
  const g = clamp01(growth);
  const variant = getStepFlowerVariant(seed);
  const shape = generateStepFlowerShape(seed, growth, markerScale);
  const depthScale = 0.85 + rand() * 0.45;
  const blossomRadius = (4 + markerScale * 5.5) * (0.2 + g * 0.8) * depthScale;
  const coreRadius = blossomRadius * (0.22 + rand() * 0.12);
  const shadowRadius = blossomRadius * (0.85 + rand() * 0.35);
  const shadowOffsetY = 2 + markerScale * 1.5 + rand() * 3;

  return {
    shape,
    variant,
    depthScale,
    blossomRadius,
    coreRadius,
    shadowRadius,
    shadowOffsetY,
  };
}
