import * as THREE from 'three';
import type { Hand3DData } from './HandTracking';

export type HandModelOverlayMode = 'skeleton' | 'model';

export const HAND_LANDMARK = {
  WRIST: 0,
  INDEX_MCP: 5,
  MIDDLE_MCP: 9,
  PINKY_MCP: 17,
  THUMB_TIP: 4,
  INDEX_TIP: 8,
} as const;

export function landmarkToSceneSpace(lm: { x: number; y: number; z: number }, depthScale = 2) {
  // Match the coordinate mapping in Hand3DVisual:
  // - x: normalized 0..1 -> scene -1..1 and flipped about Y-axis
  // - y: normalized 0..1 -> scene -1..1 with Y flipped (top-left -> up)
  // - z: MediaPipe depth scaled for visibility
  return new THREE.Vector3(
    -((lm.x - 0.5) * 2),
    (0.5 - lm.y) * 2,
    lm.z * depthScale
  );
}

export interface HandHandlePose {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: number;
}

export type HandAnchor = 'pinch' | 'wrist';

/**
 * Computes a stable pose for attaching a "handle" model to a hand.
 *
 * - position: midpoint between thumb tip (4) and index tip (8)
 * - orientation: palm basis derived from (indexMcp->pinkyMcp) and (wrist->middleMcp)
 * - scale: proportional to palm width (distance indexMcp<->pinkyMcp)
 */
export function computeHandlePoseFromHand(
  hand: Hand3DData,
  options?: {
    depthScale?: number;
    scaleMultiplier?: number;
    anchor?: HandAnchor;
  }
): HandHandlePose | null {
  const depthScale = options?.depthScale ?? 2;
  const scaleMultiplier = options?.scaleMultiplier ?? 1;
  const anchor = options?.anchor ?? 'pinch';

  const lms = hand.landmarks;
  if (!lms || lms.length < 21) return null;

  const wrist = lms[HAND_LANDMARK.WRIST];
  const indexMcp = lms[HAND_LANDMARK.INDEX_MCP];
  const middleMcp = lms[HAND_LANDMARK.MIDDLE_MCP];
  const pinkyMcp = lms[HAND_LANDMARK.PINKY_MCP];
  const thumbTip = lms[HAND_LANDMARK.THUMB_TIP];
  const indexTip = lms[HAND_LANDMARK.INDEX_TIP];

  if (!wrist || !indexMcp || !middleMcp || !pinkyMcp || !thumbTip || !indexTip) return null;

  const wristP = landmarkToSceneSpace(wrist, depthScale);
  const indexMcpP = landmarkToSceneSpace(indexMcp, depthScale);
  const middleMcpP = landmarkToSceneSpace(middleMcp, depthScale);
  const pinkyMcpP = landmarkToSceneSpace(pinkyMcp, depthScale);
  const thumbTipP = landmarkToSceneSpace(thumbTip, depthScale);
  const indexTipP = landmarkToSceneSpace(indexTip, depthScale);

  const position =
    anchor === 'wrist'
      ? wristP.clone()
      : new THREE.Vector3().addVectors(thumbTipP, indexTipP).multiplyScalar(0.5);

  // Palm basis
  const xAxis = new THREE.Vector3().subVectors(pinkyMcpP, indexMcpP);
  const yAxis0 = new THREE.Vector3().subVectors(middleMcpP, wristP);

  if (xAxis.lengthSq() < 1e-8 || yAxis0.lengthSq() < 1e-8) {
    return {
      position,
      quaternion: new THREE.Quaternion(),
      scale: indexMcpP.distanceTo(pinkyMcpP) * scaleMultiplier,
    };
  }

  xAxis.normalize();
  yAxis0.normalize();

  const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis0);
  if (zAxis.lengthSq() < 1e-8) {
    return {
      position,
      quaternion: new THREE.Quaternion(),
      scale: indexMcpP.distanceTo(pinkyMcpP) * scaleMultiplier,
    };
  }
  zAxis.normalize();

  // Re-orthonormalize y to avoid drift
  const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();

  const m = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(m);

  const scale = indexMcpP.distanceTo(pinkyMcpP) * scaleMultiplier;

  return { position, quaternion, scale };
}
