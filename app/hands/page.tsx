'use client';

import { useState } from 'react';
import { HandTracking, type PinchVector } from '@/components/hand-tracking/HandTracking';
import { VectorArrows } from '@/components/hand-tracking/VectorArrows';
import { usePinchHistory, type FinalVector } from '@/components/hand-tracking/PinchHistoryTracker';
import { FinalVectorArrows } from '@/components/hand-tracking/FinalVectorArrows';
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
                Hand skeleton tracking overlay. Pinch your thumb and index finger together to move the visual.
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
              <CardTitle>Pinch Vector Data</CardTitle>
              <CardDescription>
                Real-time vector information when pinching
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pinchVector ? (
                <div className="space-y-4">
                  {/* Vector Arrows Visualization - inline */}
                  <div className="flex gap-4">
                    <VectorArrows vector={pinchVector} scale={60} />
                    {(currentVector || finalVector) && (
                      <FinalVectorArrows vector={currentVector || finalVector!} scale={60} />
                    )}
                  </div>
                  
                  {/* Numeric Values - all in one line, logically ordered */}
                  <div className="font-mono text-sm pt-2 border-t">
                    <div className="flex gap-6 items-start flex-wrap">
                      {/* Position */}
                      <div>
                        <span className="text-muted-foreground text-xs">Position:</span>
                        <div className="mt-1">
                          <div className="flex items-center gap-2">
                            <span className="w-3 h-3 bg-red-500 rounded"></span>
                            X: {pinchVector.x.toFixed(3)}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="w-3 h-3 bg-green-500 rounded"></span>
                            Y: {pinchVector.y.toFixed(3)}
                          </div>
                        </div>
                      </div>
                      
                      {/* Screen Position */}
                      <div>
                        <span className="text-muted-foreground text-xs">Screen Position:</span>
                        <div className="mt-1">
                          <div>X: {(320 + pinchVector.x * 640).toFixed(0)}px</div>
                          <div>Y: {(240 + pinchVector.y * 480).toFixed(0)}px</div>
                        </div>
                      </div>
                      
                      {/* Composite Vector */}
                      {(currentVector || finalVector) && (
                        <div>
                          <span className="text-muted-foreground text-xs">Composite Vector:</span>
                          <div className="mt-1 flex gap-4">
                            <div>
                              <span className="text-xs text-muted-foreground">Start:</span>
                              <div className="text-xs">
                                <div className="flex items-center gap-1">
                                  <span className="w-2 h-2 bg-red-500 rounded"></span>
                                  X: {(currentVector || finalVector)!.startX.toFixed(3)}
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="w-2 h-2 bg-red-500 rounded"></span>
                                  Y: {(currentVector || finalVector)!.startY.toFixed(3)}
                                </div>
                              </div>
                            </div>
                            <div>
                              <span className="text-xs text-muted-foreground">End:</span>
                              <div className="text-xs">
                                <div className="flex items-center gap-1">
                                  <span className="w-2 h-2 bg-green-500 rounded"></span>
                                  X: {(currentVector || finalVector)!.endX.toFixed(3)}
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="w-2 h-2 bg-green-500 rounded"></span>
                                  Y: {(currentVector || finalVector)!.endY.toFixed(3)}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
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
