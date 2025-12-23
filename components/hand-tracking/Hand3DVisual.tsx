'use client';

import { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib';
import type { Hand3DData } from './HandTracking';
import { computeHandlePoseFromHand, landmarkToSceneSpace, type HandModelOverlayMode } from './handPose';

export interface HandBoundingBox {
  center: { x: number; y: number; z: number };
  size: { width: number; height: number; depth: number };
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

interface Hand3DVisualProps {
  hands: Hand3DData[];
  className?: string;
  onBoundingBoxes?: (boxes: HandBoundingBox[]) => void;
  overlayMode?: HandModelOverlayMode;
  modelUrl?: string;
}

// Hand connections based on MediaPipe hand landmarks (21 points)
const HAND_CONNECTIONS: Array<[number, number]> = [
  // Thumb
  [0, 1], [1, 2], [2, 3], [3, 4],
  // Index finger
  [0, 5], [5, 6], [6, 7], [7, 8],
  // Middle finger
  [0, 9], [9, 10], [10, 11], [11, 12],
  // Ring finger
  [0, 13], [13, 14], [14, 15], [15, 16],
  // Pinky
  [0, 17], [17, 18], [18, 19], [19, 20],
  // Palm
  [5, 9], [9, 13], [13, 17],
];

/**
 * 3D Hand visualization component
 * Renders hand landmarks and connections in 3D space
 */
function Hand3DModel({
  hands,
  onBoundingBoxes,
  showSkeleton = true,
}: {
  hands: Hand3DData[];
  onBoundingBoxes?: (boxes: HandBoundingBox[]) => void;
  showSkeleton?: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const handsRef = useRef<THREE.Group[]>([]);
  const landmarksRef = useRef<THREE.Mesh[][]>([]);
  const connectionsRef = useRef<THREE.Line[][]>([]);
  const boundingBoxesRef = useRef<THREE.LineSegments[]>([]);
  
  // Smoothing: store previous positions for each landmark to reduce jitter
  const smoothedPositionsRef = useRef<Map<number, { x: number; y: number; z: number }[]>>(new Map());
  const SMOOTHING_FACTOR = 0.3; // Lower = more smoothing (0.0 to 1.0)
  
  // Create shared geometries (reused for all hands)
  const landmarkGeometry = useMemo(() => {
    return new THREE.SphereGeometry(0.015, 16, 16);
  }, []);
  
  // Create materials per hand type
  const leftHandMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: 0xff0000,
      emissive: 0x440000,
      metalness: 0.8,
      roughness: 0.2,
    });
  }, []);
  
  const rightHandMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: 0x0000ff,
      emissive: 0x000044,
      metalness: 0.8,
      roughness: 0.2,
    });
  }, []);
  
  const unknownHandMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: 0x888888,
      emissive: 0x222222,
      metalness: 0.8,
      roughness: 0.2,
    });
  }, []);
  
  const leftHandLineMaterial = useMemo(() => {
    return new THREE.LineBasicMaterial({
      color: 0xff0000,
      linewidth: 2,
      transparent: true,
      opacity: 0.8,
    });
  }, []);
  
  const rightHandLineMaterial = useMemo(() => {
    return new THREE.LineBasicMaterial({
      color: 0x0000ff,
      linewidth: 2,
      transparent: true,
      opacity: 0.8,
    });
  }, []);
  
  const unknownHandLineMaterial = useMemo(() => {
    return new THREE.LineBasicMaterial({
      color: 0x888888,
      linewidth: 2,
      transparent: true,
      opacity: 0.8,
    });
  }, []);
  
  // Bounding box material
  const boundingBoxMaterial = useMemo(() => {
    return new THREE.LineBasicMaterial({
      color: 0xffff00,
      linewidth: 2,
      transparent: true,
      opacity: 0.6,
    });
  }, []);
  
  // Initialize or update hand structures
  // Always maintain 2 hand structures (MediaPipe max) to avoid create/destroy overhead
  useEffect(() => {
    if (!groupRef.current) return;
    
    const MAX_HANDS = 2; // MediaPipe maximum
    
    // Remove excess hands if we have more than MAX_HANDS (shouldn't happen, but safety check)
    while (handsRef.current.length > MAX_HANDS) {
      const handIndex = handsRef.current.length - 1;
      const handGroup = handsRef.current.pop();
      const boundingBox = boundingBoxesRef.current.pop();
      const landmarkMeshes = landmarksRef.current.pop();
      const connectionLines = connectionsRef.current.pop();
      
      // Clean up smoothed positions for this hand
      for (let i = 0; i < 21; i++) {
        const key = handIndex * 1000 + i;
        smoothedPositionsRef.current.delete(key);
      }
      
      if (handGroup) {
        groupRef.current.remove(handGroup);
        // Dispose geometries and materials
        handGroup.traverse((child) => {
          if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.LineSegments) {
            if (child.geometry) child.geometry.dispose();
            if (child.material instanceof THREE.Material) {
              child.material.dispose();
            }
          }
        });
      }
      if (boundingBox) {
        if (boundingBox.geometry) boundingBox.geometry.dispose();
        if (boundingBox.material instanceof THREE.Material) {
          boundingBox.material.dispose();
        }
      }
      // Note: landmarkMeshes and connectionLines are already disposed via handGroup.traverse above
    }
    
    // Create hand groups up to MAX_HANDS (always maintain 2 structures)
    while (handsRef.current.length < MAX_HANDS) {
      const handGroup = new THREE.Group();
      handGroup.visible = false; // Start hidden, will be shown in useFrame if hand is detected
      groupRef.current.add(handGroup);
      handsRef.current.push(handGroup);
      
      // Create landmarks and connections for this hand
      const landmarkMeshes: THREE.Mesh[] = [];
      const connectionLines: THREE.Line[] = [];
      
      // Create 21 landmark spheres (use placeholder material, will be set in useFrame)
      for (let i = 0; i < 21; i++) {
        const mesh = new THREE.Mesh(landmarkGeometry, leftHandMaterial.clone());
        mesh.visible = true;
        handGroup.add(mesh);
        landmarkMeshes.push(mesh);
      }
      
      // Create connection lines (use placeholder material, will be set in useFrame)
      HAND_CONNECTIONS.forEach(() => {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(6); // 2 points * 3 coords
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const line = new THREE.Line(geometry, leftHandLineMaterial.clone());
        line.visible = true;
        handGroup.add(line);
        connectionLines.push(line);
      });
      
      // Create bounding box wireframe (12 edges of a box = 24 vertices for LineSegments)
      const boxGeometry = new THREE.BufferGeometry();
      const boxPositions = new Float32Array(24 * 3); // 24 vertices * 3 coords (12 edges * 2 points each)
      boxGeometry.setAttribute('position', new THREE.BufferAttribute(boxPositions, 3));
      const boundingBox = new THREE.LineSegments(boxGeometry, boundingBoxMaterial.clone());
      boundingBox.visible = true;
      handGroup.add(boundingBox);
      boundingBoxesRef.current.push(boundingBox);
      
      landmarksRef.current.push(landmarkMeshes);
      connectionsRef.current.push(connectionLines);
    }
  }, [landmarkGeometry, leftHandMaterial, leftHandLineMaterial, boundingBoxMaterial]);
  
  // Calculate bounding box for a hand
  const calculateBoundingBox = (landmarks: Hand3DData['landmarks']): HandBoundingBox => {
    if (landmarks.length === 0) {
      return {
        center: { x: 0, y: 0, z: 0 },
        size: { width: 0, height: 0, depth: 0 },
        min: { x: 0, y: 0, z: 0 },
        max: { x: 0, y: 0, z: 0 },
      };
    }
    
    // Convert to 3D space coordinates with Y-axis flip
    const points = landmarks.map(lm => ({
      x: -((lm.x - 0.5) * 2), // Flip about Y-axis
      y: (0.5 - lm.y) * 2,
      z: lm.z * 2,
    }));
    
    // Find min/max
    const min = {
      x: Math.min(...points.map(p => p.x)),
      y: Math.min(...points.map(p => p.y)),
      z: Math.min(...points.map(p => p.z)),
    };
    
    const max = {
      x: Math.max(...points.map(p => p.x)),
      y: Math.max(...points.map(p => p.y)),
      z: Math.max(...points.map(p => p.z)),
    };
    
    // Calculate center and size
    const center = {
      x: (min.x + max.x) / 2,
      y: (min.y + max.y) / 2,
      z: (min.z + max.z) / 2,
    };
    
    const size = {
      width: max.x - min.x,
      height: max.y - min.y,
      depth: max.z - min.z,
    };
    
    return { center, size, min, max };
  };
  
  // Update hand positions and materials
  useFrame(() => {
    if (!groupRef.current) return;
    
    const boundingBoxes: HandBoundingBox[] = [];
    
    // We should always have 2 structures (created in useEffect), but check anyway
    if (hands.length > handsRef.current.length || handsRef.current.length === 0) {
      // Structures will be created by useEffect, but we can't create them here
      // Just skip this frame and wait for useEffect
      return;
    }
    
    // Hide all hands first, then show only the ones that are detected
    handsRef.current.forEach((handGroup, idx) => {
      if (idx >= hands.length) {
        handGroup.visible = false;
      } else {
        handGroup.visible = showSkeleton;
      }
    });
    
    hands.forEach((hand, handIndex) => {
      const handGroup = handsRef.current[handIndex];
      const landmarkMeshes = landmarksRef.current[handIndex];
      const connectionLines = connectionsRef.current[handIndex];
      const boundingBox = boundingBoxesRef.current[handIndex];
      
      if (!handGroup || !landmarkMeshes || !connectionLines) {
        // If structures don't exist yet, skip (they'll be created in useEffect)
        return;
      }
      
      // Ensure correct visibility for skeleton elements
      handGroup.visible = showSkeleton;
      handGroup.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.LineSegments) {
          child.visible = showSkeleton;
        }
      });
      
      // Calculate bounding box using smoothed 3D positions directly
      // (already flipped and smoothed, so we can use them directly)
      const smoothedPoints = hand.landmarks.map((landmark, idx) => {
        const key = handIndex * 1000 + idx;
        const smoothed = smoothedPositionsRef.current.get(key);
        if (smoothed) {
          // Use smoothed 3D positions directly (already flipped about Y-axis)
          return {
            x: smoothed[0].x,
            y: smoothed[0].y,
            z: smoothed[0].z,
          };
        }
        // Fallback to raw calculation if smoothing not available yet
        return {
          x: -((landmark.x - 0.5) * 2),
          y: (0.5 - landmark.y) * 2,
          z: landmark.z * 2,
        };
      });
      
      // Calculate bounding box from smoothed 3D points
      let bbox: HandBoundingBox;
      if (smoothedPoints.length === 0) {
        bbox = {
          center: { x: 0, y: 0, z: 0 },
          size: { width: 0, height: 0, depth: 0 },
          min: { x: 0, y: 0, z: 0 },
          max: { x: 0, y: 0, z: 0 },
        };
      } else {
        const min = {
          x: Math.min(...smoothedPoints.map(p => p.x)),
          y: Math.min(...smoothedPoints.map(p => p.y)),
          z: Math.min(...smoothedPoints.map(p => p.z)),
        };
        
        const max = {
          x: Math.max(...smoothedPoints.map(p => p.x)),
          y: Math.max(...smoothedPoints.map(p => p.y)),
          z: Math.max(...smoothedPoints.map(p => p.z)),
        };
        
        const center = {
          x: (min.x + max.x) / 2,
          y: (min.y + max.y) / 2,
          z: (min.z + max.z) / 2,
        };
        
        const size = {
          width: max.x - min.x,
          height: max.y - min.y,
          depth: max.z - min.z,
        };
        
        bbox = { center, size, min, max };
      }
      
      boundingBoxes.push(bbox);
      
      // Update bounding box wireframe
      if (boundingBox && bbox.size.width > 0 && bbox.size.height > 0 && bbox.size.depth > 0) {
        const { min, max } = bbox;
        // 8 vertices of the bounding box
        const v0 = new THREE.Vector3(min.x, min.y, min.z); // bottom-left-back
        const v1 = new THREE.Vector3(max.x, min.y, min.z); // bottom-right-back
        const v2 = new THREE.Vector3(max.x, max.y, min.z); // top-right-back
        const v3 = new THREE.Vector3(min.x, max.y, min.z); // top-left-back
        const v4 = new THREE.Vector3(min.x, min.y, max.z); // bottom-left-front
        const v5 = new THREE.Vector3(max.x, min.y, max.z); // bottom-right-front
        const v6 = new THREE.Vector3(max.x, max.y, max.z); // top-right-front
        const v7 = new THREE.Vector3(min.x, max.y, max.z); // top-left-front
        
        // 12 edges as line segments (24 vertices total)
        const edges = [
          // Bottom face
          v0, v1, v1, v2, v2, v3, v3, v0,
          // Top face
          v4, v5, v5, v6, v6, v7, v7, v4,
          // Vertical edges
          v0, v4, v1, v5, v2, v6, v3, v7,
        ];
        
        const positions = boundingBox.geometry.getAttribute('position') as THREE.BufferAttribute;
        edges.forEach((vertex, idx) => {
          positions.setXYZ(idx, vertex.x, vertex.y, vertex.z);
        });
        positions.needsUpdate = true;
      }
      
      // Get materials based on handedness
      const landmarkMaterial = hand.handedness === 'Left' 
        ? leftHandMaterial 
        : hand.handedness === 'Right' 
        ? rightHandMaterial 
        : unknownHandMaterial;
      
      const lineMaterial = hand.handedness === 'Left'
        ? leftHandLineMaterial
        : hand.handedness === 'Right'
        ? rightHandLineMaterial
        : unknownHandLineMaterial;
      
      // Update landmark positions with smoothing
      hand.landmarks.forEach((landmark, index) => {
        if (index >= landmarkMeshes.length) return;
        
        const mesh = landmarkMeshes[index];
        if (!mesh) return;
        
        // MediaPipe coordinates: x, y are normalized 0-1, z is depth in meters
        const rawX = -((landmark.x - 0.5) * 2); // Flip about Y-axis: -1 to 1, negated
        const rawY = (0.5 - landmark.y) * 2; // Flip Y, -1 to 1
        const rawZ = landmark.z * 2; // Scale depth
        
        // Apply exponential moving average smoothing
        const key = handIndex * 1000 + index; // Unique key for each hand's landmark
        let smoothedPositions = smoothedPositionsRef.current.get(key);
        
        if (!smoothedPositions) {
          smoothedPositions = [{ x: rawX, y: rawY, z: rawZ }];
          smoothedPositionsRef.current.set(key, smoothedPositions);
        }
        
        const prev = smoothedPositions[0];
        const smoothedX = prev.x * (1 - SMOOTHING_FACTOR) + rawX * SMOOTHING_FACTOR;
        const smoothedY = prev.y * (1 - SMOOTHING_FACTOR) + rawY * SMOOTHING_FACTOR;
        const smoothedZ = prev.z * (1 - SMOOTHING_FACTOR) + rawZ * SMOOTHING_FACTOR;
        
        smoothedPositions[0] = { x: smoothedX, y: smoothedY, z: smoothedZ };
        
        mesh.position.set(smoothedX, smoothedY, smoothedZ);
        mesh.visible = showSkeleton;
        
        // Update material based on handedness - always assign to ensure correct material
        // Check if material needs to be updated by comparing color
        const currentMaterial = mesh.material as THREE.MeshStandardMaterial;
        const targetColor = landmarkMaterial.color.getHex();
        const currentColor = currentMaterial?.color?.getHex();
        
        if (currentColor !== targetColor) {
          const oldMaterial = mesh.material;
          mesh.material = landmarkMaterial.clone();
          // Dispose old material if it was a clone (not one of our base materials)
          if (oldMaterial instanceof THREE.Material && oldMaterial !== leftHandMaterial && 
              oldMaterial !== rightHandMaterial && oldMaterial !== unknownHandMaterial) {
            oldMaterial.dispose();
          }
        }
      });
      
      // Update connection lines (use smoothed positions)
      HAND_CONNECTIONS.forEach(([startIdx, endIdx], connIndex) => {
        if (connIndex >= connectionLines.length) return;
        
        const start = hand.landmarks[startIdx];
        const end = hand.landmarks[endIdx];
        const line = connectionLines[connIndex];
        
        if (start && end && line) {
          // Get smoothed positions for start and end points
          const startKey = handIndex * 1000 + startIdx;
          const endKey = handIndex * 1000 + endIdx;
          const startSmoothed = smoothedPositionsRef.current.get(startKey);
          const endSmoothed = smoothedPositionsRef.current.get(endKey);
          
          // Use smoothed positions if available, otherwise calculate raw (with Y-axis flip)
          const startX = startSmoothed ? startSmoothed[0].x : -((start.x - 0.5) * 2);
          const startY = startSmoothed ? startSmoothed[0].y : (0.5 - start.y) * 2;
          const startZ = startSmoothed ? startSmoothed[0].z : start.z * 2;
          
          const endX = endSmoothed ? endSmoothed[0].x : -((end.x - 0.5) * 2);
          const endY = endSmoothed ? endSmoothed[0].y : (0.5 - end.y) * 2;
          const endZ = endSmoothed ? endSmoothed[0].z : end.z * 2;
          
          const positions = line.geometry.getAttribute('position') as THREE.BufferAttribute;
          positions.setXYZ(0, startX, startY, startZ);
          positions.setXYZ(1, endX, endY, endZ);
          positions.needsUpdate = true;
          
          line.visible = showSkeleton;
          
          // Update material based on handedness - always assign to ensure correct material
          // Check if material needs to be updated by comparing color
          const currentLineMaterial = line.material as THREE.LineBasicMaterial;
          const targetLineColor = lineMaterial.color.getHex();
          const currentLineColor = currentLineMaterial?.color?.getHex();
          
          if (currentLineColor !== targetLineColor) {
            const oldMaterial = line.material;
            line.material = lineMaterial.clone();
            // Dispose old material if it was a clone (not one of our base materials)
            if (oldMaterial instanceof THREE.Material && oldMaterial !== leftHandLineMaterial && 
                oldMaterial !== rightHandLineMaterial && oldMaterial !== unknownHandLineMaterial) {
              oldMaterial.dispose();
            }
          }
        }
      });
    });
    
    // Callback with bounding box data
    if (onBoundingBoxes) {
      onBoundingBoxes(boundingBoxes);
    }
  });
  
  return <group ref={groupRef} />;
}

