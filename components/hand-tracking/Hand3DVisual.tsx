'use client';

import { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import type { Hand3DData } from './HandTracking';

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
function Hand3DModel({ hands, onBoundingBoxes }: { hands: Hand3DData[]; onBoundingBoxes?: (boxes: HandBoundingBox[]) => void }) {
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
        handGroup.visible = true;
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
      
      // Ensure hand group and all children are visible
      handGroup.visible = true;
      handGroup.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.LineSegments) {
          child.visible = true;
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
        mesh.visible = true;
        
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
          
          line.visible = true;
          
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

/**
 * 3D Hand Visualization Component
 * Displays hand landmarks in 3D space using Three.js
 */
export function Hand3DVisual({ hands, className = '', onBoundingBoxes }: Hand3DVisualProps) {
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
        
        {/* 3D Hand Model */}
        <Hand3DModel hands={hands} onBoundingBoxes={onBoundingBoxes} />
        
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
