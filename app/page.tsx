'use client';

import { useState, useRef, useEffect } from 'react';
import { WebcamCapture } from '@/components/video/WebcamCapture';
import { SkeletonOverlay } from '@/components/skeleton/SkeletonOverlay';
import { useMediaPipe } from '@/hooks/useMediaPipe';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { MediaPipeResults } from '@/types/mediapipe';

export default function Home() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [results, setResults] = useState<MediaPipeResults | null>(null);
  const [enableBody, setEnableBody] = useState(true);
  const [enableHands, setEnableHands] = useState(true);
  const [enableFace, setEnableFace] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  const { isInitialized, fps, startProcessing } = useMediaPipe({
    enableBody,
    enableHands,
    enableFace,
    videoElement: videoRef.current,
    onResults: (newResults) => {
      setResults(newResults);
    },
  });

  const handleVideoReady = (videoElement: HTMLVideoElement) => {
    videoRef.current = videoElement;
    if (isInitialized) {
      startProcessing();
      setIsProcessing(true);
    }
  };

  useEffect(() => {
    if (isInitialized && videoRef.current) {
      startProcessing();
      setIsProcessing(true);
    }
  }, [isInitialized, startProcessing]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 md:p-8 lg:p-24">
      <div className="z-10 max-w-6xl w-full">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold mb-2">Video Skeleton Base</h1>
          <p className="text-muted-foreground">
            Real-time body, hands, and face tracking with MediaPipe
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Video Display */}
          <Card>
            <CardHeader>
              <CardTitle>Camera Feed</CardTitle>
              <CardDescription>
                {isInitialized ? 'MediaPipe initialized' : 'Initializing MediaPipe...'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative inline-block w-full">
                <div className="relative">
                  <WebcamCapture
                    onVideoReady={handleVideoReady}
                    width={640}
                    height={480}
                    className="w-full"
                  />
                  {videoRef.current && (
                    <SkeletonOverlay
                      videoElement={videoRef.current}
                      results={results}
                      width={640}
                      height={480}
                      showBody={enableBody}
                      showHands={enableHands}
                      showFace={enableFace}
                    />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Controls */}
          <Card>
            <CardHeader>
              <CardTitle>Controls</CardTitle>
              <CardDescription>
                Toggle tracking features and view status
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="body-toggle" className="text-sm font-medium">
                    Body Tracking
                  </label>
                  <Button
                    id="body-toggle"
                    variant={enableBody ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setEnableBody(!enableBody)}
                  >
                    {enableBody ? 'On' : 'Off'}
                  </Button>
                </div>

                <div className="flex items-center justify-between">
                  <label htmlFor="hands-toggle" className="text-sm font-medium">
                    Hands Tracking
                  </label>
                  <Button
                    id="hands-toggle"
                    variant={enableHands ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setEnableHands(!enableHands)}
                  >
                    {enableHands ? 'On' : 'Off'}
                  </Button>
                </div>

                <div className="flex items-center justify-between">
                  <label htmlFor="face-toggle" className="text-sm font-medium">
                    Face Tracking
                  </label>
                  <Button
                    id="face-toggle"
                    variant={enableFace ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setEnableFace(!enableFace)}
                  >
                    {enableFace ? 'On' : 'Off'}
                  </Button>
                </div>
              </div>

              <div className="pt-4 border-t">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status:</span>
                    <span className={isInitialized ? 'text-green-500' : 'text-yellow-500'}>
                      {isInitialized ? 'Ready' : 'Initializing...'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">FPS:</span>
                    <span>{fps}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Processing:</span>
                    <span className={isProcessing ? 'text-green-500' : 'text-gray-500'}>
                      {isProcessing ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t">
                <p className="text-xs text-muted-foreground">
                  <strong>Colors:</strong> Body (Green), Hands (Red/Blue), Face (Yellow)
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