function HandModelOverlay({
  hands,
  modelUrl,
  modelPositionOffset = [0, 0, 0],
  modelRotationOffset = [0, 0, 0],
  baseScale = 1,
  forearmTwistOffsetRad = 0,
}: {
  hands: Hand3DData[];
  modelUrl: string;
  modelPositionOffset?: [number, number, number];
  modelRotationOffset?: [number, number, number];
  baseScale?: number;
  forearmTwistOffsetRad?: number;
}) {
  const gltf = useGLTF(modelUrl);

  // Render one model per detected hand (up to MediaPipe max 2)
  return (
    <>
      {[0, 1].map((handIndex) => {
        const hand = hands[handIndex];
        return (
          <HandModelInstance
            key={`hand-model-${handIndex}`}
            hand={hand}
            modelScene={gltf.scene}
            modelPositionOffset={modelPositionOffset}
            modelRotationOffset={modelRotationOffset}
            baseScale={baseScale}
            forearmTwistOffsetRad={forearmTwistOffsetRad}
          />
        );
      })}
    </>
  );
}

type BoneCalibration = {
  restQuat: THREE.Quaternion;
  restDirParent: THREE.Vector3;
};

function normalizeBoneName(name: string) {
  // Normalize across exporters/loaders that may alter punctuation.
  // Examples: "thumb_01.R_08" vs "thumb_01_R_08" vs "Thumb_01.R_08"
  // We intentionally strip ALL non-alphanumeric characters so variants like:
  // - thumb_01.R_08
  // - thumb_01R_08
  // - thumb-01 r 08
  // normalize to the same key.
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

type LandmarkSegment = { a: number; b: number };

function inferLandmarkSegmentForBoneName(boneName: string): LandmarkSegment | null {
  const key = normalizeBoneName(boneName);

  // Avoid driving helper/control/end bones by default; they commonly cause double transforms / squish.
  // We focus on deform bones (base + 01/02/03 chains).
  if (key.includes('ctrl') || key.includes('end') || key.includes('tip')) return null;

  const finger =
    key.includes('thumb')
      ? 'thumb'
      : key.includes('index')
        ? 'index'
        : key.includes('middle')
          ? 'middle'
          : key.includes('ring')
            ? 'ring'
            : key.includes('pinky')
              ? 'pinky'
              : null;

  if (!finger) return null;

  const base: Record<typeof finger, LandmarkSegment> = {
    thumb: { a: 0, b: 1 }, // wrist -> thumb CMC
    index: { a: 0, b: 5 }, // wrist -> index MCP
    middle: { a: 0, b: 9 },
    ring: { a: 0, b: 13 },
    pinky: { a: 0, b: 17 },
  };

  const seg1: Record<typeof finger, LandmarkSegment> = {
    thumb: { a: 1, b: 2 },
    index: { a: 5, b: 6 },
    middle: { a: 9, b: 10 },
    ring: { a: 13, b: 14 },
    pinky: { a: 17, b: 18 },
  };

  const seg2: Record<typeof finger, LandmarkSegment> = {
    thumb: { a: 2, b: 3 },
    index: { a: 6, b: 7 },
    middle: { a: 10, b: 11 },
    ring: { a: 14, b: 15 },
    pinky: { a: 18, b: 19 },
  };

  const seg3: Record<typeof finger, LandmarkSegment> = {
    thumb: { a: 3, b: 4 },
    index: { a: 7, b: 8 },
    middle: { a: 11, b: 12 },
    ring: { a: 15, b: 16 },
    pinky: { a: 19, b: 20 },
  };

  // Prefer explicit base control
  if (key.includes('base')) return base[finger];

  // Fallback: attempt to infer by segment numbers that appear in the name
  if (key.includes('03')) return seg3[finger];
  if (key.includes('02')) return seg2[finger];
  if (key.includes('01')) return seg1[finger];

  return null;
}

function HandModelInstance({
  hand,
  modelScene,
  modelPositionOffset,
  modelRotationOffset,
  baseScale,
  forearmTwistOffsetRad,
}: {
  hand: Hand3DData | undefined;
  modelScene: THREE.Object3D;
  modelPositionOffset: [number, number, number];
  modelRotationOffset: [number, number, number];
  baseScale: number;
  forearmTwistOffsetRad: number;
}) {
  const rootRef = useRef<THREE.Group>(null);
  // IMPORTANT: Skinned meshes must be cloned with SkeletonUtils, not Object3D.clone(true),
  // otherwise bones/skeleton bindings can break and the mesh won't deform.
  const instance = useMemo(() => SkeletonUtils.clone(modelScene) as THREE.Object3D, [modelScene]);
  const skinnedRef = useRef<THREE.SkinnedMesh | null>(null);
  const bonesRef = useRef<Map<string, THREE.Bone>>(new Map());
  const bonesByNormRef = useRef<Map<string, THREE.Bone>>(new Map());
  const calibRef = useRef<Map<string, BoneCalibration>>(new Map());
  const calibByBoneRef = useRef<Map<THREE.Bone, BoneCalibration & LandmarkSegment>>(new Map());
  const weightedBonesRef = useRef<Set<THREE.Bone>>(new Set());
  const orderedCalibratedBonesRef = useRef<THREE.Bone[]>([]);
  const didCalibrateRef = useRef(false);
  const didLogDebugRef = useRef(false);

  const smoothedPos = useRef(new THREE.Vector3());
  const smoothedQuat = useRef(new THREE.Quaternion());
  const smoothedScale = useRef(1);
  const hasInit = useRef(false);
  const forearmTwistQuat = useMemo(() => new THREE.Quaternion(), []);

  // One-time discovery of SkinnedMesh and bones on this instance
  useEffect(() => {
    skinnedRef.current = null;
    bonesRef.current = new Map();
    bonesByNormRef.current = new Map();
    calibRef.current = new Map();
    calibByBoneRef.current = new Map();
    didCalibrateRef.current = false;
    didLogDebugRef.current = false;

    instance.traverse((obj) => {
      const anyObj = obj as any;
      if ((anyObj?.isSkinnedMesh || obj instanceof THREE.SkinnedMesh) && !skinnedRef.current) {
        skinnedRef.current = obj as unknown as THREE.SkinnedMesh;
      }
    });

    // Prefer the actual deform skeleton bones (guaranteed to affect the skinned mesh)
    const skinned = skinnedRef.current as any;
    if (skinned?.skeleton?.bones?.length) {
      for (const bone of skinned.skeleton.bones as THREE.Bone[]) {
        if (bone?.name) {
          bonesRef.current.set(bone.name, bone);
          bonesByNormRef.current.set(normalizeBoneName(bone.name), bone);
        }
      }

      // Compute which bones actually influence vertices (non-zero skin weights)
      weightedBonesRef.current = new Set();
      const geom = (skinnedRef.current as any)?.geometry as THREE.BufferGeometry | undefined;
      const skinIndexAttr = geom?.getAttribute?.('skinIndex') as any;
      const skinWeightAttr = geom?.getAttribute?.('skinWeight') as any;
      const bonesArr = (skinnedRef.current as any).skeleton.bones as THREE.Bone[];

      if (skinIndexAttr?.array && skinWeightAttr?.array && Array.isArray(bonesArr) === false) {
        // fall through
      }
      if (skinIndexAttr?.array && skinWeightAttr?.array && bonesArr?.length) {
        const idx = skinIndexAttr.array as ArrayLike<number>;
        const w = skinWeightAttr.array as ArrayLike<number>;
        const used = new Set<number>();
        const eps = 1e-6;
        // attributes are vec4 per vertex
        for (let i = 0; i < w.length; i++) {
          if (w[i] > eps) used.add(idx[i] as number);
        }
        for (const jointIndex of used) {
          const bone = bonesArr[jointIndex];
          if (bone) weightedBonesRef.current.add(bone);
        }
      } else {
        // If we can't read skin weights, allow all skeleton bones.
        weightedBonesRef.current = new Set(bonesRef.current.values());
      }
      return;
    }

    // Fallback: traverse for bones (works for some rigs, but may include non-deform controls)
    instance.traverse((obj) => {
      if (obj instanceof THREE.Bone && obj.name) {
        bonesRef.current.set(obj.name, obj);
        bonesByNormRef.current.set(normalizeBoneName(obj.name), obj);
      }
    });
  }, [instance]);

  const getBone = (name: string) => {
    return bonesRef.current.get(name) ?? bonesByNormRef.current.get(normalizeBoneName(name));
  };

  useFrame(() => {
    const root = rootRef.current;
    if (!root || !hand) {
      if (root) root.visible = false;
      hasInit.current = false;
      didCalibrateRef.current = false;
      return;
    }

    // For a full rigged hand, anchoring at the wrist is usually better than pinch midpoint.
    const pose = computeHandlePoseFromHand(hand, { depthScale: 2, scaleMultiplier: 1, anchor: 'wrist' });
    if (!pose) {
      root.visible = false;
      hasInit.current = false;
      return;
    }

    root.visible = true;

    // Smooth transform to reduce jitter (separate from landmark smoothing)
    const alpha = 0.25;
    if (!hasInit.current) {
      smoothedPos.current.copy(pose.position);
      smoothedQuat.current.copy(pose.quaternion);
      smoothedScale.current = pose.scale;
      hasInit.current = true;
    } else {
      smoothedPos.current.lerp(pose.position, alpha);
      smoothedQuat.current.slerp(pose.quaternion, alpha);
      smoothedScale.current = THREE.MathUtils.lerp(smoothedScale.current, pose.scale, alpha);
    }

    root.position.copy(smoothedPos.current);
    root.quaternion.copy(smoothedQuat.current);
    // Apply a twist around the tracked forearm axis (hand-local Y in our basis).
    if (forearmTwistOffsetRad) {
      forearmTwistQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), forearmTwistOffsetRad);
      root.quaternion.multiply(forearmTwistQuat);
    }
    root.scale.setScalar(smoothedScale.current * baseScale);

    // Drive finger bones if this GLB is rigged (SkinnedMesh + bones)
    if (skinnedRef.current && bonesRef.current.size > 0) {
      // Update matrices so matrixWorld is correct before converting to parent space
      root.updateWorldMatrix(true, true);

      // Calibrate once, after we're mounted into the scene graph
      if (!didCalibrateRef.current) {
        calibRef.current = new Map();
        calibByBoneRef.current = new Map();

        const parentInv = new THREE.Matrix4();
        const boneW = new THREE.Vector3();
        const childW = new THREE.Vector3();

        // Calibrate as many bones as possible by name heuristics to MediaPipe segments.
        // This won't be mathematically "1:1" (MediaPipe has 21 points), but it will drive
        // the deform finger bones consistently.
        for (const bone of bonesRef.current.values()) {
          // Only drive bones that actually affect the mesh (avoid helper/control bones)
          if (weightedBonesRef.current.size && !weightedBonesRef.current.has(bone)) continue;

          const seg = inferLandmarkSegmentForBoneName(bone.name);
          if (!seg) continue;

          const parent = bone.parent as THREE.Object3D | null;
          if (!parent) continue;

          parentInv.copy(parent.matrixWorld).invert();
          bone.getWorldPosition(boneW);
          const boneP = boneW.clone().applyMatrix4(parentInv);

          // Use first child bone direction when available; otherwise use parent->bone direction
          const childBone = bone.children.find((c) => c instanceof THREE.Bone) as THREE.Bone | undefined;
          let dir: THREE.Vector3;
          if (childBone) {
            childBone.getWorldPosition(childW);
            const childP = childW.clone().applyMatrix4(parentInv);
            dir = childP.sub(boneP);
          } else {
            dir = boneP.clone(); // parent origin is (0,0,0) in parent space
          }

          if (dir.lengthSq() < 1e-10) continue;
          dir.normalize();

          const calib = { restQuat: bone.quaternion.clone(), restDirParent: dir, a: seg.a, b: seg.b };
          calibByBoneRef.current.set(bone, calib);
        }

        // Build a stable update order: parents first so child parent-space transforms are correct.
        const depthOf = (b: THREE.Object3D) => {
          let d = 0;
          let cur: THREE.Object3D | null = b;
          while (cur?.parent) {
            d++;
            cur = cur.parent;
          }
          return d;
        };
        orderedCalibratedBonesRef.current = Array.from(calibByBoneRef.current.keys()).sort(
          (a, b) => depthOf(a) - depthOf(b)
        );

        didCalibrateRef.current = orderedCalibratedBonesRef.current.length > 0;

        if (!didLogDebugRef.current) {
          didLogDebugRef.current = true;
          console.log('[HandModelInstance] bones:', bonesRef.current.size, 'calibrated:', calibByBoneRef.current.size);
          console.log('[HandModelInstance] weightedBones:', weightedBonesRef.current.size);
        }
      }

      const tmpA = new THREE.Vector3();
      const tmpB = new THREE.Vector3();
      const tmpDir = new THREE.Vector3();
      const tmpQuat = new THREE.Quaternion();
      const targetQuat = new THREE.Quaternion();
      // Faster bone response so fingers can reach the pose
      const alphaBone = 0.7;

      // Ensure world matrices reflect the current pose before computing parent-space transforms.
      skinnedRef.current.updateWorldMatrix(true, true);

      for (const bone of orderedCalibratedBonesRef.current) {
        const calib = calibByBoneRef.current.get(bone);
        if (!calib) continue;
        const parent = bone.parent as THREE.Object3D | null;
        if (!parent) continue;

        const lmA = hand.landmarks[calib.a];
        const lmB = hand.landmarks[calib.b];
        if (!lmA || !lmB) continue;

        // Landmark positions in scene/world space
        tmpA.copy(landmarkToSceneSpace(lmA, 2));
        tmpB.copy(landmarkToSceneSpace(lmB, 2));

        // Convert both points into the bone-parent space
        const parentInv = new THREE.Matrix4().copy(parent.matrixWorld).invert();
        tmpA.applyMatrix4(parentInv);
        tmpB.applyMatrix4(parentInv);
        tmpDir.subVectors(tmpB, tmpA);
        if (tmpDir.lengthSq() < 1e-10) continue;
        tmpDir.normalize();

        // Rotate bone so its rest forward direction matches the target direction
        tmpQuat.setFromUnitVectors(calib.restDirParent, tmpDir);
        targetQuat.copy(tmpQuat).multiply(calib.restQuat);

        // Smooth
        bone.quaternion.slerp(targetQuat, alphaBone);

        // Update matrices so children compute parent-space correctly within this same frame.
        bone.updateWorldMatrix(false, false);
      }
    }
  });

  return (
    <group ref={rootRef}>
      <group position={modelPositionOffset} rotation={modelRotationOffset}>
        <primitive object={instance} />
      </group>
    </group>
  );
}

