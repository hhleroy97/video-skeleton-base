'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';

interface WebcamCaptureProps {
  onVideoReady?: (videoElement: HTMLVideoElement) => void;
  onError?: (error: Error) => void;
  width?: number;
  height?: number;
  className?: string;
}

/**
 * WebcamCapture component that handles webcam access and video stream
 */
export function WebcamCapture({
  onVideoReady,
  onError,
  width = 640,
  height = 480,
  className,
}: WebcamCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Start webcam capture
   */
  const startCapture = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Request camera access
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: width },
          height: { ideal: height },
          facingMode: 'user',
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsActive(true);
        setIsLoading(false);
        
        // Notify parent that video is ready
        if (onVideoReady && videoRef.current) {
          onVideoReady(videoRef.current);
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to access webcam');
      setError(error.message);
      setIsLoading(false);
      setIsActive(false);
      
      if (onError) {
        onError(error);
      } else {
        console.error('Webcam access error:', error);
      }
    }
  }, [width, height, onVideoReady, onError]);

  /**
   * Stop webcam capture
   */
  const stopCapture = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsActive(false);
    setError(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCapture();
    };
  }, [stopCapture]);

  return (
    <div className={`flex flex-col items-center gap-4 ${className || ''}`}>
      <div className="relative inline-block">
        <video
          ref={videoRef}
          width={width}
          height={height}
          className="rounded-lg border-2 border-border bg-black"
          playsInline
          muted
        />
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg">
            <p className="text-white">Loading camera...</p>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-500/50 rounded-lg">
            <p className="text-white text-center p-4">{error}</p>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          onClick={isActive ? stopCapture : startCapture}
          disabled={isLoading}
          variant={isActive ? 'destructive' : 'default'}
        >
          {isActive ? 'Stop Camera' : 'Start Camera'}
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive text-center max-w-md">
          {error === 'Permission denied' || error.includes('permission')
            ? 'Camera permission denied. Please allow camera access in your browser settings.'
            : error}
        </p>
      )}
    </div>
  );
}

