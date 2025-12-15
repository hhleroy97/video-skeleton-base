'use client';

import { useState, useEffect } from 'react';
import { HandTracking, type PinchVector } from '@/components/hand-tracking/HandTracking';
import { usePinchHistory, type FinalVector } from '@/components/hand-tracking/PinchHistoryTracker';
import { PinchControlled3D } from '@/components/hand-tracking/PinchControlled3D';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getVisualConfig } from '../../visuals-config';
import { notFound } from 'next/navigation';
import Link from 'next/link';

export default function ControlPanelPage({ params }: { params: Promise<{ visualId: string }> | { visualId: string } }) {
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
    return <div className="flex items-center justify-center min-h-screen bg-gray-100">Loading...</div>;
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

  // Render visual component based on config
  const renderVisual = () => {
    switch (visualConfig.component) {
      case 'PinchControlled3D':
        return (
          <PinchControlled3D 
            vector={pinchVector} 
            nodesPerOrbit={nodesPerOrbit} 
            onPhaseAnglesChange={setPhaseAngles}
            fullscreen={false}
          />
        );
      // Add more component cases here as needed
      default:
        return <div>Visual component not implemented yet</div>;
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 md:p-8 lg:p-24">
      <div className="z-10 max-w-6xl w-full">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-4xl font-bold mb-2">{visualConfig.name} - Control Panel</h1>
              <p className="text-muted-foreground">
                {visualConfig.description}
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                href="/hands"
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                ← Back
              </Link>
              <Link
                href={`/hands/${visualId}`}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Fullscreen View
              </Link>
            </div>
          </div>
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
              <CardTitle>{visualConfig.name}</CardTitle>
              <CardDescription>
                Move and rotate by pinching and moving your hand
              </CardDescription>
            </CardHeader>
            <CardContent>
              {renderVisual()}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