/**
 * 3D Hand Visualization Component
 * Displays hand landmarks in 3D space using Three.js
 */
export function Hand3DVisual({
  hands,
  className = '',
  onBoundingBoxes,
  overlayMode = 'skeleton',
  modelUrl = '/models/rigged_hand.glb',
}: Hand3DVisualProps) {
  const defaultModelRotationOffset: [number, number, number] = [0, 0, 0];
  // User-requested: rotate 90° clockwise around the forearm axis for the bundled rigged hand.
  // Forearm axis is the hand-local Y defined by our pose basis (wrist -> middle MCP).
  const defaultForearmTwistOffsetRad = modelUrl.includes('rigged_hand') ? -Math.PI / 2 : 0;

  return (
    <div className={`w-full h-full bg-white ${className}`}>
      <Canvas
        gl={{ 
          antialias: true, 
          alpha: false,
          powerPreference: "high-performance",
        }}
        onCreated={({ gl, scene }) => {
          gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
          // Set background color to white
          gl.setClearColor(0xffffff, 1);
        }}
      >
        <PerspectiveCamera makeDefault position={[0, 0, 2]} fov={50} />
        
        {/* Lighting */}
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 5, 5]} intensity={1} />
        <directionalLight position={[-5, -5, -5]} intensity={0.5} />
        <pointLight position={[0, 0, 5]} intensity={0.8} />
        
        {/* Skeleton / bounds tracker (kept mounted for bbox callback; can be hidden) */}
        <Hand3DModel hands={hands} onBoundingBoxes={onBoundingBoxes} showSkeleton={overlayMode === 'skeleton'} />

        {/* GLB model overlay */}
        {overlayMode === 'model' && (
          <HandModelOverlay
            hands={hands}
            modelUrl={modelUrl}
            modelRotationOffset={defaultModelRotationOffset}
            forearmTwistOffsetRad={defaultForearmTwistOffsetRad}
          />
        )}
        
        {/* Grid helper */}
        <gridHelper args={[2, 20, 0x444444, 0x222222]} />
        
        {/* Axes helper */}
        <axesHelper args={[0.5]} />
        
        {/* Orbit controls */}
        <OrbitControls
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          minDistance={1}
          maxDistance={5}
          target={[0, 0, 0]}
        />
      </Canvas>
    </div>
  );
}

// Warm the GLTF cache for the default location
useGLTF.preload('/models/rigged_hand.glb');
