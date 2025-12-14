'use client';

import { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import type { PinchVector } from './HandTracking';

interface PinchControlled3DProps {
  vector: PinchVector | null;
  className?: string;
  nodesPerOrbit?: number; // Number of nodes per layer (controlled by right hand distance)
  onPhaseAnglesChange?: (phaseAngles: number[]) => void; // Callback to report phase angles
}

/**
 * Voronoi-connected orbital system with toon-shaded voxel elements and wireframes
 */
function VoronoiOrbitalSystem({ vector, nodesPerOrbit, onPhaseAnglesChange }: { vector: PinchVector | null; nodesPerOrbit: number; onPhaseAnglesChange?: (phaseAngles: number[]) => void }) {
  const groupRef = useRef<THREE.Group>(null);
  const previousVectorRef = useRef<{ x: number; y: number } | null>(null);
  const phaseAnglesRef = useRef<Array<number>>([]);
  const nodesRef = useRef<Array<{
    id: number;
    orbitIndex: number;
    angle: number;
    radius: number;
    height: number;
    color: THREE.Color;
    connections: number[];
  }>>([]);
  
  // Orbital system configuration
  const numOrbits = 5;
  const orbitRadius = 1.5;
  const voxelSize = 0.12;
  
  // Create orbital nodes with Voronoi-like connections
  const orbitalNodes = useMemo(() => {
    const nodes: Array<{
      id: number;
      orbitIndex: number;
      angle: number;
      radius: number;
      height: number;
      color: THREE.Color;
      connections: number[];
    }> = [];
    
    // Create nodes in orbital rings
    let nodeId = 0;
    for (let orbit = 0; orbit < numOrbits; orbit++) {
      const orbitRadius = 0.8 + orbit * 0.4;
      const height = (orbit - numOrbits / 2) * 0.3;
      
      for (let i = 0; i < nodesPerOrbit; i++) {
        const angle = (i / nodesPerOrbit) * Math.PI * 2;
        const hue = (orbit / numOrbits * 0.6 + i / nodesPerOrbit * 0.3) % 1;
        const color = new THREE.Color().setHSL(hue, 0.9, 0.6);
        
        nodes.push({
          id: nodeId++,
          orbitIndex: orbit,
          angle,
          radius: orbitRadius,
          height,
          color,
          connections: [],
        });
      }
    }
    
    // Create cosmic connections - reduced number of connections
    nodes.forEach((node, i) => {
      const connections: number[] = [];
      
      // Connect to nodes in same orbit (only immediate neighbors)
      const sameOrbitNodes = nodes.filter((n, idx) => 
        n.orbitIndex === node.orbitIndex && idx !== i
      );
      // Connect to only 1-2 closest adjacent nodes in same orbit
      const adjacentCount = Math.min(2, sameOrbitNodes.length);
      for (let j = 0; j < adjacentCount; j++) {
        const angleDiff = Math.abs(node.angle - sameOrbitNodes[j].angle);
        const normalizedDiff = Math.min(angleDiff, Math.PI * 2 - angleDiff);
        if (normalizedDiff < Math.PI / 3) { // Within 60 degrees (stricter)
          const otherIdx = nodes.indexOf(sameOrbitNodes[j]);
          if (otherIdx !== -1 && !connections.includes(otherIdx)) {
            connections.push(otherIdx);
          }
        }
      }
      
      // Connect to nodes in adjacent orbits (stricter distance threshold)
      nodes.forEach((other, j) => {
        if (i !== j && Math.abs(other.orbitIndex - node.orbitIndex) === 1) {
          const dx = node.radius * Math.cos(node.angle) - other.radius * Math.cos(other.angle);
          const dy = node.height - other.height;
          const dz = node.radius * Math.sin(node.angle) - other.radius * Math.sin(other.angle);
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          
          // Connect only if within stricter threshold
          if (dist < 0.8) {
            if (!connections.includes(j)) {
              connections.push(j);
            }
          }
        }
      });
      
      // Ensure each node has at least 2 connections (reduced from 3)
      if (connections.length < 2) {
        // Add more connections to nearest nodes
        const distances = nodes.map((other, j) => {
          if (i === j || connections.includes(j)) return { idx: j, dist: Infinity };
          const dx = node.radius * Math.cos(node.angle) - other.radius * Math.cos(other.angle);
          const dy = node.height - other.height;
          const dz = node.radius * Math.sin(node.angle) - other.radius * Math.sin(other.angle);
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          return { idx: j, dist };
        });
        distances.sort((a, b) => a.dist - b.dist);
        const needed = 2 - connections.length;
        for (let k = 0; k < needed && k < distances.length; k++) {
          if (distances[k].dist < Infinity && distances[k].dist < 1.0) {
            connections.push(distances[k].idx);
          }
        }
      }
      
      node.connections = connections;
    });
    
    nodesRef.current = nodes;
    // Initialize phase angles for each orbit (starting with offsets)
    phaseAnglesRef.current = Array(numOrbits).fill(0).map((_, i) => (i / numOrbits) * Math.PI * 2);
    return nodes;
  }, [nodesPerOrbit]);
  
  // Toon shading material for voxels
  const toonMaterial = useMemo(() => {
    return new THREE.MeshToonMaterial({
      color: 0xffffff,
      gradientMap: (() => {
        const canvas = document.createElement('canvas');
        canvas.width = 2;
        canvas.height = 64;
        const ctx = canvas.getContext('2d')!;
        const gradient = ctx.createLinearGradient(0, 0, 0, 64);
        gradient.addColorStop(0, '#ffffff');
        gradient.addColorStop(0.5, '#aaaaaa');
        gradient.addColorStop(1, '#000000');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 2, 64);
        return new THREE.CanvasTexture(canvas);
      })(),
    });
  }, []);
  
  // Wireframe material for connections with vertex colors for gradients
  const wireframeMaterial = useMemo(() => {
    return new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      linewidth: 2,
    });
  }, []);

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    
    const group = groupRef.current;
    
    // ONLY update phase angles based on movement - nothing else
    if (vector) {
      if (previousVectorRef.current) {
        const deltaX = vector.x - previousVectorRef.current.x;
        const deltaY = vector.y - previousVectorRef.current.y;
        
        // Only update if there's actual movement
        if (Math.abs(deltaX) > 0.0001 || Math.abs(deltaY) > 0.0001) {
          // Update phase angles between layers based on user movement
          for (let orbit = 0; orbit < numOrbits; orbit++) {
            // Phase angle changes based on movement
            const phaseChange = 
              deltaX * 1.0 * (orbit + 1) + // X movement affects phase
              deltaY * 0.8 * (orbit + 1); // Y movement affects phase
            
            // Accumulate phase angle directly
            phaseAnglesRef.current[orbit] += phaseChange;
          }
          
          // Report phase angles to parent
          if (onPhaseAnglesChange) {
            onPhaseAnglesChange([...phaseAnglesRef.current]);
          }
        }
      }
      previousVectorRef.current = { x: vector.x, y: vector.y };
    } else {
      previousVectorRef.current = null;
    }
    
    // Update orbital positions based on phase angles only
    group.children.forEach((child) => {
      if (child instanceof THREE.Mesh && child.userData.nodeIndex !== undefined) {
        const nodeIndex = child.userData.nodeIndex;
        const node = nodesRef.current[nodeIndex];
        if (!node) return;
        
        // Get current phase angle for this orbit
        const phaseAngle = phaseAnglesRef.current[node.orbitIndex];
        const adjustedAngle = node.angle + phaseAngle;
        
        // Calculate position from orbital parameters and phase angle
        const x = node.radius * Math.cos(adjustedAngle);
        const y = node.height;
        const z = node.radius * Math.sin(adjustedAngle);
        
        // Set position directly from orbital calculation
        child.position.set(x, y, z);
        
        // Keep scale and rotation static
        child.scale.setScalar(1);
        child.rotation.set(0, 0, 0);
        
        // Update color based on phase angle
        if (child.material instanceof THREE.MeshToonMaterial) {
          const orbitFactor = node.orbitIndex / numOrbits;
          const hue = (orbitFactor * 0.6 + phaseAngle * 0.1) % 1;
          const saturation = 0.8 + orbitFactor * 0.1;
          const lightness = 0.5 + Math.sin(phaseAngle) * 0.2;
          child.material.color.setHSL(hue, saturation, lightness);
        }
      } else if (child instanceof THREE.Line && child.userData.connectionIndex !== undefined) {
        // Update wireframe connections
        const connIndex = child.userData.connectionIndex;
        const node = nodesRef.current[connIndex];
        const connectedNode = nodesRef.current[child.userData.connectedTo];
        
        if (node && connectedNode) {
          // Calculate positions from phase angles
          const phaseAngle1 = phaseAnglesRef.current[node.orbitIndex];
          const phaseAngle2 = phaseAnglesRef.current[connectedNode.orbitIndex];
          
          const adjustedAngle1 = node.angle + phaseAngle1;
          const adjustedAngle2 = connectedNode.angle + phaseAngle2;
          
          const pos1 = {
            x: node.radius * Math.cos(adjustedAngle1),
            y: node.height,
            z: node.radius * Math.sin(adjustedAngle1),
          };
          const pos2 = {
            x: connectedNode.radius * Math.cos(adjustedAngle2),
            y: connectedNode.height,
            z: connectedNode.radius * Math.sin(adjustedAngle2),
          };
          
          const positions = child.geometry.getAttribute('position') as THREE.BufferAttribute;
          const colorAttribute = child.geometry.getAttribute('color') as THREE.BufferAttribute;
          
          positions.setXYZ(0, pos1.x, pos1.y, pos1.z);
          positions.setXYZ(1, pos2.x, pos2.y, pos2.z);
          positions.needsUpdate = true;
          
          // Update colors for gradient based on phase angles
          const orbitFactor1 = node.orbitIndex / numOrbits;
          const orbitFactor2 = connectedNode.orbitIndex / numOrbits;
          
          const hue1 = (orbitFactor1 * 0.6 + phaseAngle1 * 0.1) % 1;
          const saturation1 = 0.8 + orbitFactor1 * 0.1;
          const lightness1 = 0.5 + Math.sin(phaseAngle1) * 0.2;
          const color1 = new THREE.Color().setHSL(hue1, saturation1, lightness1);
          
          const hue2 = (orbitFactor2 * 0.6 + phaseAngle2 * 0.1) % 1;
          const saturation2 = 0.8 + orbitFactor2 * 0.1;
          const lightness2 = 0.5 + Math.sin(phaseAngle2) * 0.2;
          const color2 = new THREE.Color().setHSL(hue2, saturation2, lightness2);
          
          // Set gradient colors
          if (colorAttribute) {
            colorAttribute.setXYZ(0, color1.r, color1.g, color1.b);
            colorAttribute.setXYZ(1, color2.r, color2.g, color2.b);
            colorAttribute.needsUpdate = true;
          }
        }
      }
    });
  });

  return (
    <group ref={groupRef}>
      {/* Orbital nodes as voxel cubes */}
      {orbitalNodes.map((node, index) => {
        const material = toonMaterial.clone();
        material.color.copy(node.color);
        
        const angle = node.angle;
        const x = node.radius * Math.cos(angle);
        const y = node.height;
        const z = node.radius * Math.sin(angle);
        
        return (
          <mesh
            key={`node-${index}`}
            position={[x, y, z]}
            material={material}
            userData={{ nodeIndex: index }}
          >
            <boxGeometry args={[voxelSize, voxelSize, voxelSize]} />
          </mesh>
        );
      })}
      
      {/* Voronoi wireframe connections with gradient colors */}
      {orbitalNodes.map((node, index) => {
        return node.connections.map((connectedIndex, connIdx) => {
          const connectedNode = orbitalNodes[connectedIndex];
          if (!connectedNode) return null;
          
          const x1 = node.radius * Math.cos(node.angle);
          const y1 = node.height;
          const z1 = node.radius * Math.sin(node.angle);
          
          const x2 = connectedNode.radius * Math.cos(connectedNode.angle);
          const y2 = connectedNode.height;
          const z2 = connectedNode.radius * Math.sin(connectedNode.angle);
          
          // Create geometry with positions and colors for gradient
          const geometry = new THREE.BufferGeometry();
          const positions = new Float32Array([x1, y1, z1, x2, y2, z2]);
          const colors = new Float32Array([
            node.color.r, node.color.g, node.color.b, // Start color from first node
            connectedNode.color.r, connectedNode.color.g, connectedNode.color.b, // End color from second node
          ]);
          
          geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
          geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
          
          const line = new THREE.Line(geometry, wireframeMaterial);
          line.userData = { connectionIndex: index, connectedTo: connectedIndex };
          
          return (
            <primitive
              key={`connection-${index}-${connectedIndex}-${connIdx}`}
              object={line}
            />
          );
        });
      })}
    </group>
  );
}

