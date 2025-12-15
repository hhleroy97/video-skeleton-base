'use client';

import { useState, useEffect } from 'react';
import { HandTracking, type PinchVector, type Hand3DData } from '@/components/hand-tracking/HandTracking';
import { usePinchHistory, type FinalVector } from '@/components/hand-tracking/PinchHistoryTracker';
import { PinchControlled3D } from '@/components/hand-tracking/PinchControlled3D';
import { Hand3DVisual } from '@/components/hand-tracking/Hand3DVisual';
import { getVisualConfig } from '../visuals-config';
import { notFound } from 'next/navigation';
import Link from 'next/link';

export default function VisualPage({ params }: { params: Promise<{ visualId: string }> | { visualId: string } }) {
  const [pinchVector, setPinchVector] = useState<PinchVector | null>(null);
  const [finalVector, setFinalVector] = useState<FinalVector | null>(null);
  const [currentVector, setCurrentVector] = useState<FinalVector | null>(null);
  const [phaseAngles, setPhaseAngles] = useState<number[]>([]);
  const [rightHandDistance, setRightHandDistance] = useState<number | null>(null);
  const [nodesPerOrbit, setNodesPerOrbit] = useState(8);
  const [leftHanded, setLeftHanded] = useState(false);
  const [visualId, setVisualId] = useState<string>('');
  const [hands3D, setHands3D] = useState<Hand3DData[]>([]);
  
  // Handle both sync and async params
  useEffect(() => {
    if ('then' in params) {
      params.then(resolved => setVisualId(resolved.visualId));
    } else {
      setVisualId(params.visualId);
    }
  }, [params]);
  
  // Track pinch history - always call hooks before early returns
  usePinchHistory(pinchVector, {
    onFinalVector: setFinalVector,
    onCurrentVector: setCurrentVector,
  });
  
  // Update nodes per orbit based on right hand distance
  useEffect(() => {
    if (rightHandDistance !== null) {
      const clampedDistance = Math.min(0.25, Math.max(0, rightHandDistance));
      const minNodes = 3;
      const maxNodes = 10;
      const mappedNodes = Math.round(minNodes + (clampedDistance / 0.25) * (maxNodes - minNodes));
      setNodesPerOrbit(mappedNodes);
    }
  }, [rightHandDistance]);
  
  const visualConfig = getVisualConfig(visualId);
  
  if (!visualId) {
    return <div className="flex items-center justify-center w-screen h-screen bg-black text-white">Loading...</div>;
  }
  
  if (!visualConfig) {
    notFound();
  }

  // Render based on visual component type
  const renderVisual = () => {
    switch (visualConfig.component) {
      case 'PinchControlled3D':
        return (
          <PinchControlled3D 
            vector={pinchVector} 
            nodesPerOrbit={nodesPerOrbit} 
            onPhaseAnglesChange={setPhaseAngles}
            fullscreen={visualConfig.fullscreen ?? false}
          />
        );
      case 'BasicHandTracking':
        // Fullscreen hand tracking - no overlay needed
        return null;
      case 'Hand3DVisual':
        // 3D hand visualization - rendered separately
        return null;
      // Add more component cases here as needed
      default:
        return <div>Visual component not implemented yet</div>;
    }
  };

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-black">
      {/* Navigation bar */}
      <div className="absolute top-4 left-4 z-50 flex gap-2">
        <Link
          href="/hands"
          className="px-4 py-2 bg-gray-800/80 text-white rounded-lg hover:bg-gray-700/80 transition-colors backdrop-blur-sm"
        >
          ← Back to Hands
        </Link>
        <Link
          href={`/hands/${visualId}/control-panel`}
          className="px-4 py-2 bg-blue-600/80 text-white rounded-lg hover:bg-blue-700/80 transition-colors backdrop-blur-sm"
        >
          Control Panel
        </Link>
      </div>

      {/* Visual component */}
      {renderVisual()}

      {/* 3D Hand Visualization - fullscreen background */}
      {visualConfig.component === 'Hand3DVisual' && (
        <div className="absolute inset-0 z-30">
          <Hand3DVisual hands={hands3D} className="w-full h-full" />
        </div>
      )}

      {/* Camera feed - different layout based on visual type */}
      {visualConfig.component === 'BasicHandTracking' ? (
        // Fullscreen hand tracking
        <div className="absolute inset-0 z-40">
          <HandTracking 
            leftHanded={leftHanded}
            className="w-full h-full"
            hideRestartButton={true}
          />
        </div>
      ) : visualConfig.component === 'Hand3DVisual' ? (
        // Small camera feed overlay for 3D hand visualization
        <div className="absolute bottom-4 right-4 z-50 w-48 h-36 rounded-lg overflow-hidden border-2 border-white/40 shadow-lg">
          <HandTracking 
            onHands3D={setHands3D}
            leftHanded={leftHanded}
            className="w-full h-full"
            hideRestartButton={true}
          />
        </div>
      ) : (
        // Circular camera feed overlay - centered (for other visuals)
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50">
          <div className="relative w-[300px] h-[300px] rounded-full">
            <div className="absolute inset-0 rounded-full border-4 border-white/40"></div>
            <div className="relative w-full h-full rounded-full overflow-hidden border-2 border-gray-600 bg-black m-1 [&_canvas]:absolute [&_canvas]:inset-0 [&_canvas]:w-full [&_canvas]:h-full [&_canvas]:object-cover [&_canvas]:!border-0 [&_canvas]:!rounded-none">
              <div className="absolute inset-0 [&>div]:absolute [&>div]:inset-0 [&>div]:w-full [&>div]:h-full [&>div>div]:absolute [&>div>div]:inset-0 [&>div>div]:w-full [&>div>div]:h-full">
                <HandTracking 
                  onPinchVector={setPinchVector}
                  compositeVector={currentVector || finalVector}
                  onRightHandDistance={setRightHandDistance}
                  leftHanded={leftHanded}
                  className="!border-0 !rounded-none"
                  hideRestartButton={true}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings overlay */}
      <div className="absolute bottom-4 right-4 z-50">
        <div className="bg-gray-800/80 backdrop-blur-sm rounded-lg p-3">
          <label className="flex items-center gap-2 text-sm text-white cursor-pointer">
            <input
              type="checkbox"
              checked={leftHanded}
              onChange={(e) => setLeftHanded(e.target.checked)}
              className="w-4 h-4"
            />
            <span>Left-handed</span>
          </label>
        </div>
      </div>
    </main>
  );
}
