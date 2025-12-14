'use client';

import { useState, useEffect } from 'react';
import { HandTracking, type PinchVector } from '@/components/hand-tracking/HandTracking';
import { usePinchHistory, type FinalVector } from '@/components/hand-tracking/PinchHistoryTracker';
import { PinchControlled3D } from '@/components/hand-tracking/PinchControlled3D';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

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
    <main className="flex min-h-screen flex-col items-center justify-center p-4 md:p-8 lg:p-24">
      <div className="z-10 max-w-6xl w-full">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold mb-2">Hand Tracking</h1>
          <p className="text-muted-foreground">
            Real-time hand tracking with MediaPipe. Pinch to control the visual element.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Camera Feed</CardTitle>
                <CardDescription>
                  Hand skeleton tracking overlay. Pinch your thumb and index finger together to control the visual.
                </CardDescription>
                <div className="mt-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
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
              <CardContent>
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
            
            {/* Display transformation values underneath camera */}
            <Card>
              <CardHeader>
                <CardTitle>Transformation Data</CardTitle>
                <CardDescription>
                  Real-time values from hand tracking
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold mb-2">3D Model Phase Angles</h3>
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
                    <h3 className="text-sm font-semibold mb-2">Right Hand Distance</h3>
                    <div className="font-mono text-xs">
                      {rightHandDistance !== null ? (
                        <div>
                          <div className="mb-1">
                            <span className="font-semibold">Distance:</span> {rightHandDistance.toFixed(4)}
                          </div>
                          <div className="text-gray-500 text-xs">
                            (between thumb and index finger)
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

          <Card>
            <CardHeader>
              <CardTitle>3D Model Control</CardTitle>
              <CardDescription>
                Move and rotate the 3D model by pinching and moving your hand
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PinchControlled3D vector={pinchVector} nodesPerOrbit={nodesPerOrbit} onPhaseAnglesChange={setPhaseAngles} />
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
