'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { FpsOverlay } from '@/components/perf/FpsOverlay';
import { HandTracking, type Hand3DData, type PinchVector } from '@/components/hand-tracking/HandTracking';
import { usePinchHistory, type FinalVector } from '@/components/hand-tracking/PinchHistoryTracker';
import { PinchControlled3D } from '@/components/hand-tracking/PinchControlled3D';
import { Hand3DVisual } from '@/components/hand-tracking/Hand3DVisual';
import { PrismHandVisual, type PrismHandControls, DEFAULT_PRISM_HAND_CONTROLS } from '@/components/hand-tracking/PrismHandVisual';
import { OneLineHandVisual, type OneLineHandControls, DEFAULT_ONE_LINE_CONTROLS } from '@/components/hand-tracking/OneLineHandVisual';
import { ConstellationVisual, type ConstellationControls, DEFAULT_CONSTELLATION_CONTROLS } from '@/components/hand-tracking/ConstellationVisual';
import { useTrackingSettings } from '@/components/providers/TrackingSettingsProvider';

import { getVisualConfig } from '../../visuals-config';

/**
 * FINAL VIEW
 *
 * This is the user-facing fullscreen route for visuals.
 * It intentionally includes a dedicated "custom layout" area (right panel)
 * so we can iterate on UI/composition without touching the dev fullscreen route
 * (`/hands/[visualId]`) or the control panel (`/hands/[visualId]/control-panel`).
 *
 * Route: /hands/[visualId]/final_view
 */
