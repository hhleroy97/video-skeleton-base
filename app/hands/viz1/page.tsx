'use client';

import { useState, useEffect } from 'react';
import { HandTracking, type PinchVector } from '@/components/hand-tracking/HandTracking';
import { usePinchHistory, type FinalVector } from '@/components/hand-tracking/PinchHistoryTracker';
import { PinchControlled3D } from '@/components/hand-tracking/PinchControlled3D';

export default function HandsPage() {
  const [pinchVector, setPinchVector] = useState<PinchVector | null>(null);
  const [finalVector, setFinalVector] = useState<FinalVector | null>(null);
  const [currentVector, setCurrentVector] = useState<FinalVector | null>(null);
  const [phaseAngles, setPhaseAngles] = useState<number[]>([]);
  const [rightHandDistance, setRightHandDistance] = useState<number | null>(null);
  const [nodesPerOrbit, setNodesPerOrbit] = useState(8);
  const [leftHanded, setLeftHanded] = useState(false);
  
  // Track pinch history - only start and end points
  usePinchHistory(pinchVector, {
    onFinalVector: setFinalVector, // Set when pinch is released
    onCurrentVector: setCurrentVector, // Update continuously while pinching
  });
  
  // Update nodes per orbit based on right hand distance
  // Distance is normalized 0-1, but map 0-0.25 range to 3-10 nodes
  // Larger distance (fingers farther apart) = more nodes
  useEffect(() => {
    if (rightHandDistance !== null) {
      // Map distance (0-0.25) to nodes (3-10)
      // Clamp distance to 0-0.25 range
      const clampedDistance = Math.min(0.25, Math.max(0, rightHandDistance));
      // Map from 0-0.25 to 3-10
      const minNodes = 3;
      const maxNodes = 10;
      const mappedNodes = Math.round(minNodes + (clampedDistance / 0.25) * (maxNodes - minNodes));
      setNodesPerOrbit(mappedNodes);
    }
  }, [rightHandDistance]);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-black">
      {/* Full screen 3D visual */}
      <PinchControlled3D vector={pinchVector} nodesPerOrbit={nodesPerOrbit} onPhaseAnglesChange={setPhaseAngles} fullscreen={true} />

      {/* Circular camera feed overlay - centered */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50">
        {/* Circular container for camera feed with outer ring */}
        <div className="relative w-[300px] h-[300px] rounded-full">
          {/* Outer ring circle */}
          <div className="absolute inset-0 rounded-full border-4 border-white/40"></div>
          {/* Inner circular feed container */}
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
    </main>
  );
}
