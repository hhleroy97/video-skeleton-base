import * as THREE from 'three';

export interface BoneTransform {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  length: number;
}

/**
 * Rotates `point` around an axis passing through `center` by `angleRad`.
 */
export function twistAroundAxis(
  point: THREE.Vector3,
  center: THREE.Vector3,
  axis: THREE.Vector3,
  angleRad: number
) {
  const out = point.clone().sub(center);
  const q = new THREE.Quaternion().setFromAxisAngle(axis.clone().normalize(), angleRad);
  out.applyQuaternion(q);
  out.add(center);
  return out;
}

/**
 * Returns a transform that places an object at the midpoint of (a,b),
 * rotates its +Y axis to point along (b-a), and returns the segment length.
 */
export function computeBoneTransform(a: THREE.Vector3, b: THREE.Vector3): BoneTransform {
  const dir = new THREE.Vector3().subVectors(b, a);
  const length = dir.length();
  const position = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);

  if (length < 1e-8) {
    return { position, quaternion: new THREE.Quaternion(), length: 0 };
  }

  dir.normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  return { position, quaternion, length };
}