export default function FinalViewPage({ params }: { params: Promise<{ visualId: string }> }) {
  const [visualId, setVisualId] = useState<string>('');
  const { isHandTrackingEnabledForVisual, setHandTrackingEnabledForVisual, bodyTrackingEnabled } = useTrackingSettings();

  // Shared tracking + interaction state (same inputs as the dev fullscreen page)
  const [leftHanded, setLeftHanded] = useState(false);
  const [pinchVector, setPinchVector] = useState<PinchVector | null>(null);
  const [finalVector, setFinalVector] = useState<FinalVector | null>(null);
  const [currentVector, setCurrentVector] = useState<FinalVector | null>(null);
  const [phaseAngles, setPhaseAngles] = useState<number[]>([]);
  const [rightHandDistance, setRightHandDistance] = useState<number | null>(null);
  const [nodesPerOrbit, setNodesPerOrbit] = useState(8);

  // Hands (3D visuals) — throttle state updates to reduce React re-renders
  const [hands3D, setHands3D] = useState<Hand3DData[]>([]);
  const hands3DRef = useRef<Hand3DData[]>([]);
  const lastHands3DUpdateRef = useRef<number>(0);
  const HANDS_UPDATE_INTERVAL = 33; // ~30fps state updates

  const handleHands3D = useCallback((hands: Hand3DData[]) => {
    hands3DRef.current = hands;
    const now = performance.now();
    if (now - lastHands3DUpdateRef.current >= HANDS_UPDATE_INTERVAL) {
      lastHands3DUpdateRef.current = now;
      setHands3D(hands);
    }
  }, []);

  // Per-visual controls (kept local here; final_view is meant to be a “composed” UI)
  const [prismControls, setPrismControls] = useState<PrismHandControls>(DEFAULT_PRISM_HAND_CONTROLS);
  const [oneLineControls, setOneLineControls] = useState<OneLineHandControls>(DEFAULT_ONE_LINE_CONTROLS);
  const [constellationControls, setConstellationControls] = useState<ConstellationControls>(DEFAULT_CONSTELLATION_CONTROLS);

  const handTrackingEnabled = visualId ? isHandTrackingEnabledForVisual(visualId) : true;

  useEffect(() => {
    if (handTrackingEnabled) return;
    setHands3D([]);
    setPinchVector(null);
    setRightHandDistance(null);
    setFinalVector(null);
    setCurrentVector(null);
  }, [handTrackingEnabled]);

  // Handle both sync and async params
  useEffect(() => {
    const anyParams = params as any;
    if (anyParams && typeof anyParams.then === 'function') {
      (anyParams as Promise<{ visualId: string }>).then((resolved) => setVisualId(resolved.visualId));
      return;
    }
    if (anyParams && typeof anyParams.visualId === 'string') {
      setVisualId(anyParams.visualId);
    }
  }, [params]);

  // Track pinch history (always call hooks before early returns)
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
    return <div className="flex items-center justify-center w-screen h-screen bg-black text-white">Loading...</div>;
  }

  if (!visualConfig) {
    notFound();
  }

  const renderVisual = () => {
    switch (visualConfig.component) {
      case 'PinchControlled3D':
        return (
          <PinchControlled3D
            vector={pinchVector}
            nodesPerOrbit={nodesPerOrbit}
            onPhaseAnglesChange={setPhaseAngles}
            fullscreen={true}
          />
        );
      case 'BasicHandTracking':
        // For basic tracking, we show the tracking feed as the main visual.
        return (
          handTrackingEnabled ? (
            <HandTracking
              leftHanded={leftHanded}
              enablePose={bodyTrackingEnabled}
              className="w-full h-full"
              hideRestartButton={true}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-black text-white">
              Hand tracking is disabled for this visual.
            </div>
          )
        );
      case 'Hand3DVisual':
        return <Hand3DVisual hands={hands3D} className="w-full h-full" overlayMode="skeleton" />;
      case 'PrismHandVisual':
        return <PrismHandVisual hands={hands3D} className="w-full h-full" controls={prismControls} />;
      case 'OneLineHandVisual':
        return <OneLineHandVisual hands={hands3D} className="w-full h-full" controls={oneLineControls} />;
      case 'ConstellationVisual':
        return <ConstellationVisual hands={hands3D} className="w-full h-full" controls={constellationControls} />;
      default:
        return <div className="p-6">Visual component not implemented yet</div>;
    }
  };

  return (
    <main className="w-screen h-screen bg-black text-white" data-testid="final-view-root">
      <FpsOverlay position="bottom-left" />

      <div className="grid h-full grid-cols-1 md:grid-cols-[1fr_380px]">
        {/* Main visual area (true fullscreen) */}
        <section className="relative overflow-hidden">
          {renderVisual()}

          {/* Minimal top-left nav (kept lightweight for user-facing view) */}
          <div className="absolute top-4 left-4 z-50 flex gap-2">
            <Link
              href="/"
              className="px-3 py-2 bg-gray-900/70 text-white rounded-lg hover:bg-gray-800/70 transition-colors backdrop-blur-sm text-sm"
            >
              ← Back
            </Link>
          </div>
        </section>

        {/* Custom layout panel (intentionally user-facing & customizable) */}
        <aside className="border-t md:border-t-0 md:border-l border-white/10 bg-gray-950/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="space-y-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-white/60">Final View</div>
              <div className="text-lg font-semibold">{visualConfig.name}</div>
              <div className="text-sm text-white/70">{visualConfig.description}</div>
            </div>

            {/* Custom layout slot (start simple; evolve per visual) */}
            <div className="rounded-lg border border-white/10 bg-black/30 p-3">
              <div className="text-sm font-medium mb-1">Custom Layout Area</div>
              <div className="text-xs text-white/70">
                Use this panel for user-facing UI (instructions, branding, presets, audience-facing controls, etc.).
                We’ll keep the dev fullscreen + control panel pages separate for debugging.
              </div>
            </div>

            {/* Tracking preview lives here in final_view so the main canvas stays clean */}
            {visualConfig.component !== 'BasicHandTracking' && (
              <div className="rounded-lg border border-white/10 overflow-hidden">
                <div className="px-3 py-2 bg-black/40 border-b border-white/10 flex items-center justify-between">
                  <div className="text-sm font-medium">Tracking</div>
                  <label className="flex items-center gap-2 text-xs text-white/80 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={leftHanded}
                      onChange={(e) => setLeftHanded(e.target.checked)}
                      className="w-4 h-4"
                    />
                    Left-handed
                  </label>
                </div>
                <div className="px-3 py-2 bg-black/30 border-b border-white/10">
                  <label className="flex items-center gap-2 text-xs text-white/80 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={handTrackingEnabled}
                      onChange={(e) => setHandTrackingEnabledForVisual(visualId, e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span>Hand tracking enabled</span>
                  </label>
                  {!handTrackingEnabled && (
                    <div className="mt-1 text-[11px] text-white/60">Visual will not react while disabled.</div>
                  )}
                </div>
                <div className="aspect-video">
                  {handTrackingEnabled ? (
                    <HandTracking
                      onHands3D={
                        visualConfig.component === 'Hand3DVisual' ||
                        visualConfig.component === 'PrismHandVisual' ||
                        visualConfig.component === 'OneLineHandVisual' ||
                        visualConfig.component === 'ConstellationVisual'
                          ? handleHands3D
                          : undefined
                      }
                      onPinchVector={setPinchVector}
                      compositeVector={currentVector || finalVector}
                      onRightHandDistance={setRightHandDistance}
                      leftHanded={leftHanded}
                      enablePose={bodyTrackingEnabled}
                      className="w-full h-full"
                      hideRestartButton={true}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-black/40 text-white/80 text-sm">
                      Hand tracking disabled
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Quick access (kept tucked away) */}
            <details className="rounded-lg border border-white/10 bg-black/20 p-3">
              <summary className="cursor-pointer text-sm font-medium">Dev links</summary>
              <div className="mt-3 flex flex-col gap-2">
                <Link
                  href={`/${visualId}/control-panel`}
                  className="px-3 py-2 rounded bg-blue-600/80 hover:bg-blue-600 text-white text-sm text-center"
                >
                  Control Panel
                </Link>
                <Link
                  href={`/${visualId}`}
                  className="px-3 py-2 rounded bg-gray-800/80 hover:bg-gray-800 text-white text-sm text-center"
                >
                  Dev Fullscreen
                </Link>
              </div>
            </details>
          </div>
        </aside>
      </div>
    </main>
  );
}