/**
 * Camera controller component that updates camera position and rotation
 */
function CameraController({ 
  x, y, z, 
  rotationX, rotationY, rotationZ 
}: { 
  x: number; y: number; z: number;
  rotationX: number; rotationY: number; rotationZ: number;
}) {
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  
  useFrame(() => {
    if (cameraRef.current) {
      cameraRef.current.position.set(x, y, z);
      cameraRef.current.rotation.set(rotationX, rotationY, rotationZ);
      cameraRef.current.updateProjectionMatrix();
    }
  });
  
  return <PerspectiveCamera ref={cameraRef} makeDefault position={[x, y, z]} rotation={[rotationX, rotationY, rotationZ]} fov={50} />;
}

/**
 * Three.js scene with Voronoi-connected orbital system controlled by pinch gestures
 */
export function PinchControlled3D({
  vector,
  className = '',
  nodesPerOrbit: externalNodesPerOrbit = 8,
  onPhaseAnglesChange,
}: PinchControlled3DProps) {
  const [cameraX, setCameraX] = useState(0);
  const [cameraY, setCameraY] = useState(-4);
  const [cameraZ, setCameraZ] = useState(0);
  const [rotationX, setRotationX] = useState(Math.PI / 2); // 90 degrees
  const [rotationY, setRotationY] = useState(0);
  const [rotationZ, setRotationZ] = useState(0);
  const [nodesPerOrbit, setNodesPerOrbit] = useState(externalNodesPerOrbit);
  
  // Update nodes per orbit when external value changes
  useEffect(() => {
    setNodesPerOrbit(externalNodesPerOrbit);
  }, [externalNodesPerOrbit]);
  
  return (
    <div className={`w-full ${className}`}>
      <div className="w-full h-96 bg-gradient-to-br from-gray-900 to-gray-800 rounded-lg border-2 border-gray-700 mb-4">
        <Canvas>
          <CameraController 
            x={cameraX} 
            y={cameraY} 
            z={cameraZ}
            rotationX={rotationX}
            rotationY={rotationY}
            rotationZ={rotationZ}
          />
          
          {/* Cosmic lighting for toon shading */}
          <ambientLight intensity={0.5} />
          <directionalLight position={[5, 5, 5]} intensity={1.8} color="#ffffff" />
          <directionalLight position={[-5, -5, -5]} intensity={1.0} color="#88aaff" />
          <pointLight position={[0, 0, 5]} intensity={1.2} color="#ffffff" />
          <pointLight position={[0, 5, 0]} intensity={0.8} color="#ffaaff" />
          
          {/* Voronoi orbital system */}
          <VoronoiOrbitalSystem vector={vector} nodesPerOrbit={nodesPerOrbit} onPhaseAnglesChange={onPhaseAnglesChange} />
          
          {/* Orbit controls for manual camera movement */}
          <OrbitControls
            enablePan={false}
            enableZoom={true}
            enableRotate={true}
            minDistance={3}
            maxDistance={10}
            target={[0, 0, 0]}
            minPolarAngle={0}
            maxPolarAngle={Math.PI / 2}
          />
        </Canvas>
      </div>
      
      {/* Camera Control Sliders */}
      <div className="space-y-4 p-4 bg-gray-800 rounded-lg border border-gray-700">
        <div>
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Camera Position</h3>
          <div className="space-y-2">
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                X: {cameraX.toFixed(2)}
              </label>
              <input
                type="range"
                min="-10"
                max="10"
                step="0.1"
                value={cameraX}
                onChange={(e) => setCameraX(parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Y: {cameraY.toFixed(2)}
              </label>
              <input
                type="range"
                min="-10"
                max="10"
                step="0.1"
                value={cameraY}
                onChange={(e) => setCameraY(parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Z: {cameraZ.toFixed(2)}
              </label>
              <input
                type="range"
                min="-10"
                max="10"
                step="0.1"
                value={cameraZ}
                onChange={(e) => setCameraZ(parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>
          </div>
        </div>
        
        <div>
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Camera Rotation</h3>
          <div className="space-y-2">
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Pitch (X): {(rotationX * 180 / Math.PI).toFixed(1)}°
              </label>
              <input
                type="range"
                min={-Math.PI}
                max={Math.PI}
                step="0.01"
                value={rotationX}
                onChange={(e) => setRotationX(parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-green-500"
              />
            </div>
            
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Yaw (Y): {(rotationY * 180 / Math.PI).toFixed(1)}°
              </label>
              <input
                type="range"
                min={-Math.PI}
                max={Math.PI}
                step="0.01"
                value={rotationY}
                onChange={(e) => setRotationY(parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-green-500"
              />
            </div>
            
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Roll (Z): {(rotationZ * 180 / Math.PI).toFixed(1)}°
              </label>
              <input
                type="range"
                min={-Math.PI}
                max={Math.PI}
                step="0.01"
                value={rotationZ}
                onChange={(e) => setRotationZ(parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-green-500"
              />
             </div>
           </div>
         </div>
         
         <div>
           <h3 className="text-sm font-semibold text-gray-300 mb-3">Orbital System</h3>
           <div className="space-y-2">
             <div>
               <label className="block text-xs text-gray-400 mb-1">
                 Nodes per Layer: {nodesPerOrbit} (controlled by right hand distance)
               </label>
               <input
                 type="range"
                 min="3"
                 max="10"
                 step="1"
                 value={nodesPerOrbit}
                 disabled
                 readOnly
                 className="w-full h-2 bg-gray-700 rounded-lg appearance-none accent-purple-500 opacity-50"
               />
             </div>
           </div>
         </div>
       </div>
     </div>
   );
 }

