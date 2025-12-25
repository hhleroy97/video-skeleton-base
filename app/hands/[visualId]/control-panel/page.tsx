'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { HandTracking, type PinchVector, type Hand3DData } from '@/components/hand-tracking/HandTracking';
import { usePinchHistory, type FinalVector } from '@/components/hand-tracking/PinchHistoryTracker';
import { PinchControlled3D } from '@/components/hand-tracking/PinchControlled3D';
import { Hand3DVisual, type HandBoundingBox } from '@/components/hand-tracking/Hand3DVisual';
import { PrismHandVisual, type PrismHandControls, DEFAULT_PRISM_HAND_CONTROLS } from '@/components/hand-tracking/PrismHandVisual';
import { OneLineHandVisual, type OneLineHandControls, DEFAULT_ONE_LINE_CONTROLS } from '@/components/hand-tracking/OneLineHandVisual';
import { ConstellationVisual, type ConstellationControls, DEFAULT_CONSTELLATION_CONTROLS } from '@/components/hand-tracking/ConstellationVisual';
import { CONSTELLATION_PALETTES, isConstellationPaletteId } from '@/components/hand-tracking/constellationPalettes';
import { FpsOverlay } from '@/components/perf/FpsOverlay';
import type { HandModelOverlayMode } from '@/components/hand-tracking/handPose';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfigSaveLoad } from '@/components/hand-tracking/ConfigSaveLoad';
import { getVisualConfig } from '../../visuals-config';
import { notFound } from 'next/navigation';
import Link from 'next/link';

