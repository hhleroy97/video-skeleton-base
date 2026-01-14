'use client';

import React, { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import type { Hand3DData } from './HandTracking';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface MidasTouchControls {
  baseRoughness: number;
  transformSpeed: number;
  particleCount: number;
  particleSize: number;
  glowIntensity: number;
  autoRotateSpeed: number;
  geometryType: 'torusKnot' | 'icosahedron' | 'sphere' | 'dodecahedron';
}

export const DEFAULT_MIDAS_TOUCH_CONTROLS: MidasTouchControls = {
  baseRoughness: 0.95,
  transformSpeed: 2.5,
  particleCount: 250,
  particleSize: 0.018,
  glowIntensity: 0.8,
  autoRotateSpeed: 0.15,
  geometryType: 'torusKnot',
};

interface MidasTouchVisualProps {
  hands: Hand3DData[];
  className?: string;
  controls?: MidasTouchControls;
}

// ============================================================================
// Material Definitions - 4 Materials (1-4 fingers)
// 0 fingers = "no change" (keep current material)
// ============================================================================

export interface MidasMaterialPreset {
  name: string;
  /** Base albedo color for the object + particles */
  color: number;
  /** PBR core */
  metalness: number;
  roughness: number;
  /** Environment reflection contribution */
  envMapIntensity?: number;
  /** Physical extras (only used by MeshPhysicalMaterial, but safe to keep unified) */
  transmission?: number; // 0..1 (glassiness)
  ior?: number;          // ~1.0..2.5
  thickness?: number;    // 0.. (scene units; small values are fine)
  opacity?: number;      // 0..1 (used when transparent)
  /** Emissive (for neon/self-lit looks) */
  emissive?: number;
  emissiveIntensity?: number;
  /** Volumetric tint for transmissive materials (MeshPhysicalMaterial) */
  attenuationColor?: number;
  attenuationDistance?: number;
}

/**
 * Material presets for Midas Touch (viz7).
 *
 * 4-slot palette:
 * - 1: Ceramic/Porcelain (non-metal, clean highlights)
 * - 2: Brushed metal (satin reflections)
 * - 3: Frosted glass (transmission + roughness)
 * - 4: Neon emissive (self-lit glow)
 *
 * Note: 0 fingers intentionally does not map to a preset; it means "hold current".
 */
export const MIDAS_TOUCH_MATERIAL_PRESETS: readonly MidasMaterialPreset[] = [
  // 1 finger
  {
    name: 'Ceramic Porcelain',
    color: 0xf2f2f2,
    metalness: 0.0,
    roughness: 0.28,
    envMapIntensity: 0.8,
  },
  // 2 fingers
  {
    name: 'Brushed Metal',
    color: 0xb3bcc8,
    metalness: 1.0,
    roughness: 0.42,
    envMapIntensity: 1.25,
  },
  // 3 fingers (updated)
  {
    name: 'Frosted Glass',
    color: 0xbfe8ff,
    metalness: 0.0,
    roughness: 0.78,
    envMapIntensity: 1.15,
    transmission: 1.0,
    ior: 1.52,
    thickness: 1.1,
    opacity: 1.0,
    attenuationColor: 0x7fc7ff,
    attenuationDistance: 1.25,
  },
  // 4 fingers
  {
    name: 'Neon Emissive',
    color: 0xff2fc7,
    metalness: 0.1,
    roughness: 0.35,
    envMapIntensity: 0.6,
    emissive: 0xff2fc7,
    emissiveIntensity: 2.25,
  },
] as const;

const MATERIALS = MIDAS_TOUCH_MATERIAL_PRESETS;

// ============================================================================
// Finger Counting Utility (MediaPipe best practice)
// ============================================================================

export interface FingerDebugInfo {
  index: { tip: number; pip: number; extended: boolean };
  middle: { tip: number; pip: number; extended: boolean };
  ring: { tip: number; pip: number; extended: boolean };
  pinky: { tip: number; pip: number; extended: boolean };
  count: number;
  handedness: string;
}

export function countExtendedFingers(
  landmarks: { x: number; y: number; z: number }[],
  handedness: 'Left' | 'Right' | 'Unknown' = 'Unknown'
): { count: number; debug: FingerDebugInfo } {
  const emptyDebug: FingerDebugInfo = {
    index: { tip: 0, pip: 0, extended: false },
    middle: { tip: 0, pip: 0, extended: false },
    ring: { tip: 0, pip: 0, extended: false },
    pinky: { tip: 0, pip: 0, extended: false },
    count: 0,
    handedness,
  };
  
  if (landmarks.length < 21) return { count: 0, debug: emptyDebug };
  
  // MediaPipe finger counting algorithm (from documentation):
  // - For fingers (not thumb): compare tip.y to pip.y
  // - If tip.y < pip.y, finger is extended (y=0 is top of image)
  //
  // Landmark indices:
  // Tips: 8 (index), 12 (middle), 16 (ring), 20 (pinky)
  // PIPs: 6 (index), 10 (middle), 14 (ring), 18 (pinky)
  
  let count = 0;
  
  // Index finger (tip 8, pip 6)
  const indexTip = landmarks[8];
  const indexPip = landmarks[6];
  const indexExtended = indexTip && indexPip && indexTip.y < indexPip.y;
  if (indexExtended) count++;
  
  // Middle finger (tip 12, pip 10)
  const middleTip = landmarks[12];
  const middlePip = landmarks[10];
  const middleExtended = middleTip && middlePip && middleTip.y < middlePip.y;
  if (middleExtended) count++;
  
  // Ring finger (tip 16, pip 14)
  const ringTip = landmarks[16];
  const ringPip = landmarks[14];
  const ringExtended = ringTip && ringPip && ringTip.y < ringPip.y;
  if (ringExtended) count++;
  
  // Pinky finger (tip 20, pip 18)
  const pinkyTip = landmarks[20];
  const pinkyPip = landmarks[18];
  const pinkyExtended = pinkyTip && pinkyPip && pinkyTip.y < pinkyPip.y;
  if (pinkyExtended) count++;
  
  const debug: FingerDebugInfo = {
    index: { 
      tip: indexTip?.y ?? 0, 
      pip: indexPip?.y ?? 0, 
      extended: indexExtended ?? false 
    },
    middle: { 
      tip: middleTip?.y ?? 0, 
      pip: middlePip?.y ?? 0, 
      extended: middleExtended ?? false 
    },
    ring: { 
      tip: ringTip?.y ?? 0, 
      pip: ringPip?.y ?? 0, 
      extended: ringExtended ?? false 
    },
    pinky: { 
      tip: pinkyTip?.y ?? 0, 
      pip: pinkyPip?.y ?? 0, 
      extended: pinkyExtended ?? false 
    },
    count,
    handedness,
  };
  
  return { count, debug };
}

/**
 * Returns true when the "movement" hand (camera-control hand) is actively tracked.
 * In this visual, that means: we have a hand object and a full landmark set (21+).
 */
export function isMovementHandActive(hand: Hand3DData | null): boolean {
  return !!hand && Array.isArray(hand.landmarks) && hand.landmarks.length >= 21;
}

export type MaterialStepAction = 'prev' | 'next';

export interface MaterialStepDebug {
  thumbIndexDistance: number | null;
  thumbMiddleDistance: number | null;
  indexPinched: boolean;
  middlePinched: boolean;
  detected: MaterialStepAction | null;
}

function landmarkDistance(
  landmarks: Array<{ x: number; y: number; z: number }>,
  a: number,
  b: number
): number | null {
  const p1 = landmarks[a];
  const p2 = landmarks[b];
  if (!p1 || !p2) return null;
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const dz = (p1.z ?? 0) - (p2.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Detect discrete "step" gestures on a single hand:
 * - thumb + index tip = previous material
 * - thumb + middle tip = next material
 *
 * Landmarks are MediaPipe normalized coords; thresholds are also in that space.
 */
export function detectMaterialStepAction(
  landmarks: Array<{ x: number; y: number; z: number }>,
  pinchThreshold:
    | number
    | {
        /** Thumb+index pinch distance threshold (normalized coords). */
        indexThreshold?: number;
        /** Thumb+middle pinch distance threshold (normalized coords). */
        middleThreshold?: number;
      } = 0.05
): { action: MaterialStepAction | null; debug: MaterialStepDebug } {
  if (!Array.isArray(landmarks) || landmarks.length < 21) {
    return {
      action: null,
      debug: {
        thumbIndexDistance: null,
        thumbMiddleDistance: null,
        indexPinched: false,
        middlePinched: false,
        detected: null,
      },
    };
  }

  const indexThreshold =
    typeof pinchThreshold === 'number' ? pinchThreshold : pinchThreshold.indexThreshold ?? 0.05;
  // Slightly more permissive by default; middle-tip pinch tends to read "farther" in practice.
  const middleThreshold =
    typeof pinchThreshold === 'number' ? pinchThreshold : pinchThreshold.middleThreshold ?? 0.065;

  // MediaPipe indices: thumb tip 4, index tip 8, middle tip 12
  const thumbIndexDistance = landmarkDistance(landmarks, 4, 8);
  const thumbMiddleDistance = landmarkDistance(landmarks, 4, 12);

  const isIndexPinch = thumbIndexDistance !== null && thumbIndexDistance < indexThreshold;
  const isMiddlePinch = thumbMiddleDistance !== null && thumbMiddleDistance < middleThreshold;

  let action: MaterialStepAction | null = null;
  if (isIndexPinch && isMiddlePinch) {
    // If both are "pinched", choose the closer one to avoid ambiguity.
    action =
      (thumbIndexDistance ?? Infinity) <= (thumbMiddleDistance ?? Infinity) ? 'prev' : 'next';
  } else if (isIndexPinch) {
    action = 'prev';
  } else if (isMiddlePinch) {
    action = 'next';
  }

  return {
    action,
    debug: {
      thumbIndexDistance,
      thumbMiddleDistance,
      indexPinched: isIndexPinch,
      middlePinched: isMiddlePinch,
      detected: action,
    },
  };
}

// ============================================================================
// Camera Controller Component
// ============================================================================

function CameraController({ 
  rightHand,
  autoRotateSpeed,
}: { 
  rightHand: Hand3DData | null;
  autoRotateSpeed: number;
}) {
  const { camera } = useThree();
  const targetAngleXRef = useRef(0);
  const targetAngleYRef = useRef(0.3);
  const currentAngleXRef = useRef(0);
  const currentAngleYRef = useRef(0.3);
  const wasHandControlledRef = useRef(false);
  
  useFrame((state, delta) => {
    const radius = 3;
    const baseHeight = 1;
    const isHandControlled = isMovementHandActive(rightHand);
    
    if (isHandControlled) {
      // Hand detected - control camera with hand position
      const wrist = rightHand.landmarks[0];
      const middleTip = rightHand.landmarks[12];
      
      // Use hand position to control camera orbit
      // X position (0-1) maps to horizontal angle
      // Y position (0-1) maps to vertical angle
      const handX = (wrist.x + middleTip.x) / 2;
      const handY = (wrist.y + middleTip.y) / 2;
      
      targetAngleXRef.current = (handX - 0.5) * Math.PI * 2;
      targetAngleYRef.current = (0.5 - handY) * Math.PI * 0.5; // Limit vertical to avoid flipping
      wasHandControlledRef.current = true;
    } else {
      // No hand - auto rotate from current position
      // Only auto-rotate, don't jump to a different angle
      targetAngleXRef.current += delta * autoRotateSpeed;
      // Keep vertical angle where it was (don't reset to 0.3)
    }
    
    // Smooth interpolation
    currentAngleXRef.current = THREE.MathUtils.lerp(currentAngleXRef.current, targetAngleXRef.current, 0.05);
    currentAngleYRef.current = THREE.MathUtils.lerp(currentAngleYRef.current, targetAngleYRef.current, 0.05);
    
    // Calculate camera position on sphere around origin
    const x = radius * Math.cos(currentAngleYRef.current) * Math.sin(currentAngleXRef.current);
    const y = baseHeight + radius * Math.sin(currentAngleYRef.current);
    const z = radius * Math.cos(currentAngleYRef.current) * Math.cos(currentAngleXRef.current);
    
    camera.position.set(x, y, z);
    camera.lookAt(0, 0, 0);
  });
  
  return null;
}

// ============================================================================
// Spark Particles Component
// ============================================================================

function SparkParticles({
  materialIndex,
  particleCount,
  particleSize,
  objectRadius,
  isTransitioning,
}: {
  materialIndex: number;
  particleCount: number;
  particleSize: number;
  objectRadius: number;
  isTransitioning: boolean;
}) {
  const pointsRef = useRef<THREE.Points>(null);
  const velocitiesRef = useRef<Float32Array | null>(null);
  const lifetimesRef = useRef<Float32Array | null>(null);
  const prevMaterialRef = useRef(materialIndex);
  const opacityRef = useRef(0);

  const { positions, colors } = useMemo(() => {
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    
    velocitiesRef.current = new Float32Array(particleCount * 3);
    lifetimesRef.current = new Float32Array(particleCount);
    
    for (let i = 0; i < particleCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = objectRadius * (0.9 + Math.random() * 0.2);
      
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      
      velocitiesRef.current[i * 3] = (Math.random() - 0.5) * 0.02;
      velocitiesRef.current[i * 3 + 1] = (Math.random() - 0.5) * 0.02;
      velocitiesRef.current[i * 3 + 2] = (Math.random() - 0.5) * 0.02;
      
      lifetimesRef.current[i] = Math.random();
      
      colors[i * 3] = 1.0;
      colors[i * 3 + 1] = 1.0;
      colors[i * 3 + 2] = 1.0;
    }
    
    return { positions, colors };
  }, [particleCount, objectRadius]);

  const materialRef = useRef<THREE.PointsMaterial>(null);

  useFrame((state, delta) => {
    if (!pointsRef.current || !velocitiesRef.current || !lifetimesRef.current || !materialRef.current) return;
    
    // Fade opacity based on transition state
    const targetOpacity = isTransitioning ? 0.9 : 0;
    opacityRef.current = THREE.MathUtils.lerp(opacityRef.current, targetOpacity, delta * 5);
    materialRef.current.opacity = opacityRef.current;
    
    // Only animate particles when visible
    if (opacityRef.current < 0.01) return;
    
    const posAttr = pointsRef.current.geometry.getAttribute('position') as THREE.BufferAttribute;
    const colAttr = pointsRef.current.geometry.getAttribute('color') as THREE.BufferAttribute;
    
    // Burst activity when material changes
    const materialChanged = prevMaterialRef.current !== materialIndex;
    if (materialChanged) {
      prevMaterialRef.current = materialIndex;
    }
    
    const matColor = new THREE.Color(MATERIALS[materialIndex]?.color ?? 0xffffff);
    
    for (let i = 0; i < particleCount; i++) {
      lifetimesRef.current[i] -= delta * 0.8;
      
      if (lifetimesRef.current[i] <= 0 || materialChanged) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = objectRadius * (0.95 + Math.random() * 0.1);
        
        posAttr.setXYZ(
          i,
          r * Math.sin(phi) * Math.cos(theta),
          r * Math.sin(phi) * Math.sin(theta),
          r * Math.cos(phi)
        );
        
        const burstSpeed = materialChanged ? 0.08 : 0.03;
        velocitiesRef.current[i * 3] = (posAttr.getX(i) / r) * burstSpeed;
        velocitiesRef.current[i * 3 + 1] = (posAttr.getY(i) / r) * burstSpeed + 0.02;
        velocitiesRef.current[i * 3 + 2] = (posAttr.getZ(i) / r) * burstSpeed;
        
        lifetimesRef.current[i] = 0.5 + Math.random() * 0.5;
      }
      
      const x = posAttr.getX(i) + velocitiesRef.current[i * 3];
      const y = posAttr.getY(i) + velocitiesRef.current[i * 3 + 1];
      const z = posAttr.getZ(i) + velocitiesRef.current[i * 3 + 2];
      posAttr.setXYZ(i, x, y, z);
      
      const life = lifetimesRef.current[i];
      const brightness = life * 1.5;
      colAttr.setXYZ(i, matColor.r * brightness, matColor.g * brightness, matColor.b * brightness);
    }
    
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particleCount}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={particleCount}
          array={colors}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        ref={materialRef}
        size={particleSize}
        vertexColors
        transparent
        opacity={0}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

// ============================================================================
// Main Object Component
// ============================================================================

function TransformingObject({
  materialIndex,
  geometryType,
  transformSpeed,
  baseRoughness,
  glowIntensity,
  freezeRotation,
}: {
  materialIndex: number;
  geometryType: string;
  transformSpeed: number;
  baseRoughness: number;
  glowIntensity: number;
  freezeRotation: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const currentColorRef = useRef(new THREE.Color(MATERIALS[0].color));
  const currentEmissiveRef = useRef(new THREE.Color(0x000000));
  const DEFAULT_ATTENUATION_DISTANCE = 1000; // large finite value; avoids Infinity->NaN lerp issues
  
  useFrame((state, delta) => {
    if (!meshRef.current || !materialRef.current) return;
    
    // Gentle idle rotation (disabled while the movement hand is controlling the camera)
    if (!freezeRotation) {
      meshRef.current.rotation.y += delta * 0.2;
      meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.5) * 0.1;
    }
    
    // Smooth color transition
    const targetColor = new THREE.Color(MATERIALS[materialIndex]?.color ?? 0xffffff);
    currentColorRef.current.lerp(targetColor, delta * transformSpeed);
    materialRef.current.color.copy(currentColorRef.current);
    
    // Update material properties
    const mat = MATERIALS[materialIndex];
    if (mat) {
      const targetRoughness = THREE.MathUtils.clamp(mat.roughness * baseRoughness, 0, 1);
      const targetMetalness = THREE.MathUtils.clamp(mat.metalness, 0, 1);

      materialRef.current.metalness = THREE.MathUtils.lerp(
        materialRef.current.metalness,
        targetMetalness,
        delta * transformSpeed
      );
      materialRef.current.roughness = THREE.MathUtils.lerp(
        materialRef.current.roughness,
        targetRoughness,
        delta * transformSpeed
      );

      const targetEnvIntensity = mat.envMapIntensity ?? 1.0;
      materialRef.current.envMapIntensity = THREE.MathUtils.lerp(
        materialRef.current.envMapIntensity ?? targetEnvIntensity,
        targetEnvIntensity,
        delta * transformSpeed
      );

      // Physical transmission (glass) + opacity/transparent toggles
      const targetTransmission = THREE.MathUtils.clamp(mat.transmission ?? 0, 0, 1);
      const targetOpacity = THREE.MathUtils.clamp(mat.opacity ?? 1, 0, 1);
      const targetIor = THREE.MathUtils.clamp(mat.ior ?? 1.5, 1.0, 2.5);
      const targetThickness = Math.max(0, mat.thickness ?? 0);
      const targetAttenuationColor = new THREE.Color(mat.attenuationColor ?? 0xffffff);
      const targetAttenuationDistance = Math.max(0, mat.attenuationDistance ?? DEFAULT_ATTENUATION_DISTANCE);

      materialRef.current.transmission = THREE.MathUtils.lerp(
        materialRef.current.transmission ?? 0,
        targetTransmission,
        delta * transformSpeed
      );
      materialRef.current.opacity = THREE.MathUtils.lerp(
        materialRef.current.opacity ?? 1,
        targetOpacity,
        delta * transformSpeed
      );
      materialRef.current.ior = THREE.MathUtils.lerp(
        materialRef.current.ior ?? 1.5,
        targetIor,
        delta * transformSpeed
      );
      materialRef.current.thickness = THREE.MathUtils.lerp(
        materialRef.current.thickness ?? 0,
        targetThickness,
        delta * transformSpeed
      );
      materialRef.current.attenuationColor.lerp(targetAttenuationColor, delta * transformSpeed);
      // IMPORTANT: never lerp with Infinity; it produces NaN and can "poison" the whole material.
      const currentAttenuationDistance =
        Number.isFinite(materialRef.current.attenuationDistance)
          ? materialRef.current.attenuationDistance
          : DEFAULT_ATTENUATION_DISTANCE;
      materialRef.current.attenuationDistance = Number.isFinite(targetAttenuationDistance)
        ? THREE.MathUtils.lerp(currentAttenuationDistance, targetAttenuationDistance, delta * transformSpeed)
        : DEFAULT_ATTENUATION_DISTANCE;

      const wantsTransparency = targetTransmission > 0.01 || targetOpacity < 0.99;
      materialRef.current.transparent = wantsTransparency;
      materialRef.current.depthWrite = !wantsTransparency;

      // Emissive (neon): lerp color + intensity, scale by glowIntensity control
      const targetEmissiveColor = new THREE.Color(mat.emissive ?? 0x000000);
      currentEmissiveRef.current.lerp(targetEmissiveColor, delta * transformSpeed);
      materialRef.current.emissive.copy(currentEmissiveRef.current);

      const targetEmissiveIntensity = (mat.emissiveIntensity ?? 0) * THREE.MathUtils.clamp(glowIntensity, 0, 2);
      materialRef.current.emissiveIntensity = THREE.MathUtils.lerp(
        materialRef.current.emissiveIntensity ?? 0,
        targetEmissiveIntensity,
        delta * transformSpeed
      );
    }
  });
  
  return (
    <mesh ref={meshRef}>
      {geometryType === 'torusKnot' && (
        <torusKnotGeometry args={[0.5, 0.2, 128, 32]} />
      )}
      {geometryType === 'icosahedron' && (
        <icosahedronGeometry args={[0.7, 1]} />
      )}
      {geometryType === 'sphere' && (
        <sphereGeometry args={[0.6, 64, 64]} />
      )}
      {geometryType === 'dodecahedron' && (
        <dodecahedronGeometry args={[0.6, 0]} />
      )}
      <meshPhysicalMaterial
        ref={materialRef}
        color={MATERIALS[0].color}
        metalness={MATERIALS[0].metalness}
        roughness={MATERIALS[0].roughness}
        envMapIntensity={MATERIALS[0].envMapIntensity ?? 1.0}
        transmission={MATERIALS[0].transmission ?? 0}
        ior={MATERIALS[0].ior ?? 1.5}
        thickness={MATERIALS[0].thickness ?? 0}
        opacity={MATERIALS[0].opacity ?? 1}
        emissive={MATERIALS[0].emissive ?? 0x000000}
        emissiveIntensity={MATERIALS[0].emissiveIntensity ?? 0}
        attenuationColor={MATERIALS[0].attenuationColor ?? 0xffffff}
        attenuationDistance={MATERIALS[0].attenuationDistance ?? DEFAULT_ATTENUATION_DISTANCE}
      />
    </mesh>
  );
}

// ============================================================================
// UI Overlay Component
// ============================================================================

function UIOverlay({ 
  materialIndex, 
  rightHandDetected,
  leftHandDetected,
  lastStepAction,
  stepDebug,
  showDebug = false,
}: { 
  materialIndex: number;
  rightHandDetected: boolean;
  leftHandDetected: boolean;
  lastStepAction: MaterialStepAction | null;
  stepDebug: MaterialStepDebug | null;
  showDebug?: boolean;
}) {
  return (
    <div className="absolute top-4 left-4 z-10 space-y-2">
      {/* Material indicator */}
      <div className="bg-black/70 backdrop-blur-sm rounded-lg p-3 text-white">
        <div className="text-xs text-gray-400 mb-1">
          Left Hand: {leftHandDetected ? 'Detected' : 'Not detected'}
        </div>
        <div className="flex items-center gap-2">
          <div 
            className="w-6 h-6 rounded-full border-2 border-white"
            style={{ backgroundColor: `#${MATERIALS[materialIndex]?.color.toString(16).padStart(6, '0')}` }}
          />
          <span className="text-sm font-medium">{MATERIALS[materialIndex]?.name ?? 'Unknown'}</span>
        </div>
        <div className="mt-2 text-xs text-gray-300">
          <div>Index+Thumb: Prev</div>
          <div>Middle+Thumb: Next</div>
          {lastStepAction && (
            <div className="mt-1 text-white">
              Last: {lastStepAction === 'prev' ? 'Prev' : 'Next'}
            </div>
          )}
        </div>
      </div>
      
      {/* Material palette */}
      <div className="bg-black/70 backdrop-blur-sm rounded-lg p-3">
        <div className="text-xs text-gray-400 mb-2">Materials (show 1-4 fingers)</div>
        <div className="flex gap-2">
          {MATERIALS.map((mat, idx) => (
            <div
              key={idx}
              className={`w-8 h-8 rounded-full border-2 transition-all ${
                idx === materialIndex ? 'border-white scale-110' : 'border-gray-600'
              }`}
              style={{ backgroundColor: `#${mat.color.toString(16).padStart(6, '0')}` }}
              title={`${idx + 1} finger${idx + 1 !== 1 ? 's' : ''}: ${mat.name}`}
            />
          ))}
        </div>
      </div>
      
      {/* Camera control indicator */}
      <div className="bg-black/70 backdrop-blur-sm rounded-lg p-3 text-white">
        <div className="text-xs text-gray-400 mb-1">Right Hand: Camera</div>
        <div className="text-sm">
          {rightHandDetected ? '🎥 Controlling camera' : '🔄 Auto-rotating'}
        </div>
      </div>
      
      {/* Debug info */}
      {showDebug && stepDebug && (
        <div className="bg-black/70 backdrop-blur-sm rounded-lg p-3 text-white font-mono text-xs">
          <div className="text-gray-400 mb-2">Gesture Debug</div>
          <div className="space-y-1">
            <div>
              thumb-index: {stepDebug.thumbIndexDistance === null ? 'n/a' : stepDebug.thumbIndexDistance.toFixed(4)}
            </div>
            <div>
              thumb-middle: {stepDebug.thumbMiddleDistance === null ? 'n/a' : stepDebug.thumbMiddleDistance.toFixed(4)}
            </div>
            <div className="mt-2 text-white">
              Detected: {stepDebug.detected ?? 'none'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Scene Component
// ============================================================================

export interface MidasTouchState {
  materialIndex: number;
  rightHandDetected: boolean;
  leftHandDetected: boolean;
  lastStepAction: MaterialStepAction | null;
  stepDebug: MaterialStepDebug | null;
  isTransitioning: boolean;
}

function MidasTouchScene({ 
  hands, 
  controls,
  materialIndex,
  isTransitioning,
  onStateChange,
}: { 
  hands: Hand3DData[]; 
  controls: MidasTouchControls;
  materialIndex: number;
  isTransitioning: boolean;
  onStateChange: (state: MidasTouchState) => void;
}) {
  const materialIndexRef = useRef(materialIndex);
  const transitionTimeRef = useRef(0);
  const TRANSITION_DURATION = 0.8; // seconds to show particles after material change
  const lastStepActionRef = useRef<MaterialStepAction | null>(null);
  const stepCooldownRef = useRef(0);
  const prevIndexPinchedRef = useRef(false);
  const prevMiddlePinchedRef = useRef(false);
  
  // Find left and right hands
  // Note: MediaPipe handedness is often "Unknown", so we use fallback logic
  let leftHand = hands.find(h => h.handedness === 'Left') ?? null;
  let rightHand = hands.find(h => h.handedness === 'Right') ?? null;
  
  // Fallback: if no explicit handedness, use first hand as "left" (material control)
  // and second hand as "right" (camera control)
  if (!leftHand && !rightHand && hands.length > 0) {
    leftHand = hands[0] ?? null;
    rightHand = hands[1] ?? null;
  } else if (!leftHand && hands.length > 1) {
    leftHand = hands.find(h => h !== rightHand) ?? null;
  } else if (!rightHand && hands.length > 1) {
    rightHand = hands.find(h => h !== leftHand) ?? null;
  }
  
  useFrame((state, delta) => {
    // Gesture stepping on left hand (or first hand)
    let stepDebug: MaterialStepDebug | null = null;

    // Countdown cooldown (prevents rapid stepping while held)
    if (stepCooldownRef.current > 0) {
      stepCooldownRef.current = Math.max(0, stepCooldownRef.current - delta);
    }

    let newMaterialIndex = materialIndexRef.current;
    const previousIndex = materialIndexRef.current;

    if (leftHand && leftHand.landmarks.length >= 21) {
      const { action, debug } = detectMaterialStepAction(leftHand.landmarks, {
        indexThreshold: 0.05,
        middleThreshold: 0.075,
      });
      stepDebug = debug;

      // Rising-edge trigger per pinch type (more reliable than "release both").
      const indexRising = debug.indexPinched && !prevIndexPinchedRef.current;
      const middleRising = debug.middlePinched && !prevMiddlePinchedRef.current;

      let stepAction: MaterialStepAction | null = null;
      if (indexRising && middleRising) {
        // If both trigger together, choose closer.
        stepAction =
          (debug.thumbIndexDistance ?? Infinity) <= (debug.thumbMiddleDistance ?? Infinity)
            ? 'prev'
            : 'next';
      } else if (indexRising) {
        stepAction = 'prev';
      } else if (middleRising) {
        stepAction = 'next';
      }

      if (stepAction && stepCooldownRef.current === 0) {
        const step = stepAction === 'next' ? 1 : -1;
        const len = MATERIALS.length;
        newMaterialIndex = ((previousIndex + step) % len + len) % len;
        materialIndexRef.current = newMaterialIndex;
        lastStepActionRef.current = stepAction;
        stepCooldownRef.current = 0.22;
      }

      // Update previous pinch states AFTER computing rising edges.
      prevIndexPinchedRef.current = debug.indexPinched;
      prevMiddlePinchedRef.current = debug.middlePinched;
    }
    
    // Track transition state - trigger particles when material changes
    if (newMaterialIndex !== previousIndex) {
      transitionTimeRef.current = TRANSITION_DURATION;
    }
    
    // Count down transition timer
    if (transitionTimeRef.current > 0) {
      transitionTimeRef.current -= delta;
    }
    
    const isTransitioning = transitionTimeRef.current > 0;
    
    // Report state for UI (this triggers React state update)
    onStateChange({
      materialIndex: newMaterialIndex,
      rightHandDetected: rightHand !== null,
      leftHandDetected: leftHand !== null,
      lastStepAction: lastStepActionRef.current,
      stepDebug,
      isTransitioning,
    });
  });
  
  const objectRadius = useMemo(() => {
    switch (controls.geometryType) {
      case 'torusKnot': return 0.7;
      case 'icosahedron': return 0.7;
      case 'sphere': return 0.6;
      case 'dodecahedron': return 0.6;
      default: return 0.7;
    }
  }, [controls.geometryType]);

  const movementHandActive = isMovementHandActive(rightHand);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.3} />
      <directionalLight position={[5, 5, 5]} intensity={1.5} />
      <directionalLight position={[-5, 3, -5]} intensity={0.8} color="#aaccff" />
      <pointLight position={[0, 3, 0]} intensity={1} color="#ffffff" />
      <spotLight position={[0, 5, 0]} angle={0.5} penumbra={0.5} intensity={0.5} />
      <Environment preset="studio" />
      
      {/* Camera controller */}
      <CameraController 
        rightHand={rightHand} 
        autoRotateSpeed={controls.autoRotateSpeed}
      />
      
      {/* Main object - use prop materialIndex for React reactivity */}
      <TransformingObject 
        materialIndex={materialIndex}
        geometryType={controls.geometryType}
        transformSpeed={controls.transformSpeed}
        baseRoughness={controls.baseRoughness}
        glowIntensity={controls.glowIntensity}
        freezeRotation={movementHandActive}
      />
      
      {/* Spark particles - only visible during material transitions */}
      <SparkParticles
        materialIndex={materialIndex}
        particleCount={controls.particleCount}
        particleSize={controls.particleSize}
        objectRadius={objectRadius}
        isTransitioning={isTransitioning}
      />
      
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.2, 0]}>
        <planeGeometry args={[15, 15]} />
        <meshStandardMaterial color="#1a1a2e" roughness={0.8} metalness={0.2} />
      </mesh>
    </>
  );
}

// ============================================================================
// Main Export Component
// ============================================================================

export function MidasTouchVisual({ hands, className = '', controls }: MidasTouchVisualProps) {
  const mergedControls = useMemo(
    () => ({ ...DEFAULT_MIDAS_TOUCH_CONTROLS, ...(controls ?? {}) }),
    [controls]
  );
  
  const [uiState, setUiState] = useState<MidasTouchState>({
    materialIndex: 0,
    rightHandDetected: false,
    leftHandDetected: false,
    lastStepAction: null,
    stepDebug: null,
    isTransitioning: false,
  });
  
  return (
    <div className={`w-full h-full bg-gradient-to-b from-gray-900 to-gray-800 relative ${className}`}>
      {/* UI Overlay */}
      <UIOverlay 
        materialIndex={uiState.materialIndex}
        rightHandDetected={uiState.rightHandDetected}
        leftHandDetected={uiState.leftHandDetected}
        lastStepAction={uiState.lastStepAction}
        stepDebug={uiState.stepDebug}
        showDebug={false}
      />
      
      <Canvas
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0,
        }}
        onCreated={({ gl }) => {
          gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
          gl.setClearColor(0x0a0a15, 1);
        }}
      >
        <PerspectiveCamera makeDefault position={[0, 1, 3]} fov={50} />
        <MidasTouchScene
          hands={hands}
          controls={mergedControls}
          materialIndex={uiState.materialIndex}
          isTransitioning={uiState.isTransitioning}
          onStateChange={setUiState}
        />
      </Canvas>
    </div>
  );
}
