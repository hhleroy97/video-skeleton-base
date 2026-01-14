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
// Material Definitions - 5 Materials (0-4 fingers)
// ============================================================================

const MATERIALS = [
  { color: 0x2a2a2a, name: 'Obsidian', metalness: 0.3, roughness: 0.8 },    // 0 fingers - dark matte
  { color: 0xff3333, name: 'Ruby Red', metalness: 0.9, roughness: 0.1 },     // 1 finger
  { color: 0x33ff33, name: 'Emerald Green', metalness: 0.9, roughness: 0.1 }, // 2 fingers
  { color: 0x3333ff, name: 'Sapphire Blue', metalness: 0.9, roughness: 0.1 }, // 3 fingers
  { color: 0xffd700, name: 'Gold', metalness: 1.0, roughness: 0.05 },        // 4 fingers
];

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
    const isHandControlled = rightHand !== null && rightHand.landmarks.length >= 21;
    
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
}: {
  materialIndex: number;
  geometryType: string;
  transformSpeed: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const currentColorRef = useRef(new THREE.Color(MATERIALS[0].color));
  
  useFrame((state, delta) => {
    if (!meshRef.current || !materialRef.current) return;
    
    // Gentle idle rotation
    meshRef.current.rotation.y += delta * 0.2;
    meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.5) * 0.1;
    
    // Smooth color transition
    const targetColor = new THREE.Color(MATERIALS[materialIndex]?.color ?? 0xffffff);
    currentColorRef.current.lerp(targetColor, delta * transformSpeed);
    materialRef.current.color.copy(currentColorRef.current);
    
    // Update material properties
    const mat = MATERIALS[materialIndex];
    if (mat) {
      materialRef.current.metalness = THREE.MathUtils.lerp(
        materialRef.current.metalness,
        mat.metalness,
        delta * transformSpeed
      );
      materialRef.current.roughness = THREE.MathUtils.lerp(
        materialRef.current.roughness,
        mat.roughness,
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
      <meshStandardMaterial
        ref={materialRef}
        color={MATERIALS[0].color}
        metalness={MATERIALS[0].metalness}
        roughness={MATERIALS[0].roughness}
        envMapIntensity={1.5}
      />
    </mesh>
  );
}

// ============================================================================
// UI Overlay Component
// ============================================================================

function UIOverlay({ 
  materialIndex, 
  fingerCount,
  rightHandDetected,
  leftHandDetected,
  fingerDebug,
  showDebug = false,
}: { 
  materialIndex: number;
  fingerCount: number;
  rightHandDetected: boolean;
  leftHandDetected: boolean;
  fingerDebug: FingerDebugInfo | null;
  showDebug?: boolean;
}) {
  return (
    <div className="absolute top-4 left-4 z-10 space-y-2">
      {/* Material indicator */}
      <div className="bg-black/70 backdrop-blur-sm rounded-lg p-3 text-white">
        <div className="text-xs text-gray-400 mb-1">
          Left Hand: {leftHandDetected ? `${fingerCount} finger${fingerCount !== 1 ? 's' : ''}` : 'Not detected'}
        </div>
        <div className="flex items-center gap-2">
          <div 
            className="w-6 h-6 rounded-full border-2 border-white"
            style={{ backgroundColor: `#${MATERIALS[materialIndex]?.color.toString(16).padStart(6, '0')}` }}
          />
          <span className="text-sm font-medium">{MATERIALS[materialIndex]?.name ?? 'Unknown'}</span>
        </div>
      </div>
      
      {/* Material palette */}
      <div className="bg-black/70 backdrop-blur-sm rounded-lg p-3">
        <div className="text-xs text-gray-400 mb-2">Materials (show 0-4 fingers)</div>
        <div className="flex gap-2">
          {MATERIALS.map((mat, idx) => (
            <div
              key={idx}
              className={`w-8 h-8 rounded-full border-2 transition-all ${
                idx === materialIndex ? 'border-white scale-110' : 'border-gray-600'
              }`}
              style={{ backgroundColor: `#${mat.color.toString(16).padStart(6, '0')}` }}
              title={`${idx} finger${idx !== 1 ? 's' : ''}: ${mat.name}`}
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
      {showDebug && fingerDebug && (
        <div className="bg-black/70 backdrop-blur-sm rounded-lg p-3 text-white font-mono text-xs">
          <div className="text-gray-400 mb-2">Finger Debug ({fingerDebug.handedness})</div>
          <div className="space-y-1">
            <div className={fingerDebug.index.extended ? 'text-green-400' : 'text-red-400'}>
              Index: tip={fingerDebug.index.tip.toFixed(3)} pip={fingerDebug.index.pip.toFixed(3)} {fingerDebug.index.extended ? '✓' : '✗'}
            </div>
            <div className={fingerDebug.middle.extended ? 'text-green-400' : 'text-red-400'}>
              Middle: tip={fingerDebug.middle.tip.toFixed(3)} pip={fingerDebug.middle.pip.toFixed(3)} {fingerDebug.middle.extended ? '✓' : '✗'}
            </div>
            <div className={fingerDebug.ring.extended ? 'text-green-400' : 'text-red-400'}>
              Ring: tip={fingerDebug.ring.tip.toFixed(3)} pip={fingerDebug.ring.pip.toFixed(3)} {fingerDebug.ring.extended ? '✓' : '✗'}
            </div>
            <div className={fingerDebug.pinky.extended ? 'text-green-400' : 'text-red-400'}>
              Pinky: tip={fingerDebug.pinky.tip.toFixed(3)} pip={fingerDebug.pinky.pip.toFixed(3)} {fingerDebug.pinky.extended ? '✓' : '✗'}
            </div>
            <div className="mt-2 text-white">Total: {fingerDebug.count} fingers extended</div>
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
  fingerCount: number;
  rightHandDetected: boolean;
  leftHandDetected: boolean;
  fingerDebug: FingerDebugInfo | null;
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
    // Count fingers on left hand (or first hand) to select material
    let fingerCount = 0;
    let fingerDebug: FingerDebugInfo | null = null;
    
    // Use leftHand (which has fallback logic applied above)
    if (leftHand && leftHand.landmarks.length >= 21) {
      const result = countExtendedFingers(leftHand.landmarks, leftHand.handedness);
      fingerCount = result.count;
      fingerDebug = result.debug;
    }
    
    // Map finger count to material index (0-4 fingers = materials 0-4)
    // 0 fingers = obsidian, 1 = red, 2 = green, 3 = blue, 4 = gold
    let newMaterialIndex = materialIndexRef.current;
    const previousIndex = materialIndexRef.current;
    if (leftHand && fingerCount >= 0 && fingerCount <= 4) {
      newMaterialIndex = fingerCount;
      materialIndexRef.current = newMaterialIndex;
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
      fingerCount,
      rightHandDetected: rightHand !== null,
      leftHandDetected: leftHand !== null,
      fingerDebug,
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
    fingerCount: 0,
    rightHandDetected: false,
    leftHandDetected: false,
    fingerDebug: null,
    isTransitioning: false,
  });
  
  return (
    <div className={`w-full h-full bg-gradient-to-b from-gray-900 to-gray-800 relative ${className}`}>
      {/* UI Overlay */}
      <UIOverlay 
        materialIndex={uiState.materialIndex}
        fingerCount={uiState.fingerCount}
        rightHandDetected={uiState.rightHandDetected}
        leftHandDetected={uiState.leftHandDetected}
        fingerDebug={uiState.fingerDebug}
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
