'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { HandTracking, type PinchVector, type Hand3DData } from '@/components/hand-tracking/HandTracking';
import { usePinchHistory, type FinalVector } from '@/components/hand-tracking/PinchHistoryTracker';
import { PinchControlled3D } from '@/components/hand-tracking/PinchControlled3D';
import { Hand3DVisual } from '@/components/hand-tracking/Hand3DVisual';
import { PrismHandVisual, type PrismHandControls, DEFAULT_PRISM_HAND_CONTROLS } from '@/components/hand-tracking/PrismHandVisual';
import { OneLineHandVisual, type OneLineHandControls, DEFAULT_ONE_LINE_CONTROLS } from '@/components/hand-tracking/OneLineHandVisual';
import { ConstellationVisual, type ConstellationControls, DEFAULT_CONSTELLATION_CONTROLS } from '@/components/hand-tracking/ConstellationVisual';
import { CONSTELLATION_PALETTES, isConstellationPaletteId } from '@/components/hand-tracking/constellationPalettes';
import { FpsOverlay } from '@/components/perf/FpsOverlay';
import type { HandModelOverlayMode } from '@/components/hand-tracking/handPose';
import { ConfigSaveLoadCompact } from '@/components/hand-tracking/ConfigSaveLoadCompact';
import { getVisualConfig } from '../visuals-config';
import { notFound } from 'next/navigation';
import Link from 'next/link';

