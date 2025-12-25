'use client';

import { useState, useEffect } from 'react';
import { HandTracking, type PinchVector } from '@/components/hand-tracking/HandTracking';
import { usePinchHistory, type FinalVector } from '@/components/hand-tracking/PinchHistoryTracker';
import { PinchControlled3D } from '@/components/hand-tracking/PinchControlled3D';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FpsOverlay } from '@/components/perf/FpsOverlay';

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
    <main className="relative min-h-screen w-full overflow-hidden">
      <FpsOverlay position="bottom-left" />
      {/* 3D Visual - positioned around the center, full screen */}
      <div className="absolute inset-0 z-0 w-full h-full">
        <PinchControlled3D vector={pinchVector} nodesPerOrbit={nodesPerOrbit} onPhaseAnglesChange={setPhaseAngles} className="h-full" />
      </div>

      {/* Centered Video Feed */}
      <div className="relative z-10 flex min-h-screen items-center justify-center p-4">
        <div className="relative max-w-md">
          <Card className="bg-white/95 backdrop-blur-sm shadow-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Camera Feed</CardTitle>
              <CardDescription className="text-xs">
                Pinch your thumb and index finger together to control the visual.
              </CardDescription>
              <div className="mt-2">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={leftHanded}
                    onChange={(e) => setLeftHanded(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span>Left-handed mode</span>
                </label>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="relative">
                <HandTracking 
                  onPinchVector={setPinchVector}
                  compositeVector={currentVector || finalVector}
                  onRightHandDistance={setRightHandDistance}
                  leftHanded={leftHanded}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Transformation Data - positioned in corner */}
      <div className="absolute bottom-4 right-4 z-20">
        <Card className="bg-white/95 backdrop-blur-sm max-w-xs">
          <CardHeader>
            <CardTitle className="text-sm">Transformation Data</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h3 className="text-xs font-semibold mb-2">3D Model Phase Angles</h3>
                <div className="space-y-1 font-mono text-xs">
                  {phaseAngles.length > 0 ? (
                    phaseAngles.map((angle, index) => (
                      <div key={index} className="flex justify-between">
                        <span>Orbit {index + 1}:</span>
                        <span>{angle.toFixed(3)} rad ({(angle * 180 / Math.PI).toFixed(1)}°)</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-gray-500">No phase angles yet</div>
                  )}
                </div>
              </div>
              <div>
                <h3 className="text-xs font-semibold mb-2">Right Hand Distance</h3>
                <div className="font-mono text-xs">
                  {rightHandDistance !== null ? (
                    <div>
                      <div className="mb-1">
                        <span className="font-semibold">Distance:</span> {rightHandDistance.toFixed(4)}
                      </div>
                      <div className="mb-1">
                        <span className="font-semibold">Nodes per Layer:</span> {nodesPerOrbit}
                      </div>
                      <div className="text-gray-500 text-xs">
                        (controls number of nodes per layer)
                      </div>
                    </div>
                  ) : (
                    <div className="text-gray-500">Right hand not detected</div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

