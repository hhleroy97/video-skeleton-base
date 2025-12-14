'use client';

import { useEffect, useRef, useState } from 'react';
import type { FinalVector } from './PinchHistoryTracker';

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

// Calculate pinch vector (position and direction)
// Coordinates are in center-origin system: (0,0) is at center, range is -0.5 to 0.5
const calculatePinchVector = (
  thumbTip: any,
  indexTip: any
): { x: number; y: number; dx: number; dy: number } => {
  // Position: midpoint between thumb and index finger (normalized 0-1, top-left origin)
  const xNormalized = (thumbTip.x + indexTip.x) / 2;
  const yNormalized = (thumbTip.y + indexTip.y) / 2;
  
  // Convert to center-origin: (0,0) at center, range -0.5 to 0.5
  const x = xNormalized - 0.5;
  const y = yNormalized - 0.5;
  
  // Direction vector: from thumb to index finger (normalized)
  const dx = indexTip.x - thumbTip.x;
  const dy = indexTip.y - thumbTip.y;
  const magnitude = Math.sqrt(dx * dx + dy * dy);
  
  // Normalize direction vector
  const normalizedDx = magnitude > 0 ? dx / magnitude : 0;
  const normalizedDy = magnitude > 0 ? dy / magnitude : 0;
  
  return {
    x,
    y,
    dx: normalizedDx,
    dy: normalizedDy,
  };
};

// Detect pinch gesture (thumb and index finger close together)
const detectPinch = (
  landmarks: any[],
  threshold: number = 0.05
): {
  isPinching: boolean;
  distance: number;
  pinchStrength: number;
  vector?: { x: number; y: number; dx: number; dy: number };
} => {
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

  // Calculate vector when pinching
  const vector = isPinching ? calculatePinchVector(thumbTip, indexTip) : undefined;

  return { isPinching, distance, pinchStrength, vector };
};

export interface PinchVector {
  x: number; // Position X (normalized 0-1)
  y: number; // Position Y (normalized 0-1)
  dx: number; // Direction X (normalized)
  dy: number; // Direction Y (normalized)
}

export interface HandTrackingProps {
  onPinchVector?: (vector: PinchVector | null) => void;
  compositeVector?: FinalVector | null; // Composite vector to draw on canvas
  onRightHandDistance?: (distance: number | null) => void; // Distance between thumb and index on right hand
}

