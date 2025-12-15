'use client';

import { useState, useEffect } from 'react';
import { HandTracking, type PinchVector } from '@/components/hand-tracking/HandTracking';
import { usePinchHistory, type FinalVector } from '@/components/hand-tracking/PinchHistoryTracker';
import { PinchControlled3D } from '@/components/hand-tracking/PinchControlled3D';
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
  
  // Handle both sync and async params
  useEffect(() => {
    if ('then' in params) {
      params.then(resolved => setVisualId(resolved.visualId));
    } else {
      setVisualId(params.visualId);
    }
  }, [params]);
  
  const visualConfig = getVisualConfig(visualId);
  
  if (!visualId) {
    return <div className="flex items-center justify-center w-screen h-screen bg-black text-white">Loading...</div>;
  }
  
  if (!visualConfig) {
    notFound();
  }
  
  // Track pinch history - only start and end points
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

      {/* Circular camera feed overlay - centered */}
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
