'use client';

import { useEffect, useRef, useState } from 'react';

// Hand connections based on MediaPipe hand landmarks (21 points)
const HAND_CONNECTIONS: Array<[number, number]> = [
  // Thumb
  [0, 1], [1, 2], [2, 3], [3, 4],
  // Index finger
  [0, 5], [5, 6], [6, 7], [7, 8],
  // Middle finger
  [0, 9], [9, 10], [10, 11], [11, 12],
  // Ring finger
  [0, 13], [13, 14], [14, 15], [15, 16],
  // Pinky
  [0, 17], [17, 18], [18, 19], [19, 20],
  // Palm
  [5, 9], [9, 13], [13, 17],
];

// MediaPipe hand landmark indices
const THUMB_TIP = 4;
const INDEX_FINGER_TIP = 8;
const MIDDLE_FINGER_TIP = 12;
const RING_FINGER_TIP = 16;
const PINKY_TIP = 20;

// Calculate 3D distance between two landmarks
const calculateDistance = (point1: any, point2: any): number => {
  const dx = point1.x - point2.x;
  const dy = point1.y - point2.y;
  const dz = (point1.z || 0) - (point2.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

// Detect pinch gesture (thumb and index finger close together)
const detectPinch = (
  landmarks: any[],
  threshold: number = 0.05
): { isPinching: boolean; distance: number; pinchStrength: number } => {
  if (!landmarks || landmarks.length < 21) {
    return { isPinching: false, distance: Infinity, pinchStrength: 0 };
  }

  const thumbTip = landmarks[THUMB_TIP];
  const indexTip = landmarks[INDEX_FINGER_TIP];

  if (!thumbTip || !indexTip) {
    return { isPinching: false, distance: Infinity, pinchStrength: 0 };
  }

  const distance = calculateDistance(thumbTip, indexTip);
  const isPinching = distance < threshold;
  
  // Pinch strength: 0 (far apart) to 1 (touching)
  // Normalize based on threshold (closer = stronger)
  const pinchStrength = Math.max(0, Math.min(1, 1 - (distance / threshold)));

  return { isPinching, distance, pinchStrength };
};

export function HandTracking() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [scriptsLoaded, setScriptsLoaded] = useState(false);
  const [initFunction, setInitFunction] = useState<(() => Promise<void>) | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let handsInstance: any = null;
    let cameraInstance: any = null;
    let HandsClass: any = null;
    let CameraClass: any = null;
    let stream: MediaStream | null = null;

    // Simple drawing utilities (since DrawingUtils from CDN isn't working)
    const drawConnectors = (
      ctx: CanvasRenderingContext2D,
      points: any[],
      connections: any,
      style: { color?: string; lineWidth?: number }
    ) => {
      ctx.strokeStyle = style.color || '#00FF00';
      ctx.lineWidth = style.lineWidth || 2;
      ctx.beginPath();
      
      if (Array.isArray(connections)) {
        // If connections is an array of [from, to] pairs
        connections.forEach(([from, to]: [number, number]) => {
          if (points[from] && points[to]) {
            ctx.moveTo(points[from].x * ctx.canvas.width, points[from].y * ctx.canvas.height);
            ctx.lineTo(points[to].x * ctx.canvas.width, points[to].y * ctx.canvas.height);
          }
        });
      } else if (connections && typeof connections === 'object') {
        // If connections is an object with forEach method
        connections.forEach?.(([from, to]: [number, number]) => {
          if (points[from] && points[to]) {
            ctx.moveTo(points[from].x * ctx.canvas.width, points[from].y * ctx.canvas.height);
            ctx.lineTo(points[to].x * ctx.canvas.width, points[to].y * ctx.canvas.height);
          }
        });
      }
      
      ctx.stroke();
    };

    const drawLandmarks = (
      ctx: CanvasRenderingContext2D,
      points: any[],
      style: { color?: string; lineWidth?: number; radius?: number }
    ) => {
      const radius = style.radius || 2;
      ctx.fillStyle = style.color || '#FF0000';
      
      points.forEach((point: any) => {
        if (point) {
          ctx.beginPath();
          ctx.arc(
            point.x * ctx.canvas.width,
            point.y * ctx.canvas.height,
            radius,
            0,
            2 * Math.PI
          );
          ctx.fill();
        }
      });
    };

    const loadMediaPipeScripts = async (): Promise<void> => {
      return new Promise((resolve, reject) => {
        const maxWaitTime = 10000; // 10 seconds
        const startTime = Date.now();
        const win = window as any;
        
        const checkScripts = () => {
          // Check if both are available and are functions (constructors)
          const hasHands = win.Hands && typeof win.Hands === 'function';
          const hasCamera = win.Camera && typeof win.Camera === 'function';
          
          if (hasHands && hasCamera) {
            HandsClass = win.Hands;
            CameraClass = win.Camera;
            console.log('✅ MediaPipe scripts loaded successfully');
            console.log('HandsClass:', typeof HandsClass);
            console.log('CameraClass:', typeof CameraClass);
            setScriptsLoaded(true);
            resolve();
            return;
          }
          
          // Check for timeout
          const elapsed = Date.now() - startTime;
          if (elapsed > maxWaitTime) {
            console.error('❌ Timeout waiting for scripts');
            console.error('Hands:', !!win.Hands, typeof win.Hands);
            console.error('Camera:', !!win.Camera, typeof win.Camera);
            console.error('Available:', Object.keys(win).filter(k => k.includes('Hand') || k.includes('Camera')));
            reject(new Error('Timeout: MediaPipe scripts did not load within 10 seconds'));
            return;
          }
          
          // Log progress every second
          if (elapsed % 1000 < 100) {
            console.log(`Waiting for scripts... (${Math.floor(elapsed / 1000)}s) Hands: ${hasHands}, Camera: ${hasCamera}`);
          }
          
          // Keep checking
          setTimeout(checkScripts, 50);
        };
        
        // Start checking immediately
        checkScripts();
      });
    };

    const init = async (): Promise<void> => {
      try {
        console.log('Waiting for MediaPipe scripts to load...');
        await loadMediaPipeScripts();
        console.log('MediaPipe scripts loaded.');

        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) {
          console.error('Video or canvas element not found');
          setError('Video or canvas element not found');
          setIsLoading(false);
          return;
        }

        const canvasCtx = canvas.getContext('2d');
        if (!canvasCtx) {
          console.error('Could not get canvas context');
          setError('Could not get canvas context');
          setIsLoading(false);
          return;
        }

        // Verify HandsClass is a constructor
        if (typeof HandsClass !== 'function') {
          console.error('HandsClass is not a constructor. Type:', typeof HandsClass);
          console.error('HandsClass value:', HandsClass);
          throw new Error('Hands is not a constructor');
        }

        // Initialize Hands
        handsInstance = new HandsClass({
          locateFile: (file: string) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
          },
        });

        handsInstance.setOptions({
          maxNumHands: 2,
          modelComplexity: 1,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        let firstFrameReceived = false;
        handsInstance.onResults((results: any) => {
          // Hide loading spinner on first frame
          if (!firstFrameReceived) {
            firstFrameReceived = true;
            setIsLoading(false);
            console.log('First frame received, camera is working');
          }

          canvasCtx.save();
          canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
          
          // Flip horizontally (mirror mode) - translate to right edge, then scale x by -1
          canvasCtx.translate(canvas.width, 0);
          canvasCtx.scale(-1, 1);
          
          // Draw the video image (will be flipped by the transformation)
          canvasCtx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

          if (results.multiHandLandmarks) {
            for (const landmarks of results.multiHandLandmarks) {
              // Detect pinch for this hand
              const pinch = detectPinch(landmarks, 0.05);
              
              // Change color based on pinch state
              const connectorColor = pinch.isPinching ? '#FFFF00' : '#00FF00'; // Yellow when pinching, green otherwise
              const landmarkColor = pinch.isPinching ? '#FF00FF' : '#FF0000'; // Magenta when pinching, red otherwise
              
              // Draw landmarks (will be flipped by the canvas transformation)
              drawConnectors(
                canvasCtx,
                landmarks,
                HandsClass.HAND_CONNECTIONS || HAND_CONNECTIONS,
                { color: connectorColor, lineWidth: 5 }
              );
              drawLandmarks(canvasCtx, landmarks, {
                color: landmarkColor,
                lineWidth: 2,
                radius: 3,
              });
            }
          }
          canvasCtx.restore();
        });

        // Set canvas dimensions to match video
        canvas.width = 640;
        canvas.height = 480;

        // Request camera permissions explicitly
        console.log('=== REQUESTING CAMERA PERMISSIONS ===');
        console.log('navigator.mediaDevices:', navigator.mediaDevices);
        console.log('getUserMedia available:', typeof navigator.mediaDevices?.getUserMedia);
        
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('getUserMedia is not available. Are you using HTTPS or localhost?');
        }
        
        try {
          console.log('Calling getUserMedia now...');
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 640 },
              height: { ideal: 480 },
            },
          });
          console.log('=== CAMERA PERMISSION GRANTED ===');
          console.log('Stream:', stream);
          console.log('Stream tracks:', stream.getTracks());
          
          // Set the stream to the video element
          video.srcObject = stream;
          video.play();
          
          // Wait for video to be ready
          await new Promise((resolve) => {
            video.onloadedmetadata = () => {
              console.log('Video metadata loaded');
              resolve(undefined);
            };
          });
        } catch (permError: any) {
          console.error('Camera permission error:', permError);
          setError(`Camera permission denied: ${permError.message}. Please allow camera access and refresh.`);
          setIsLoading(false);
          return;
        }

        // Initialize Camera with the video element that now has the stream
        console.log('Initializing MediaPipe Camera...');
        cameraInstance = new CameraClass(video, {
          onFrame: async () => {
            await handsInstance.send({ image: video });
          },
          width: 640,
          height: 480,
        });
        
        console.log('Starting MediaPipe Camera...');
        cameraInstance.start();
        console.log('MediaPipe Camera start() called');

        // Set a timeout to hide loading if no frames arrive
        setTimeout(() => {
          if (!firstFrameReceived) {
            console.warn('No frames received after 5 seconds');
            setError('Camera may not be working. Please check your camera permissions and try again.');
            setIsLoading(false);
          }
        }, 5000);

        console.log('Hand tracking initialization complete');
      } catch (error: any) {
        console.error('Error initializing MediaPipe:', error);
        setError(error?.message || 'Failed to initialize hand tracking');
        setIsLoading(false);
      }
    };

    // Store init function so it can be called manually
    const initPromise = init();
    setInitFunction(() => init);

    return () => {
      // Stop MediaPipe Camera
      if (cameraInstance) {
        try {
          cameraInstance.stop();
        } catch (e) {
          console.error('Error stopping camera:', e);
        }
      }
      
      // Stop MediaPipe Hands
      if (handsInstance) {
        try {
          handsInstance.close();
        } catch (e) {
          console.error('Error closing hands:', e);
        }
      }
      
      // Stop video stream
      if (stream) {
        stream.getTracks().forEach(track => {
          track.stop();
          console.log('Stopped video track:', track.kind);
        });
      }
      
      // Clear video srcObject
      const video = videoRef.current;
      if (video) {
        video.srcObject = null;
      }
    };
  }, []);

  const handleStartCamera = async () => {
    if (initFunction) {
      setIsLoading(true);
      setError(null);
      try {
        await initFunction();
      } catch (err: any) {
        setError(err?.message || 'Failed to start camera');
        setIsLoading(false);
      }
    }
  };

  return (
    <div className="relative inline-block w-full">
      <video
        ref={videoRef}
        style={{ display: 'none' }}
        width={640}
        height={480}
        autoPlay
        playsInline
        muted
      />
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={640}
          height={480}
          className="w-full max-w-full h-auto border border-gray-300 rounded-lg"
        />
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 bg-opacity-75 rounded-lg">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-2"></div>
              <p className="text-sm text-gray-700">
                {scriptsLoaded ? 'Requesting camera access...' : 'Loading MediaPipe scripts...'}
              </p>
              {scriptsLoaded && (
                <p className="text-xs text-gray-500 mt-2">
                  If no prompt appears, check browser console for errors
                </p>
              )}
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-50 bg-opacity-90 rounded-lg">
            <div className="text-center p-4">
              <p className="text-sm text-red-700 font-medium mb-2">{error}</p>
              {initFunction && (
                <button
                  onClick={handleStartCamera}
                  className="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
                >
                  Try Again
                </button>
              )}
            </div>
          </div>
        )}
        {!isLoading && !error && scriptsLoaded && (
          <div className="absolute top-2 right-2">
            <button
              onClick={handleStartCamera}
              className="px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600"
            >
              Restart Camera
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
