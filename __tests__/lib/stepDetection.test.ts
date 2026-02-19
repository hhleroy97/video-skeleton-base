import { getAverageHeelToAnkleSpan, getBodyReferencePoint, getFootAnchorPoint, isStepTransition } from '@/lib/stepDetection';
import type { PoseLandmark } from '@/types/mediapipe';

const makePose = (): PoseLandmark[] =>
  Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 1 }));

describe('stepDetection', () => {
  it('detects down-to-up velocity reversal as step', () => {
    expect(isStepTransition(0.004, -0.003)).toBe(true);
  });

  it('does not detect step without proper reversal', () => {
    expect(isStepTransition(0.004, 0.001)).toBe(false);
    expect(isStepTransition(-0.004, -0.002)).toBe(false);
    expect(isStepTransition(null, -0.002)).toBe(false);
  });

  it('computes averaged foot anchor from visible ankle/heel points', () => {
    const pose = makePose();
    pose[27] = { x: 0.2, y: 0.8, z: 0, visibility: 1 };
    pose[28] = { x: 0.8, y: 0.82, z: 0, visibility: 1 };
    pose[29] = { x: 0.25, y: 0.84, z: 0, visibility: 1 };
    pose[30] = { x: 0.75, y: 0.86, z: 0, visibility: 1 };

    const anchor = getFootAnchorPoint(pose);
    expect(anchor?.x).toBeCloseTo(0.5, 6);
    expect(anchor?.y).toBeCloseTo(0.83, 6);
  });

  it('returns null when no foot landmarks pass visibility threshold', () => {
    const pose = makePose();
    pose[27].visibility = 0.1;
    pose[28].visibility = 0.1;
    pose[29].visibility = 0.1;
    pose[30].visibility = 0.1;

    expect(getFootAnchorPoint(pose, 0.35)).toBeNull();
  });

  it('returns hip midpoint as body reference point', () => {
    const pose = makePose();
    pose[23] = { x: 0.3, y: 0.6, z: 0, visibility: 1 };
    pose[24] = { x: 0.5, y: 0.62, z: 0, visibility: 1 };
    expect(getBodyReferencePoint(pose)).toEqual({ x: 0.4, y: 0.61 });
  });

  it('falls back to shoulders when hips are not visible', () => {
    const pose = makePose();
    pose[23].visibility = 0.1;
    pose[24].visibility = 0.1;
    pose[11] = { x: 0.35, y: 0.3, z: 0, visibility: 1 };
    pose[12] = { x: 0.55, y: 0.31, z: 0, visibility: 1 };
    expect(getBodyReferencePoint(pose)).toEqual({ x: 0.45, y: 0.305 });
  });

  it('computes average heel-to-ankle span from visible points', () => {
    const pose = makePose();
    pose[27] = { x: 0.4, y: 0.75, z: 0, visibility: 1 };
    pose[29] = { x: 0.4, y: 0.82, z: 0, visibility: 1 };
    pose[28] = { x: 0.6, y: 0.74, z: 0, visibility: 1 };
    pose[30] = { x: 0.6, y: 0.81, z: 0, visibility: 1 };
    expect(getAverageHeelToAnkleSpan(pose)).toBeCloseTo(0.07, 6);
  });
});