export default function VisualPage({ params }: { params: Promise<{ visualId: string }> }) {
  const [pinchVector, setPinchVector] = useState<PinchVector | null>(null);
  const [finalVector, setFinalVector] = useState<FinalVector | null>(null);
  const [currentVector, setCurrentVector] = useState<FinalVector | null>(null);
  const [phaseAngles, setPhaseAngles] = useState<number[]>([]);
  const [rightHandDistance, setRightHandDistance] = useState<number | null>(null);
  const [nodesPerOrbit, setNodesPerOrbit] = useState(8);
  const [leftHanded, setLeftHanded] = useState(false);
  const [visualId, setVisualId] = useState<string>('');
  const [hands3D, setHands3D] = useState<Hand3DData[]>([]);
  const [handOverlayMode, setHandOverlayMode] = useState<HandModelOverlayMode>('skeleton');

  // Throttle hands3D updates to reduce React re-renders (perf optimization)
  const hands3DRef = useRef<Hand3DData[]>([]);
  const lastHands3DUpdateRef = useRef<number>(0);
  const HANDS_UPDATE_INTERVAL = 33; // ~30 fps for React state updates (visuals read at 60fps via useFrame)

  const handleHands3D = useCallback((hands: Hand3DData[]) => {
    // Always update the ref (for immediate access by visuals)
    hands3DRef.current = hands;
    // Throttle React state updates to reduce re-renders
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
  
  // Track pinch history - always call hooks before early returns
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
    return <div className="flex items-center justify-center w-screen h-screen bg-white text-black">Loading...</div>;
  }
  
  if (!visualConfig) {
    notFound();
  }

  // Render based on visual component type
  const renderVisual = () => {
    switch (visualConfig.component) {
      case 'PinchControlled3D':
        return (
          <PinchControlled3D 
            vector={pinchVector} 
            nodesPerOrbit={nodesPerOrbit} 
            onPhaseAnglesChange={setPhaseAngles}
            fullscreen={visualConfig.fullscreen ?? false}
          />
        );
      case 'BasicHandTracking':
        // Fullscreen hand tracking - no overlay needed
        return null;
      case 'Hand3DVisual':
        // 3D hand visualization - rendered separately
        return null;
      case 'PrismHandVisual':
        // Prism hand visualization - rendered separately
        return null;
      case 'OneLineHandVisual':
        // One line hand visualization - rendered separately
        return null;
      case 'ConstellationVisual':
        // Constellation visualization - rendered separately
        return null;
      // Add more component cases here as needed
      default:
        return <div>Visual component not implemented yet</div>;
    }
  };

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-white">
      <FpsOverlay position="bottom-left" />
      {/* Navigation bar */}
      <div className="absolute top-4 left-4 z-50 flex gap-2">
        <Link
          href="/hands"
          className="px-4 py-2 bg-gray-800/80 text-white rounded-lg hover:bg-gray-700/80 transition-colors backdrop-blur-sm"
        >
          ← Back to Hands
        </Link>
        <Link
          href={`/hands/${visualId}/control-panel`}
          className="px-4 py-2 bg-blue-600/80 text-white rounded-lg hover:bg-blue-700/80 transition-colors backdrop-blur-sm"
        >
          Control Panel
        </Link>
      </div>

      {/* Visual component */}
      {renderVisual()}

      {/* 3D Hand Visualization - fullscreen background */}
      {visualConfig.component === 'Hand3DVisual' && (
        <div className="absolute inset-0 z-30">
          <Hand3DVisual hands={hands3D} className="w-full h-full" overlayMode={handOverlayMode} />
        </div>
      )}
      {visualConfig.component === 'PrismHandVisual' && (
        <div className="absolute inset-0 z-30">
          <PrismHandVisual hands={hands3D} className="w-full h-full" controls={prismControls} />
        </div>
      )}
      {visualConfig.component === 'OneLineHandVisual' && (
        <div className="absolute inset-0 z-30">
          <OneLineHandVisual hands={hands3D} className="w-full h-full" controls={oneLineControls} />
        </div>
      )}
      {visualConfig.component === 'ConstellationVisual' && (
        <div className="absolute inset-0 z-30">
          <ConstellationVisual hands={hands3D} className="w-full h-full" controls={constellationControls} />
        </div>
      )}

      {/* Camera feed - different layout based on visual type */}
      {visualConfig.component === 'BasicHandTracking' ? (
        // Fullscreen hand tracking
        <div className="absolute inset-0 z-40">
          <HandTracking 
            leftHanded={leftHanded}
            className="w-full h-full"
            hideRestartButton={true}
          />
        </div>
      ) : visualConfig.component === 'Hand3DVisual' || visualConfig.component === 'PrismHandVisual' || visualConfig.component === 'OneLineHandVisual' || visualConfig.component === 'ConstellationVisual' ? (
        // Small camera feed overlay for 3D hand visualization
        <div className="absolute bottom-4 right-4 z-50 w-48 h-36 rounded-lg overflow-hidden border-2 border-white/40 shadow-lg">
          <HandTracking
            onHands3D={handleHands3D}
            leftHanded={leftHanded}
            className="w-full h-full"
            hideRestartButton={true}
          />
        </div>
      ) : (
        // Circular camera feed overlay - centered (for other visuals)
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50">
          <div className="relative w-[300px] h-[300px] rounded-full">
            <div className="absolute inset-0 rounded-full border-4 border-white/40"></div>
            <div className="relative w-full h-full rounded-full overflow-hidden border-2 border-gray-600 bg-black m-1 [&_canvas]:absolute [&_canvas]:inset-0 [&_canvas]:w-full [&_canvas]:h-full [&_canvas]:object-cover [&_canvas]:!border-0 [&_canvas]:!rounded-none">
              <div className="absolute inset-0 [&>div]:absolute [&>div]:inset-0 [&>div]:w-full [&>div]:h-full [&>div>div]:absolute [&>div>div]:inset-0 [&>div>div]:w-full [&>div>div]:h-full">
                <HandTracking 
                  onPinchVector={setPinchVector}
                  compositeVector={currentVector || finalVector}
                  onRightHandDistance={setRightHandDistance}
                  leftHanded={leftHanded}
                  className="!border-0 !rounded-none"
                  hideRestartButton={true}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings overlay */}
      {visualConfig.component === 'Hand3DVisual' ? (
        <div className="absolute top-4 right-4 z-50">
          <div className="bg-gray-800/80 backdrop-blur-sm rounded-lg p-3 space-y-3">
            <div className="flex gap-2">
              <button
                className={`px-3 py-1 rounded text-sm transition-colors ${
                  handOverlayMode === 'skeleton' ? 'bg-white text-gray-900' : 'bg-gray-700 text-white hover:bg-gray-600'
                }`}
                onClick={() => setHandOverlayMode('skeleton')}
              >
                Skeleton
              </button>
              <button
                className={`px-3 py-1 rounded text-sm transition-colors ${
                  handOverlayMode === 'model' ? 'bg-white text-gray-900' : 'bg-gray-700 text-white hover:bg-gray-600'
                }`}
                onClick={() => setHandOverlayMode('model')}
              >
                Model
              </button>
            </div>
            <label className="flex items-center gap-2 text-sm text-white cursor-pointer">
              <input
                type="checkbox"
                checked={leftHanded}
                onChange={(e) => setLeftHanded(e.target.checked)}
                className="w-4 h-4"
              />
              <span>Left-handed</span>
            </label>
            <div className="text-xs text-gray-300">
              GLB path: <span className="font-mono">/models/hand.glb</span>
            </div>
          </div>
        </div>
      ) : visualConfig.component === 'PrismHandVisual' ? (
        <div className="absolute top-4 right-4 z-50">
          <div className="bg-gray-800/80 backdrop-blur-sm rounded-lg p-3 space-y-2">
            <div className="text-sm text-white font-medium">Prism Hand</div>
            <label className="flex items-center gap-2 text-sm text-white cursor-pointer">
              <input
                type="checkbox"
                checked={leftHanded}
                onChange={(e) => setLeftHanded(e.target.checked)}
                className="w-4 h-4"
              />
              <span>Left-handed</span>
            </label>
            <div className="space-y-2">
              <div className="text-xs text-gray-300">Controls</div>
              <div className="space-y-2 text-xs text-gray-200">
                <div>
                  <div className="flex justify-between">
                    <span>Spin</span>
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
                  <div className="flex justify-between">
                    <span>Twist</span>
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
                  <div className="flex justify-between">
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
                  <div className="flex justify-between">
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
              </div>
              <button
                className="w-full px-2 py-1 rounded bg-gray-700 text-white text-xs hover:bg-gray-600"
                onClick={() => setPrismControls(DEFAULT_PRISM_HAND_CONTROLS)}
              >
                Reset
              </button>
              <div className="text-[11px] text-gray-300">Pinch still intensifies twist/clarity.</div>
              <ConfigSaveLoadCompact
                visualId={visualId}
                currentControls={prismControls}
                onLoadConfig={(controls) => setPrismControls(controls as typeof prismControls)}
              />
            </div>
          </div>
        </div>
      ) : visualConfig.component === 'OneLineHandVisual' ? (
        <div className="absolute top-4 right-4 z-50">
          <div className="bg-gray-800/80 backdrop-blur-sm rounded-lg p-3 space-y-2">
            <div className="text-sm text-white font-medium">One Unbroken Line</div>
            <label className="flex items-center gap-2 text-sm text-white cursor-pointer">
              <input
                type="checkbox"
                checked={leftHanded}
                onChange={(e) => setLeftHanded(e.target.checked)}
                className="w-4 h-4"
              />
              <span>Left-handed</span>
            </label>
            <div className="space-y-2">
              <div className="text-xs text-gray-300">Controls</div>
              <div className="space-y-2 text-xs text-gray-200">
                <div>
                  <div className="flex justify-between">
                    <span>Noise</span>
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
                  <div className="flex justify-between">
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
                  <div className="flex justify-between">
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
                  <div className="flex justify-between">
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
              </div>
              <button
                className="w-full px-2 py-1 rounded bg-gray-700 text-white text-xs hover:bg-gray-600"
                onClick={() => setOneLineControls(DEFAULT_ONE_LINE_CONTROLS)}
              >
                Reset
              </button>
              <ConfigSaveLoadCompact
                visualId={visualId}
                currentControls={oneLineControls}
                onLoadConfig={(controls) => setOneLineControls(controls as typeof oneLineControls)}
              />
            </div>
          </div>
        </div>
      ) : visualConfig.component === 'ConstellationVisual' ? (
        <div className="absolute top-4 right-4 z-50">
          <div className="bg-gray-900/80 backdrop-blur-sm rounded-lg p-3 space-y-2 max-h-[80vh] overflow-y-auto w-80">
            <div className="text-sm text-white font-medium">Constellation</div>
            <label className="flex items-center gap-2 text-sm text-white cursor-pointer">
              <input
                type="checkbox"
                checked={leftHanded}
                onChange={(e) => setLeftHanded(e.target.checked)}
                className="w-4 h-4"
              />
              <span>Left-handed</span>
            </label>
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-gray-300">
                <span>Palette</span>
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
                className="w-full px-2 py-1 rounded bg-gray-800 text-white text-sm border border-gray-700"
              >
                {CONSTELLATION_PALETTES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <div className="text-[11px] text-gray-400">
                {CONSTELLATION_PALETTES.find((p) => p.id === constellationControls.palette)?.description}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-white cursor-pointer">
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
            <label className="flex items-center gap-2 text-sm text-white cursor-pointer">
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
            <div className="space-y-2">
              <div className="text-xs text-gray-300">Controls</div>
              <div className="space-y-2 text-xs text-gray-200">
                <div>
                  <div className="flex justify-between">
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
                  <div className="flex justify-between">
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
                  <div className="flex justify-between">
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
                  <div className="flex justify-between">
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
                  <div className="flex justify-between">
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
                  <div className="flex justify-between">
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
                  <div className="flex justify-between">
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
                  <div className="flex justify-between">
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
              </div>
              <div className="text-xs text-gray-300 mt-2">Flocking</div>
              <div className="space-y-2 text-xs text-gray-200">
                <div>
                  <div className="flex justify-between">
                    <span>Attraction</span>
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
                  <div className="flex justify-between">
                    <span>Separation</span>
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
                  <div className="flex justify-between">
                    <span>Sep. Radius</span>
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
                  <div className="flex justify-between">
                    <span>Motion Push</span>
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
                  <div className="flex justify-between">
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
              </div>
              <div className="text-xs text-gray-300 mt-2">Galaxy</div>
              <div className="space-y-2 text-xs text-gray-200">
                <div>
                  <div className="flex justify-between">
                    <span>Core Pull</span>
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
                  <div className="flex justify-between">
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
                  <div className="flex justify-between">
                    <span>Arms</span>
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
                  <div className="flex justify-between">
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
                  <div className="flex justify-between">
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
                  <div className="flex justify-between">
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
                  <div className="flex justify-between">
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
                  <div className="flex justify-between">
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
              </div>
              {constellationControls.showNebulaTrails && (
                <>
                  <div className="text-xs text-gray-300 mt-2">Trails</div>
                  <div className="space-y-2 text-xs text-gray-200">
                    <div>
                      <div className="flex justify-between">
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
                      <div className="flex justify-between">
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
                  </div>
                </>
              )}
              <button
                className="w-full px-2 py-1 rounded bg-gray-700 text-white text-xs hover:bg-gray-600"
                onClick={() => setConstellationControls(DEFAULT_CONSTELLATION_CONTROLS)}
              >
                Reset
              </button>
              <div className="text-[11px] text-gray-400">Open hand increases orbit swirl. Pinch still brightens stars.</div>
              <ConfigSaveLoadCompact
                visualId={visualId}
                currentControls={constellationControls}
                onLoadConfig={(controls) => setConstellationControls(controls as typeof constellationControls)}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="absolute bottom-4 right-4 z-50">
          <div className="bg-gray-800/80 backdrop-blur-sm rounded-lg p-3">
            <label className="flex items-center gap-2 text-sm text-white cursor-pointer">
              <input
                type="checkbox"
                checked={leftHanded}
                onChange={(e) => setLeftHanded(e.target.checked)}
                className="w-4 h-4"
              />
              <span>Left-handed</span>
            </label>
          </div>
        </div>
      )}
    </main>
  );
}