export default function ControlPanelPage({ params }: { params: Promise<{ visualId: string }> }) {
  const [pinchVector, setPinchVector] = useState<PinchVector | null>(null);
  const [finalVector, setFinalVector] = useState<FinalVector | null>(null);
  const [currentVector, setCurrentVector] = useState<FinalVector | null>(null);
  const [phaseAngles, setPhaseAngles] = useState<number[]>([]);
  const [rightHandDistance, setRightHandDistance] = useState<number | null>(null);
  const [nodesPerOrbit, setNodesPerOrbit] = useState(8);
  const [leftHanded, setLeftHanded] = useState(false);
  const [visualId, setVisualId] = useState<string>('');
  const [hands3D, setHands3D] = useState<Hand3DData[]>([]);
  const [boundingBoxes, setBoundingBoxes] = useState<HandBoundingBox[]>([]);
  const [handOverlayMode, setHandOverlayMode] = useState<HandModelOverlayMode>('skeleton');

  // Throttle hands3D updates to reduce React re-renders (perf optimization)
  const hands3DRef = useRef<Hand3DData[]>([]);
  const lastHands3DUpdateRef = useRef<number>(0);
  const HANDS_UPDATE_INTERVAL = 33; // ~30 fps for React state updates

  const handleHands3D = useCallback((hands: Hand3DData[]) => {
    hands3DRef.current = hands;
    const now = performance.now();
    if (now - lastHands3DUpdateRef.current >= HANDS_UPDATE_INTERVAL) {
      lastHands3DUpdateRef.current = now;
      setHands3D(hands);
    }
  }, []);
  const [prismControls, setPrismControls] = useState<PrismHandControls>(DEFAULT_PRISM_HAND_CONTROLS);
  const [oneLineControls, setOneLineControls] = useState<OneLineHandControls>(DEFAULT_ONE_LINE_CONTROLS);
  const [constellationControls, setConstellationControls] = useState<ConstellationControls>(DEFAULT_CONSTELLATION_CONTROLS);
  
  // Handle both sync and async params
  useEffect(() => {
    const anyParams = params as any;
    if (anyParams && typeof anyParams.then === 'function') {
      (anyParams as Promise<{ visualId: string }>).then(resolved => setVisualId(resolved.visualId));
      return;
    }
    if (anyParams && typeof anyParams.visualId === 'string') {
      setVisualId(anyParams.visualId);
    }
  }, [params]);
  
  // Track pinch history - only start and end points (always call hooks before early returns)
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
  
  const visualConfig = getVisualConfig(visualId);
  
  if (!visualId) {
    return <div className="flex items-center justify-center min-h-screen bg-gray-100">Loading...</div>;
  }
  
  if (!visualConfig) {
    notFound();
  }

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
      case 'BasicHandTracking':
        // Basic hand tracking doesn't need a separate visual component
        return null;
      case 'Hand3DVisual':
        return (
          <div className="w-full h-96">
            <Hand3DVisual hands={hands3D} onBoundingBoxes={setBoundingBoxes} overlayMode={handOverlayMode} />
          </div>
        );
      case 'PrismHandVisual':
        return (
          <div className="w-full h-96">
            <PrismHandVisual hands={hands3D} controls={prismControls} />
          </div>
        );
      case 'OneLineHandVisual':
        return (
          <div className="w-full h-96">
            <OneLineHandVisual hands={hands3D} controls={oneLineControls} />
          </div>
        );
      case 'ConstellationVisual':
        return (
          <div className="w-full h-96">
            <ConstellationVisual hands={hands3D} controls={constellationControls} />
          </div>
        );
      // Add more component cases here as needed
      default:
        return <div>Visual component not implemented yet</div>;
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 md:p-8 lg:p-24">
      <FpsOverlay position="bottom-left" />
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

        {visualConfig.component === 'BasicHandTracking' ? (
          // Simple layout for basic hand tracking - just camera feed
          <Card>
            <CardHeader>
              <CardTitle>Camera Feed</CardTitle>
              <CardDescription>
                Real-time hand tracking with skeleton overlay
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
                  leftHanded={leftHanded}
                />
              </div>
            </CardContent>
          </Card>
        ) : visualConfig.component === 'Hand3DVisual' || visualConfig.component === 'PrismHandVisual' || visualConfig.component === 'OneLineHandVisual' || visualConfig.component === 'ConstellationVisual' ? (
          // Layout for 3D hand visualization
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Camera Feed</CardTitle>
                  <CardDescription>
                    Real-time hand tracking - data feeds the 3D visualization
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
                      onHands3D={handleHands3D}
                      leftHanded={leftHanded}
                    />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>
                    {visualConfig.component === 'Hand3DVisual' ? '3D Hand Visualization' : visualConfig.component === 'PrismHandVisual' ? 'Prism Hand Visualization' : visualConfig.component === 'OneLineHandVisual' ? 'One Unbroken Line' : 'Constellation'}
                  </CardTitle>
                  <CardDescription>
                    {visualConfig.component === 'Hand3DVisual'
                      ? 'Interactive 3D view of hand landmarks in real-time with bounding box'
                      : visualConfig.component === 'PrismHandVisual'
                        ? 'Impressionistic prism shards tracing the hand bones'
                        : visualConfig.component === 'OneLineHandVisual'
                          ? 'Minimalist continuous stroke with fractal-like noise'
                          : 'Your hand as a cosmos: 21 stars with nebulae'}
                  </CardDescription>
                  {visualConfig.component === 'Hand3DVisual' && (
                    <>
                      <div className="mt-3 flex gap-2">
                        <button
                          className={`px-3 py-1 rounded text-sm transition-colors ${
                            handOverlayMode === 'skeleton'
                              ? 'bg-gray-900 text-white'
                              : 'bg-gray-200 text-gray-900 hover:bg-gray-300'
                          }`}
                          onClick={() => setHandOverlayMode('skeleton')}
                        >
                          Skeleton
                        </button>
                        <button
                          className={`px-3 py-1 rounded text-sm transition-colors ${
                            handOverlayMode === 'model' ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-900 hover:bg-gray-300'
                          }`}
                          onClick={() => setHandOverlayMode('model')}
                        >
                          Model
                        </button>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        GLB path: <span className="font-mono">/public/models/rigged_hand.glb</span> (served as{' '}
                        <span className="font-mono">/models/rigged_hand.glb</span>)
                      </div>
                    </>
                  )}
                </CardHeader>
                <CardContent>
                  {renderVisual()}
                </CardContent>
              </Card>
            </div>

            {visualConfig.component === 'PrismHandVisual' && (
              <Card>
                <CardHeader>
                  <CardTitle>Prism Controls</CardTitle>
                  <CardDescription>Adjust motion + gradient of the trails</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Spin (base)</span>
                        <span className="font-mono">{prismControls.spinBase.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.01"
                        value={prismControls.spinBase}
                        onChange={(e) => setPrismControls((c) => ({ ...c, spinBase: parseFloat(e.target.value) }))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Twist (base)</span>
                        <span className="font-mono">{prismControls.twistBase.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max={Math.PI * 2}
                        step="0.01"
                        value={prismControls.twistBase}
                        onChange={(e) => setPrismControls((c) => ({ ...c, twistBase: parseFloat(e.target.value) }))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Hue speed</span>
                        <span className="font-mono">{prismControls.hueSpeed.toFixed(3)}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="0.2"
                        step="0.001"
                        value={prismControls.hueSpeed}
                        onChange={(e) => setPrismControls((c) => ({ ...c, hueSpeed: parseFloat(e.target.value) }))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Opacity</span>
                        <span className="font-mono">{prismControls.opacity.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.1"
                        max="1"
                        step="0.01"
                        value={prismControls.opacity}
                        onChange={(e) => setPrismControls((c) => ({ ...c, opacity: parseFloat(e.target.value) }))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Smoothing (tension)</span>
                        <span className="font-mono">{prismControls.curveTension.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={prismControls.curveTension}
                        onChange={(e) => setPrismControls((c) => ({ ...c, curveTension: parseFloat(e.target.value) }))}
                        className="w-full"
                      />
                    </div>
                    <button
                      className="px-3 py-2 rounded bg-gray-900 text-white text-sm hover:bg-gray-800"
                      onClick={() => setPrismControls(DEFAULT_PRISM_HAND_CONTROLS)}
                    >
                      Reset
                    </button>
                    <div className="text-xs text-muted-foreground">
                      Note: pinch also increases twist/brightness dynamically.
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {visualConfig.component === 'PrismHandVisual' && (
              <ConfigSaveLoad
                visualId={visualId}
                currentControls={prismControls}
                onLoadConfig={(controls) => setPrismControls(controls as typeof prismControls)}
              />
            )}

            {visualConfig.component === 'OneLineHandVisual' && (
              <Card>
                <CardHeader>
                  <CardTitle>Line Controls</CardTitle>
                  <CardDescription>Adjust the continuous stroke style</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Noise Amount</span>
                        <span className="font-mono">{oneLineControls.noiseAmount.toFixed(3)}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="0.1"
                        step="0.001"
                        value={oneLineControls.noiseAmount}
                        onChange={(e) => setOneLineControls((c) => ({ ...c, noiseAmount: parseFloat(e.target.value) }))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Noise Scale</span>
                        <span className="font-mono">{oneLineControls.noiseScale.toFixed(1)}</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="30"
                        step="0.5"
                        value={oneLineControls.noiseScale}
                        onChange={(e) => setOneLineControls((c) => ({ ...c, noiseScale: parseFloat(e.target.value) }))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Draw Speed</span>
                        <span className="font-mono">{oneLineControls.drawSpeed.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="0.95"
                        step="0.01"
                        value={oneLineControls.drawSpeed}
                        onChange={(e) => setOneLineControls((c) => ({ ...c, drawSpeed: parseFloat(e.target.value) }))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Line Width</span>
                        <span className="font-mono">{oneLineControls.lineWidth.toFixed(1)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.5"
                        max="8"
                        step="0.1"
                        value={oneLineControls.lineWidth}
                        onChange={(e) => setOneLineControls((c) => ({ ...c, lineWidth: parseFloat(e.target.value) }))}
                        className="w-full"
                      />
                    </div>
                    <button
                      className="px-3 py-2 rounded bg-gray-900 text-white text-sm hover:bg-gray-800"
                      onClick={() => setOneLineControls(DEFAULT_ONE_LINE_CONTROLS)}
                    >
                      Reset
                    </button>
                    <div className="text-xs text-muted-foreground">
                      Draw Speed = 0 for instant drawing, higher = animated reveal.
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {visualConfig.component === 'OneLineHandVisual' && (
              <ConfigSaveLoad
                visualId={visualId}
                currentControls={oneLineControls}
                onLoadConfig={(controls) => setOneLineControls(controls as typeof oneLineControls)}
              />
            )}

            {visualConfig.component === 'ConstellationVisual' && (
              <Card>
                <CardHeader>
                  <CardTitle>Cosmos Controls</CardTitle>
                  <CardDescription>Adjust the stars, nebulae, and cosmic depth</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Color palette</span>
                        <span className="font-mono">{constellationControls.palette}</span>
                      </div>
                      <select
                        value={constellationControls.palette}
                        onChange={(e) => {
                          const next = e.target.value;
                          setConstellationControls((c) => ({
                            ...c,
                            palette: isConstellationPaletteId(next) ? next : c.palette,
                          }));
                        }}
                        className="w-full px-2 py-1 rounded bg-white border border-gray-200 text-sm"
                      >
                        {CONSTELLATION_PALETTES.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {CONSTELLATION_PALETTES.find((p) => p.id === constellationControls.palette)?.description}
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={constellationControls.showHandSkeleton}
                        onChange={(e) =>
                          setConstellationControls((c) => ({ ...c, showHandSkeleton: e.target.checked }))
                        }
                        className="w-4 h-4"
                      />
                      <span>Show hand skeleton</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={constellationControls.showNebulaTrails}
                        onChange={(e) =>
                          setConstellationControls((c) => ({ ...c, showNebulaTrails: e.target.checked }))
                        }
                        className="w-4 h-4"
                      />
                      <span>Nebula trails</span>
                    </label>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Star Brightness</span>
                        <span className="font-mono">{constellationControls.starBrightness.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.1"
                        max="1"
                        step="0.01"
                        value={constellationControls.starBrightness}
                        onChange={(e) => setConstellationControls((c) => ({ ...c, starBrightness: parseFloat(e.target.value) }))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Nebula Intensity</span>
                        <span className="font-mono">{constellationControls.nebulaIntensity.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={constellationControls.nebulaIntensity}
                        onChange={(e) => setConstellationControls((c) => ({ ...c, nebulaIntensity: parseFloat(e.target.value) }))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Nebula Radius</span>
                        <span className="font-mono">{constellationControls.nebulaRadius.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.1"
                        max="2.5"
                        step="0.05"
                        value={constellationControls.nebulaRadius}
                        onChange={(e) => setConstellationControls((c) => ({ ...c, nebulaRadius: parseFloat(e.target.value) }))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Nebula Count</span>
                        <span className="font-mono">{constellationControls.nebulaParticleCount}</span>
                      </div>
                      <input
                        type="range"
                        min="50"
                        max="1200"
                        step="10"
                        value={constellationControls.nebulaParticleCount}
                        onChange={(e) => setConstellationControls((c) => ({ ...c, nebulaParticleCount: parseInt(e.target.value, 10) }))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Nebula Particle Size</span>
                        <span className="font-mono">{constellationControls.nebulaParticleSize.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.01"
                        max="0.3"
                        step="0.01"
                        value={constellationControls.nebulaParticleSize}
                        onChange={(e) => setConstellationControls((c) => ({ ...c, nebulaParticleSize: parseFloat(e.target.value) }))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Constellation Lines</span>
                        <span className="font-mono">{constellationControls.constellationOpacity.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={constellationControls.constellationOpacity}
                        onChange={(e) => setConstellationControls((c) => ({ ...c, constellationOpacity: parseFloat(e.target.value) }))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Cosmic Depth</span>
                        <span className="font-mono">{constellationControls.cosmicDepth.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={constellationControls.cosmicDepth}
                        onChange={(e) => setConstellationControls((c) => ({ ...c, cosmicDepth: parseFloat(e.target.value) }))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Twinkle Speed</span>
                        <span className="font-mono">{constellationControls.twinkleSpeed.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.05"
                        value={constellationControls.twinkleSpeed}
                        onChange={(e) => setConstellationControls((c) => ({ ...c, twinkleSpeed: parseFloat(e.target.value) }))}
                        className="w-full"
                      />
                    </div>
                    <div className="text-sm font-medium text-muted-foreground mt-4 mb-2">Flocking Physics</div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Attraction Strength</span>
                        <span className="font-mono">{constellationControls.attractionStrength.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="3"
                        step="0.05"
                        value={constellationControls.attractionStrength}
                        onChange={(e) => setConstellationControls((c) => ({ ...c, attractionStrength: parseFloat(e.target.value) }))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Separation Strength</span>
                        <span className="font-mono">{constellationControls.separationStrength.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.05"
                        value={constellationControls.separationStrength}
                        onChange={(e) => setConstellationControls((c) => ({ ...c, separationStrength: parseFloat(e.target.value) }))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Separation Radius</span>
                        <span className="font-mono">{constellationControls.separationRadius.toFixed(3)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.02"
                        max="0.15"
                        step="0.005"
                        value={constellationControls.separationRadius}
                        onChange={(e) => setConstellationControls((c) => ({ ...c, separationRadius: parseFloat(e.target.value) }))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Motion Repulsion</span>
                        <span className="font-mono">{constellationControls.motionRepulsion.toFixed(1)}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="15"
                        step="0.5"
                        value={constellationControls.motionRepulsion}
                        onChange={(e) => setConstellationControls((c) => ({ ...c, motionRepulsion: parseFloat(e.target.value) }))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Damping</span>
                        <span className="font-mono">{constellationControls.damping.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.8"
                        max="0.99"
                        step="0.01"
                        value={constellationControls.damping}
                        onChange={(e) => setConstellationControls((c) => ({ ...c, damping: parseFloat(e.target.value) }))}
                        className="w-full"
                      />
                    </div>
                    <div className="text-sm font-medium text-muted-foreground mt-4 mb-2">Galaxy Field</div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Core Attraction</span>
                        <span className="font-mono">{constellationControls.coreAttraction.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="4"
                        step="0.05"
                        value={constellationControls.coreAttraction}
                        onChange={(e) => setConstellationControls((c) => ({ ...c, coreAttraction: parseFloat(e.target.value) }))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Orbit Swirl</span>
                        <span className="font-mono">{constellationControls.orbitStrength.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="4"
                        step="0.05"
                        value={constellationControls.orbitStrength}
                        onChange={(e) => setConstellationControls((c) => ({ ...c, orbitStrength: parseFloat(e.target.value) }))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Arm Count</span>
                        <span className="font-mono">{constellationControls.armCount}</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="6"
                        step="1"
                        value={constellationControls.armCount}
                        onChange={(e) => setConstellationControls((c) => ({ ...c, armCount: parseInt(e.target.value, 10) }))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Arm Strength</span>
                        <span className="font-mono">{constellationControls.armStrength.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="4"
                        step="0.05"
                        value={constellationControls.armStrength}
                        onChange={(e) => setConstellationControls((c) => ({ ...c, armStrength: parseFloat(e.target.value) }))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Arm Width</span>
                        <span className="font-mono">{constellationControls.armWidth.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.05"
                        max="1.5"
                        step="0.05"
                        value={constellationControls.armWidth}
                        onChange={(e) => setConstellationControls((c) => ({ ...c, armWidth: parseFloat(e.target.value) }))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Spiral Pitch</span>
                        <span className="font-mono">{constellationControls.spiralPitch.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="-2"
                        max="2"
                        step="0.05"
                        value={constellationControls.spiralPitch}
                        onChange={(e) => setConstellationControls((c) => ({ ...c, spiralPitch: parseFloat(e.target.value) }))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Pattern Speed</span>
                        <span className="font-mono">{constellationControls.patternSpeed.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="-3"
                        max="3"
                        step="0.05"
                        value={constellationControls.patternSpeed}
                        onChange={(e) => setConstellationControls((c) => ({ ...c, patternSpeed: parseFloat(e.target.value) }))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Turbulence</span>
                        <span className="font-mono">{constellationControls.turbulence.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.05"
                        value={constellationControls.turbulence}
                        onChange={(e) => setConstellationControls((c) => ({ ...c, turbulence: parseFloat(e.target.value) }))}
                        className="w-full"
                      />
                    </div>
                    {constellationControls.showNebulaTrails && (
                      <>
                        <div className="text-sm font-medium text-muted-foreground mt-4 mb-2">Trails</div>
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span>Trail length</span>
                            <span className="font-mono">{constellationControls.trailLength}</span>
                          </div>
                          <input
                            type="range"
                            min="2"
                            max="40"
                            step="1"
                            value={constellationControls.trailLength}
                            onChange={(e) => setConstellationControls((c) => ({ ...c, trailLength: parseInt(e.target.value, 10) }))}
                            className="w-full"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span>Trail opacity</span>
                            <span className="font-mono">{constellationControls.trailOpacity.toFixed(2)}</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={constellationControls.trailOpacity}
                            onChange={(e) => setConstellationControls((c) => ({ ...c, trailOpacity: parseFloat(e.target.value) }))}
                            className="w-full"
                          />
                        </div>
                      </>
                    )}
                    <button
                      className="px-3 py-2 rounded bg-gray-900 text-white text-sm hover:bg-gray-800"
                      onClick={() => setConstellationControls(DEFAULT_CONSTELLATION_CONTROLS)}
                    >
                      Reset
                    </button>
                    <div className="text-xs text-muted-foreground">
                      Open hand increases orbit swirl. Pinch still brightens stars.
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {visualConfig.component === 'ConstellationVisual' && (
              <ConfigSaveLoad
                visualId={visualId}
                currentControls={constellationControls}
                onLoadConfig={(controls) => setConstellationControls(controls as typeof constellationControls)}
              />
            )}
            
            {/* Bounding Box Data */}
            {visualConfig.component === 'Hand3DVisual' && (
              <Card>
                <CardHeader>
                  <CardTitle>Bounding Box Data</CardTitle>
                  <CardDescription>Real-time bounding box information for detected hands</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {boundingBoxes.length > 0 ? (
                      boundingBoxes.map((bbox, index) => (
                        <div key={index} className="border-l-4 border-blue-500 pl-4">
                          <h3 className="text-sm font-semibold mb-2">
                            Hand {index + 1} {hands3D[index]?.handedness && `(${hands3D[index].handedness})`}
                          </h3>
                          <div className="space-y-2 font-mono text-xs">
                            <div>
                              <span className="font-semibold">Center Position:</span>
                              <div className="ml-4 mt-1">
                                <div>X: {bbox.center.x.toFixed(4)}</div>
                                <div>Y: {bbox.center.y.toFixed(4)}</div>
                                <div>Z: {bbox.center.z.toFixed(4)}</div>
                              </div>
                            </div>
                            <div>
                              <span className="font-semibold">Size:</span>
                              <div className="ml-4 mt-1">
                                <div>Width: {bbox.size.width.toFixed(4)}</div>
                                <div>Height: {bbox.size.height.toFixed(4)}</div>
                                <div>Depth: {bbox.size.depth.toFixed(4)}</div>
                              </div>
                            </div>
                            <div>
                              <span className="font-semibold">Bounds:</span>
                              <div className="ml-4 mt-1">
                                <div>
                                  Min: ({bbox.min.x.toFixed(3)}, {bbox.min.y.toFixed(3)}, {bbox.min.z.toFixed(3)})
                                </div>
                                <div>
                                  Max: ({bbox.max.x.toFixed(3)}, {bbox.max.y.toFixed(3)}, {bbox.max.z.toFixed(3)})
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-gray-500 text-sm">No hands detected</div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          // Full layout for other visuals with data and visual component
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
        )}
      </div>
    </main>
  );
}
