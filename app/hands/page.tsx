'use client';

import { useState } from 'react';
import { HandTracking, type PinchVector } from '@/components/hand-tracking/HandTracking';
import { usePinchHistory, type FinalVector } from '@/components/hand-tracking/PinchHistoryTracker';
import { PinchControlled3D } from '@/components/hand-tracking/PinchControlled3D';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function HandsPage() {
  const [pinchVector, setPinchVector] = useState<PinchVector | null>(null);
  const [finalVector, setFinalVector] = useState<FinalVector | null>(null);
  const [currentVector, setCurrentVector] = useState<FinalVector | null>(null);
  
  // Track pinch history - only start and end points
  usePinchHistory(pinchVector, {
    onFinalVector: setFinalVector, // Set when pinch is released
    onCurrentVector: setCurrentVector, // Update continuously while pinching
  });

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
          <Card>
            <CardHeader>
              <CardTitle>Camera Feed</CardTitle>
              <CardDescription>
                Hand skeleton tracking overlay. Pinch your thumb and index finger together to control the visual.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <HandTracking 
                  onPinchVector={setPinchVector}
                  compositeVector={currentVector || finalVector}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>3D Model Control</CardTitle>
              <CardDescription>
                Move and rotate the 3D model by pinching and moving your hand
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PinchControlled3D vector={pinchVector} />
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
