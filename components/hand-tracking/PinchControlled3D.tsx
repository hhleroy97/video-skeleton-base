'use client';

import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import type { PinchVector } from './HandTracking';

interface PinchControlled3DProps {
  vector: PinchVector | null;
  className?: string;
}

/**
 * Simple cube that rotates based on relative pinch movement with momentum
 */
function RotatingCube({ vector }: { vector: PinchVector | null }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const previousVectorRef = useRef<{ x: number; y: number } | null>(null);
  const angularVelocityRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useFrame(() => {
    if (!meshRef.current) return;

    if (vector) {
      // Calculate relative movement (delta) while pinching
      if (previousVectorRef.current) {
        const deltaX = vector.x - previousVectorRef.current.x;
        const deltaY = vector.y - previousVectorRef.current.y;

        // Add to angular velocity based on movement delta
        // Scale factor to control rotation sensitivity
        const rotationSpeed = 3;
        angularVelocityRef.current.y += deltaX * rotationSpeed;
        angularVelocityRef.current.x -= deltaY * rotationSpeed; // Invert Y to match photo direction
        
        // Apply some smoothing to velocity while pinching (creates lag)
        const velocitySmoothing = 0.7;
        angularVelocityRef.current.y *= velocitySmoothing;
        angularVelocityRef.current.x *= velocitySmoothing;
      }

      // Update previous position for next frame
      previousVectorRef.current = { x: vector.x, y: vector.y };
    } else {
      // Reset previous position when pinch is released
      previousVectorRef.current = null;
    }

    // Always apply angular velocity to rotation (creates momentum)
    meshRef.current.rotation.y += angularVelocityRef.current.y;
    meshRef.current.rotation.x += angularVelocityRef.current.x;

    // Apply friction/damping to velocity (gradually slows down)
    // Higher friction = faster stop, lower = longer momentum
    const friction = vector ? 0.92 : 0.95; // Less friction while pinching, more when released
    angularVelocityRef.current.y *= friction;
    angularVelocityRef.current.x *= friction;

    // Stop very small velocities to prevent infinite tiny rotations
    const minVelocity = 0.001;
    if (Math.abs(angularVelocityRef.current.y) < minVelocity) {
      angularVelocityRef.current.y = 0;
    }
    if (Math.abs(angularVelocityRef.current.x) < minVelocity) {
      angularVelocityRef.current.x = 0;
    }
  });

  return (
    <mesh ref={meshRef} castShadow receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        color="#9333ea"
        metalness={0.8}
        roughness={0.2}
      />
    </mesh>
  );
}

/**
 * Three.js scene with a simple cube controlled by pinch gestures
 */
export function PinchControlled3D({
  vector,
  className = '',
}: PinchControlled3DProps) {
  return (
    <div className={`w-full h-96 bg-gradient-to-br from-gray-900 to-gray-800 rounded-lg border-2 border-gray-700 ${className}`}>
      <Canvas shadows>
        <PerspectiveCamera makeDefault position={[0, 0, 5]} fov={50} />
        
        {/* Lighting */}
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 5, 5]} intensity={1} castShadow />
        <pointLight position={[-5, -5, -5]} intensity={0.5} />
        
        {/* Rotating cube */}
        <RotatingCube vector={vector} />
        
        {/* Orbit controls for manual camera movement */}
        <OrbitControls
          enablePan={false}
          enableZoom={true}
          enableRotate={true}
          minDistance={3}
          maxDistance={10}
        />
      </Canvas>
    </div>
  );
}

