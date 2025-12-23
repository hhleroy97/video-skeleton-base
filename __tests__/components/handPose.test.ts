import * as THREE from 'three';
import { computeHandlePoseFromHand } from '@/components/hand-tracking/handPose';
import type { Hand3DData } from '@/components/hand-tracking/HandTracking';

function mkHand(overrides: Partial<Hand3DData['landmarks'][number]>[] = []): Hand3DData {
  // Start with a neutral hand in normalized MediaPipe space.
  const landmarks = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));

  // Provide a palm frame that should map to a sensible basis.
  // wrist (0)
  landmarks[0] = { x: 0.5, y: 0.55, z: 0 };
  // index mcp (5) and pinky mcp (17) define palm x-axis
  landmarks[5] = { x: 0.45, y: 0.52, z: 0 };
  landmarks[17] = { x: 0.55, y: 0.52, z: 0 };
  // middle mcp (9) defines palm y-axis with wrist
  landmarks[9] = { x: 0.5, y: 0.45, z: 0 };

  // pinch tips (4,8)
  landmarks[4] = { x: 0.48, y: 0.48, z: 0 };
  landmarks[8] = { x: 0.52, y: 0.48, z: 0 };

  // Apply overrides by index
  overrides.forEach((o, idx) => {
    if (!o) return;
    landmarks[idx] = { ...landmarks[idx], ...o };
  });

  return { landmarks, handedness: 'Right' };
}

describe('computeHandlePoseFromHand', () => {
  it('returns a pose with position at pinch midpoint (scene space)', () => {
    const hand = mkHand();
    const pose = computeHandlePoseFromHand(hand);
    expect(pose).not.toBeNull();
    if (!pose) return;

    // Midpoint of thumb tip (4) and index tip (8) in normalized space is (0.5, 0.48).
    // Scene mapping in code is:
    // x = -((x-0.5)*2) => 0
    // y = (0.5 - y)*2 => (0.5 - 0.48)*2 = 0.04
    expect(pose.position.x).toBeCloseTo(0, 5);
    expect(pose.position.y).toBeCloseTo(0.04, 5);
    expect(pose.position.z).toBeCloseTo(0, 5);
  });

  it('produces a unit quaternion (valid rotation)', () => {
    const hand = mkHand();
    const pose = computeHandlePoseFromHand(hand);
    expect(pose).not.toBeNull();
    if (!pose) return;

    const len = pose.quaternion.length();
    expect(len).toBeCloseTo(1, 5);
  });

  it('scale tracks palm width (indexMcp to pinkyMcp) in scene space', () => {
    const hand = mkHand();
    const pose = computeHandlePoseFromHand(hand);
    expect(pose).not.toBeNull();
    if (!pose) return;

    // index mcp x=0.45 => scene x = -((0.45-0.5)*2)=0.1
    // pinky mcp x=0.55 => scene x = -((0.55-0.5)*2)=-0.1
    // distance should be 0.2
    expect(pose.scale).toBeCloseTo(0.2, 5);

    // sanity: scale multiplier works
    const pose2 = computeHandlePoseFromHand(hand, { scaleMultiplier: 2 });
    expect(pose2).not.toBeNull();
    if (!pose2) return;
    expect(pose2.scale).toBeCloseTo(0.4, 5);
  });

  it('returns null for invalid hand data', () => {
    const hand: Hand3DData = { landmarks: [], handedness: 'Unknown' };
    expect(computeHandlePoseFromHand(hand)).toBeNull();
  });

  it('does not throw for degenerate basis (overlapping points)', () => {
    const hand = mkHand();
    // Collapse index/pinky to same point
    hand.landmarks[5] = { ...hand.landmarks[5], x: 0.5, y: 0.5 };
    hand.landmarks[17] = { ...hand.landmarks[17], x: 0.5, y: 0.5 };

    const pose = computeHandlePoseFromHand(hand);
    expect(pose).not.toBeNull();
    if (!pose) return;
    // Quaternion may fallback to identity
    expect(pose.quaternion).toBeInstanceOf(THREE.Quaternion);
  });
});