export function HandTracking({ onPinchVector, compositeVector, onRightHandDistance }: HandTrackingProps = {}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const compositeVectorRef = useRef<FinalVector | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [scriptsLoaded, setScriptsLoaded] = useState(false);
  const [initFunction, setInitFunction] = useState<(() => Promise<void>) | null>(null);
  
  // Keep compositeVector ref up to date
  useEffect(() => {
    compositeVectorRef.current = compositeVector || null;
  }, [compositeVector]);

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

        // Initialize Hands with proper module configuration
        try {
          handsInstance = new HandsClass({
            locateFile: (file: string) => {
              return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
            },
            // Suppress Emscripten warnings about Module.arguments
            onRuntimeInitialized: () => {
              console.log('MediaPipe Hands runtime initialized');
            },
          });
        } catch (err: any) {
          // If initialization fails, try without onRuntimeInitialized
          console.warn('Initial Hands initialization failed, retrying:', err);
          handsInstance = new HandsClass({
            locateFile: (file: string) => {
              return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
            },
          });
        }

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

          let pinchVector: PinchVector | null = null;
          let pinchPosition: { x: number; y: number } | null = null; // Actual pinch position for drawing
          let originalDirection: { dx: number; dy: number } | null = null; // Original direction for drawing

          if (results.multiHandLandmarks) {
            // Match landmarks with handedness (if available)
            const hands = results.multiHandLandmarks.map((landmarks: any, index: number) => {
              // MediaPipe handedness can be an array or object
              let handedness = 'Unknown';
              if (results.multiHandedness && results.multiHandedness[index]) {
                const handData = results.multiHandedness[index];
                if (Array.isArray(handData) && handData[0]) {
                  handedness = handData[0].categoryName || 'Unknown';
                } else if (handData.categoryName) {
                  handedness = handData.categoryName;
                }
              }
              return {
                landmarks,
                handedness,
              };
            });
            
            // Find left hand and use it for phase angle control
            const leftHand = hands.find((hand: any) => hand.handedness === 'Left');
            
            // Use left hand if found, otherwise fallback to first hand
            // This ensures control always works
            const handToUse = leftHand || hands[0];
            
            
            // Only use left hand for 3D control (or first hand if no left hand detected)
            if (handToUse) {
              const pinch = detectPinch(handToUse.landmarks, 0.05);
              
              if (pinch.vector) {
                // Calculate actual pinch position from landmarks (midpoint of thumb and index)
                // Convert from center-origin to pixel coordinates
                const thumbTip = handToUse.landmarks[THUMB_TIP];
                const indexTip = handToUse.landmarks[INDEX_FINGER_TIP];
                if (thumbTip && indexTip) {
                  const centerX = canvas.width / 2;
                  const centerY = canvas.height / 2;
                  // Convert center-origin coordinates to pixel coordinates
                  pinchPosition = {
                    x: centerX + pinch.vector.x * canvas.width,
                    y: centerY + pinch.vector.y * canvas.height,
                  };
                }
                
                // Store original direction before flipping
                originalDirection = {
                  dx: pinch.vector.dx,
                  dy: pinch.vector.dy,
                };
                
                // Flip x coordinate for callback (since canvas is flipped)
                // In center-origin: flip x means negate it
                pinchVector = {
                  ...pinch.vector,
                  x: -pinch.vector.x,
                  dx: -pinch.vector.dx, // Also flip direction
                };
              }
            }
            
            // Draw both hands on canvas (but only left hand controls 3D)
            for (const hand of hands) {
              const pinch = detectPinch(hand.landmarks, 0.05);
              
              // Change color based on pinch state and handedness
              const isRightHand = hand.handedness === 'Right';
              const connectorColor = pinch.isPinching 
                ? (isRightHand ? '#FFFF00' : '#FF00FF') // Yellow for right, magenta for left when pinching
                : (isRightHand ? '#00FF00' : '#FF8800'); // Green for right, orange for left when not pinching
              const landmarkColor = pinch.isPinching 
                ? (isRightHand ? '#FF00FF' : '#00FFFF') // Magenta for right, cyan for left when pinching
                : (isRightHand ? '#FF0000' : '#FF6600'); // Red for right, orange-red for left when not pinching
              
              // Draw landmarks (will be flipped by the canvas transformation)
              drawConnectors(
                canvasCtx,
                hand.landmarks,
                HandsClass.HAND_CONNECTIONS || HAND_CONNECTIONS,
                { color: connectorColor, lineWidth: 5 }
              );
              drawLandmarks(canvasCtx, hand.landmarks, {
                color: landmarkColor,
                lineWidth: 2,
                radius: 3,
              });
            }
            
            // Draw circle between thumb and index finger of the other hand (right hand)
            // Find right hand: explicitly Right, or if 2 hands and one is Left, use the other one
            let rightHand = hands.find((hand: any) => hand.handedness === 'Right');
            
            // Fallback: if we have 2 hands and one is the left hand (used for control), 
            // the other one should be the right hand
            if (!rightHand && hands.length === 2 && handToUse) {
              rightHand = hands.find((hand: any) => hand !== handToUse);
            }
            
            // Another fallback: if we have 2 hands and handedness is Unknown, use the second hand
            if (!rightHand && hands.length === 2 && handToUse === hands[0]) {
              rightHand = hands[1];
            }
            
            if (rightHand) {
              const thumbTip = rightHand.landmarks[THUMB_TIP];
              const indexTip = rightHand.landmarks[INDEX_FINGER_TIP];
              
              if (thumbTip && indexTip) {
                // Calculate distance between thumb and index finger (normalized 0-1)
                const distance = calculateDistance(thumbTip, indexTip);
                
                // Report distance to parent component
                if (onRightHandDistance) {
                  onRightHandDistance(distance);
                }
                
                // Calculate midpoint between thumb and index finger
                // Canvas transformation already handles flipping, so use original coordinates
                const midX = ((thumbTip.x + indexTip.x) / 2) * canvas.width;
                const midY = ((thumbTip.y + indexTip.y) / 2) * canvas.height;
                
                // Calculate distance in pixels for circle radius
                const dx = (indexTip.x - thumbTip.x) * canvas.width;
                const dy = (indexTip.y - thumbTip.y) * canvas.height;
                const radius = Math.sqrt(dx * dx + dy * dy) / 2;
                
                // Only draw if radius is reasonable (fingers are separated)
                if (radius > 5) {
                  // Draw circle with border and no fill - make it more visible
                  canvasCtx.strokeStyle = '#00FFFF'; // Cyan border for visibility
                  canvasCtx.lineWidth = 3; // Thicker line
                  canvasCtx.beginPath();
                  canvasCtx.arc(midX, midY, radius, 0, 2 * Math.PI);
                  canvasCtx.stroke();
                }
              }
            } else {
              // No right hand detected
              if (onRightHandDistance) {
                onRightHandDistance(null);
              }
            }
            
            // Draw vector lines on the canvas when pinching
            // Use actual pinch position calculated from landmarks
            if (pinchPosition && pinchVector && originalDirection) {
              const vectorX = pinchPosition.x;
              const vectorY = pinchPosition.y;
              
              // Draw position vector (from center to pinch position)
              const centerX = canvas.width / 2;
              const centerY = canvas.height / 2;
              
              // Position vector: X component (red)
              canvasCtx.strokeStyle = '#ef4444';
              canvasCtx.lineWidth = 3;
              canvasCtx.setLineDash([]);
              canvasCtx.beginPath();
              canvasCtx.moveTo(centerX, centerY);
              canvasCtx.lineTo(vectorX, centerY);
              canvasCtx.stroke();
              
              // Position vector: Y component (green)
              canvasCtx.strokeStyle = '#22c55e';
              canvasCtx.beginPath();
              canvasCtx.moveTo(centerX, centerY);
              canvasCtx.lineTo(centerX, vectorY);
              canvasCtx.stroke();
              
              // Draw pinch position point (exactly where user is pinching)
              canvasCtx.fillStyle = '#FFFF00';
              canvasCtx.beginPath();
              canvasCtx.arc(vectorX, vectorY, 8, 0, 2 * Math.PI);
              canvasCtx.fill();
              canvasCtx.strokeStyle = '#000';
              canvasCtx.lineWidth = 2;
              canvasCtx.stroke();
              
              // Draw center point
              canvasCtx.fillStyle = '#000';
              canvasCtx.beginPath();
              canvasCtx.arc(centerX, centerY, 5, 0, 2 * Math.PI);
              canvasCtx.fill();
              
              // Reset line style
              canvasCtx.setLineDash([]);
            }
          }
          
          // Call callback with vector (or null if not pinching)
          if (onPinchVector) {
            onPinchVector(pinchVector);
          }
          
          // Draw composite vector LAST so it appears on top of everything
          // Note: Canvas is flipped horizontally, so coordinates need to account for the transformation
          const currentCompositeVector = compositeVectorRef.current;
          if (currentCompositeVector) {
            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2;
            
            // Convert center-origin coordinates to canvas pixel coordinates
            // The canvas is flipped horizontally, so we need to account for that
            // Canvas transformation: translate(width, 0) then scale(-1, 1)
            // This means: screenX = width - canvasX, so canvasX = width - screenX
            // The compositeVector coordinates come from pinchVector which has X already flipped (negated) for the callback
            // So compositeVector.startX = -originalX where originalX is the center-origin coordinate
            // For screen position: screenX = centerX + originalX * width = centerX - compositeVector.startX * width
            // For canvas position (accounting for flip): canvasX = width - screenX = width - (centerX - compositeVector.startX * width)
            // = width - centerX + compositeVector.startX * width = centerX + compositeVector.startX * width
            // But since canvas is flipped, we need to flip X again: canvasX = centerX - compositeVector.startX * width
            const startX = centerX - currentCompositeVector.startX * canvas.width;
            const startY = centerY + currentCompositeVector.startY * canvas.height;
            const endX = centerX - currentCompositeVector.endX * canvas.width;
            const endY = centerY + currentCompositeVector.endY * canvas.height;
            
            // Make sure coordinates are valid and within canvas bounds
            if (!isNaN(startX) && !isNaN(startY) && !isNaN(endX) && !isNaN(endY)) {
              // Draw composite vector (from start to end) - thick purple line
              canvasCtx.strokeStyle = '#9333ea'; // Purple
              canvasCtx.lineWidth = 6;
              canvasCtx.setLineDash([]);
              canvasCtx.lineCap = 'round';
              canvasCtx.lineJoin = 'round';
              canvasCtx.beginPath();
              canvasCtx.moveTo(startX, startY);
              canvasCtx.lineTo(endX, endY);
              canvasCtx.stroke();
              
              // Draw arrowhead at the end
              const angle = Math.atan2(endY - startY, endX - startX);
              const arrowLength = 25;
              
              canvasCtx.strokeStyle = '#9333ea';
              canvasCtx.lineWidth = 6;
              canvasCtx.beginPath();
              canvasCtx.moveTo(endX, endY);
              canvasCtx.lineTo(
                endX - arrowLength * Math.cos(angle - Math.PI / 6),
                endY - arrowLength * Math.sin(angle - Math.PI / 6)
              );
              canvasCtx.moveTo(endX, endY);
              canvasCtx.lineTo(
                endX - arrowLength * Math.cos(angle + Math.PI / 6),
                endY - arrowLength * Math.sin(angle + Math.PI / 6)
              );
              canvasCtx.stroke();
              
              // Draw start point (red circle)
              canvasCtx.fillStyle = '#ef4444'; // Red
              canvasCtx.beginPath();
              canvasCtx.arc(startX, startY, 10, 0, 2 * Math.PI);
              canvasCtx.fill();
              canvasCtx.strokeStyle = '#ffffff';
              canvasCtx.lineWidth = 2;
              canvasCtx.stroke();
              
              // Draw end point (green circle)
              canvasCtx.fillStyle = '#22c55e'; // Green
              canvasCtx.beginPath();
              canvasCtx.arc(endX, endY, 10, 0, 2 * Math.PI);
              canvasCtx.fill();
              canvasCtx.strokeStyle = '#ffffff';
              canvasCtx.lineWidth = 2;
              canvasCtx.stroke();
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
  }, [onPinchVector]);

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
