'use client';

import { useState } from 'react';
import { HandTracking, type PinchVector } from '@/components/hand-tracking/HandTracking';
import { PinchVisual } from '@/components/hand-tracking/PinchVisual';
import { VectorArrows } from '@/components/hand-tracking/VectorArrows';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function HandsPage() {
  const [pinchVector, setPinchVector] = useState<PinchVector | null>(null);

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
                Hand skeleton tracking overlay. Pinch your thumb and index finger together to move the visual.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <HandTracking onPinchVector={setPinchVector} />
                {/* Overlay the visual on top of the camera feed - automatically matches canvas size */}
                <PinchVisual vector={pinchVector} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pinch Vector Data</CardTitle>
              <CardDescription>
                Real-time vector information when pinching
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pinchVector ? (
                <div className="space-y-4">
                  {/* Vector Arrows Visualization */}
                  <VectorArrows vector={pinchVector} scale={60} />
                  
                  {/* Numeric Values */}
                  <div className="space-y-2 font-mono text-sm pt-2 border-t">
                    <div>
                      <span className="text-muted-foreground">Position:</span>
                      <div className="ml-4">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 bg-red-500 rounded"></span>
                          X: {pinchVector.x.toFixed(3)}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 bg-green-500 rounded"></span>
                          Y: {pinchVector.y.toFixed(3)}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 bg-blue-500 rounded"></span>
                          Z: {pinchVector.z.toFixed(3)}
                        </div>
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Direction:</span>
                      <div className="ml-4">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 bg-red-600 rounded"></span>
                          dX: {pinchVector.dx.toFixed(3)}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 bg-green-600 rounded"></span>
                          dY: {pinchVector.dy.toFixed(3)}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 bg-blue-600 rounded"></span>
                          dZ: {pinchVector.dz.toFixed(3)}
                        </div>
                      </div>
                    </div>
                    <div className="pt-2 border-t">
                      <span className="text-muted-foreground">Screen Position:</span>
                      <div className="ml-4">
                        <div>X: {(pinchVector.x * 640).toFixed(0)}px</div>
                        <div>Y: {(pinchVector.y * 480).toFixed(0)}px</div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Pinch your thumb and index finger together to see vector data
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
