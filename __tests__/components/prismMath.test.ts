import * as THREE from 'three';
import { computeBoneTransform, twistAroundAxis } from '@/components/hand-tracking/prismMath';

describe('computeBoneTransform', () => {
  it('places position at midpoint', () => {
    const a = new THREE.Vector3(0, 0, 0);
    const b = new THREE.Vector3(0, 2, 0);
    const t = computeBoneTransform(a, b);
    expect(t.position.x).toBeCloseTo(0, 6);
    expect(t.position.y).toBeCloseTo(1, 6);
    expect(t.position.z).toBeCloseTo(0, 6);
    expect(t.length).toBeCloseTo(2, 6);
  });

  it('rotates +Y to match direction', () => {
    const a = new THREE.Vector3(0, 0, 0);
    const b = new THREE.Vector3(1, 0, 0);
    const t = computeBoneTransform(a, b);
    const y = new THREE.Vector3(0, 1, 0).applyQuaternion(t.quaternion).normalize();
    expect(y.x).toBeCloseTo(1, 5);
    expect(y.y).toBeCloseTo(0, 5);
    expect(y.z).toBeCloseTo(0, 5);
  });

  it('handles zero-length segments', () => {
    const a = new THREE.Vector3(1, 1, 1);
    const t = computeBoneTransform(a, a.clone());
    expect(t.length).toBe(0);
  });

  it('twists a point around an axis through center', () => {
    const center = new THREE.Vector3(0, 0, 0);
    const axis = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3(1, 0, 0);
    const out = twistAroundAxis(p, center, axis, Math.PI / 2);
    expect(out.x).toBeCloseTo(0, 5);
    expect(out.z).toBeCloseTo(-1, 5);
  });
});

