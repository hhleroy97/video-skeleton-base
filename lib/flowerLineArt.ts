export interface LineArtPoint {
  x: number;
  y: number;
  z: number;
}

export interface LineArtSegment {
  a: LineArtPoint;
  b: LineArtPoint;
}

export interface FlowerLineArtVariant {
  seed: number;
  branches: BranchPath[];
  blossoms: BlossomCluster[];
  leaves: LeafCurve[];
  maxHeight: number;
}

export interface BranchPath {
  id: number;
  depth: number;
  points: LineArtPoint[];
}

export interface BlossomCurve {
  center: LineArtPoint;
  points: LineArtPoint[];
}

export interface BlossomCluster {
  center: LineArtPoint;
  curves: BlossomCurve[];
}

export interface LeafCurve {
  center: LineArtPoint;
  points: LineArtPoint[];
}

interface TurtleState {
  x: number;
  y: number;
  heading: number;
  step: number;
}

interface StackState extends TurtleState {
  branchId: number;
}

interface TipCandidate extends LineArtPoint {
  depth: number;
}

export function createSeededRandom(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildLSystem(iterations: number): string {
  let system = 'X';
  const safeIterations = Math.max(1, Math.min(5, iterations));

  for (let i = 0; i < safeIterations; i++) {
    let next = '';
    for (const char of system) {
      if (char === 'X') {
        next += 'F-[[X]+X]+F[+FX]-X';
      } else if (char === 'F') {
        next += 'FF';
      } else {
        next += char;
      }
    }
    system = next;
  }

  return system;
}

function sampleCubicBezier(
  p0: LineArtPoint,
  p1: LineArtPoint,
  p2: LineArtPoint,
  p3: LineArtPoint,
  samples: number
): LineArtPoint[] {
  const safeSamples = Math.max(6, samples);
  const points: LineArtPoint[] = [];
  for (let i = 0; i <= safeSamples; i++) {
    const t = i / safeSamples;
    const mt = 1 - t;
    const x =
      mt * mt * mt * p0.x +
      3 * mt * mt * t * p1.x +
      3 * mt * t * t * p2.x +
      t * t * t * p3.x;
    const y =
      mt * mt * mt * p0.y +
      3 * mt * mt * t * p1.y +
      3 * mt * t * t * p2.y +
      t * t * t * p3.y;
    const z =
      mt * mt * mt * p0.z +
      3 * mt * mt * t * p1.z +
      3 * mt * t * t * p2.z +
      t * t * t * p3.z;
    points.push({ x, y, z });
  }
  return points;
}

export function generateFlowerLineArt(seed: number, iterations = 3): FlowerLineArtVariant {
  const rand = createSeededRandom(seed);
  const system = buildLSystem(iterations);
  const angle = (16 + rand() * 14) * (Math.PI / 180);
  const branchDecay = 0.72 + rand() * 0.1;
  const jitter = 0.01 + rand() * 0.03;
  const initialStep = 0.075 + rand() * 0.02;

  const turtle: TurtleState = {
    x: 0,
    y: 0,
    heading: Math.PI / 2,
    step: initialStep,
  };
  const stack: StackState[] = [];
  const branches: BranchPath[] = [{ id: 0, depth: 0, points: [{ x: 0, y: 0, z: 0 }] }];
  let currentBranchId = 0;
  const tipCandidates: TipCandidate[] = [];
  let maxHeight = 0;

  for (const char of system) {
    if (char === 'F') {
      const nx = turtle.x + Math.cos(turtle.heading) * turtle.step;
      const ny = turtle.y + Math.sin(turtle.heading) * turtle.step;
      const p = { x: nx, y: ny, z: (rand() - 0.5) * jitter };
      branches[currentBranchId].points.push(p);
      turtle.x = nx;
      turtle.y = ny;
      maxHeight = Math.max(maxHeight, ny);
      turtle.step *= 0.996;
    } else if (char === '+') {
      turtle.heading += angle * (0.8 + rand() * 0.35);
    } else if (char === '-') {
      turtle.heading -= angle * (0.8 + rand() * 0.35);
    } else if (char === '[') {
      stack.push({ ...turtle, branchId: currentBranchId });
      const parent = branches[currentBranchId];
      const child: BranchPath = {
        id: branches.length,
        depth: parent.depth + 1,
        points: [{ x: turtle.x, y: turtle.y, z: (rand() - 0.5) * jitter * 0.4 }],
      };
      branches.push(child);
      currentBranchId = child.id;
      turtle.step *= branchDecay;
    } else if (char === ']') {
      tipCandidates.push({
        x: turtle.x,
        y: turtle.y,
        z: (rand() - 0.5) * jitter,
        depth: branches[currentBranchId].depth,
      });
      const pop = stack.pop();
      if (pop) {
        turtle.x = pop.x;
        turtle.y = pop.y;
        turtle.heading = pop.heading;
        turtle.step = pop.step;
        currentBranchId = pop.branchId;
      }
    }
  }

  tipCandidates.push({
    x: turtle.x,
    y: turtle.y,
    z: (rand() - 0.5) * jitter,
    depth: branches[currentBranchId].depth,
  });
  const sortedTips = tipCandidates
    .sort((a, b) => b.y - a.y)
    .filter((tip, idx, arr) => {
      const duplicate = arr.slice(0, idx).some((p) => Math.hypot(p.x - tip.x, p.y - tip.y, p.z - tip.z) < 0.06);
      return !duplicate;
    });
  const blossomCount = Math.max(2, Math.min(5, 2 + Math.floor(rand() * 4)));
  const selectedTips = sortedTips.slice(0, blossomCount);
  if (selectedTips.length === 0) {
    selectedTips.push({ x: 0, y: maxHeight + 0.03, z: 0, depth: 0 });
  }

  const blossoms: BlossomCluster[] = selectedTips.map((tip) => {
    // Keep blossom centers on real branch tips so petals stay visually connected.
    const center: LineArtPoint = { x: tip.x, y: tip.y, z: tip.z };
    const curves: BlossomCurve[] = [];
    const petalCount = 4 + Math.floor(rand() * 4) + Math.max(0, 2 - tip.depth);
    const petalLength = 0.1 + rand() * 0.08 + Math.max(0, 0.03 - tip.depth * 0.006);
    const petalLift = 0.06 + rand() * 0.06;

    for (let i = 0; i < petalCount; i++) {
      const a = (i / petalCount) * Math.PI * 2 + rand() * 0.2;
      const radius = 0.012 + rand() * 0.02;
      const dirX = Math.cos(a);
      const dirZ = Math.sin(a);

      const p0 = { ...center };
      const p1 = {
        x: center.x + dirX * radius,
        y: center.y + petalLift * 0.55,
        z: center.z + dirZ * radius,
      };
      const p2 = {
        x: center.x + dirX * (petalLength * 0.72),
        y: center.y + petalLift,
        z: center.z + dirZ * (petalLength * 0.72),
      };
      const p3 = {
        x: center.x + dirX * petalLength,
        y: center.y + petalLift * 0.38,
        z: center.z + dirZ * petalLength,
      };

      const leftCurve = sampleCubicBezier(p0, p1, p2, p3, 12);
      const rightCurve = sampleCubicBezier(
        p0,
        { x: p1.x * 0.95, y: p1.y, z: p1.z * 0.95 },
        { x: p2.x * 0.82, y: p2.y - 0.01, z: p2.z * 0.82 },
        { x: p3.x * 0.9, y: p3.y - 0.02, z: p3.z * 0.9 },
        12
      );

      curves.push({ center, points: leftCurve }, { center, points: rightCurve });
    }

    return { center, curves };
  });

  const leaves: LeafCurve[] = [];
  const leafBranches = branches.filter((branch) => branch.depth <= 2 && branch.points.length > 3);
  for (const branch of leafBranches) {
    const branchLeafCount = Math.max(0, Math.min(2, Math.floor(rand() * 3) - (branch.depth > 0 ? 0 : 1)));
    for (let i = 0; i < branchLeafCount; i++) {
      const idx = Math.max(1, Math.min(branch.points.length - 2, Math.floor((0.35 + rand() * 0.45) * branch.points.length)));
      const center = branch.points[idx];
      const next = branch.points[idx + 1] ?? center;
      const tangentX = next.x - center.x;
      const tangentY = next.y - center.y;
      const tangentLen = Math.max(1e-6, Math.hypot(tangentX, tangentY));
      const nx = -(tangentY / tangentLen);
      const ny = tangentX / tangentLen;
      const side = rand() > 0.5 ? 1 : -1;
      const length = 0.08 + rand() * 0.08;
      const width = 0.03 + rand() * 0.03;

      const p0 = { ...center };
      const p1 = {
        x: center.x + nx * side * width * 0.7,
        y: center.y + ny * side * width * 0.7 + length * 0.4,
        z: center.z + (rand() - 0.5) * jitter,
      };
      const p2 = {
        x: center.x + nx * side * width,
        y: center.y + ny * side * width + length * 0.85,
        z: center.z + (rand() - 0.5) * jitter,
      };
      const p3 = {
        x: center.x + nx * side * width * 0.2,
        y: center.y + ny * side * width * 0.2 + length,
        z: center.z + (rand() - 0.5) * jitter,
      };

      const left = sampleCubicBezier(p0, p1, p2, p3, 10);
      const right = sampleCubicBezier(
        p0,
        { x: p1.x * 0.96, y: p1.y * 0.995, z: p1.z * 0.96 },
        { x: p2.x * 0.84, y: p2.y * 0.99, z: p2.z * 0.84 },
        { x: p3.x * 0.9, y: p3.y * 0.985, z: p3.z * 0.9 },
        10
      );
      leaves.push({ center, points: left }, { center, points: right });
    }
  }

  return {
    seed,
    branches: branches.filter((branch) => branch.points.length > 1),
    blossoms,
    leaves,
    maxHeight: Math.max(maxHeight, ...blossoms.map((b) => b.center.y)),
  };
}
