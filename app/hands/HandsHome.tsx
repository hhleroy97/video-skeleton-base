'use client';

import { useState } from 'react';
import Link from 'next/link';

import { HandTracking } from '@/components/hand-tracking/HandTracking';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getAllEnabledVisuals } from './visuals-config';
import { useTrackingSettings } from '@/components/providers/TrackingSettingsProvider';

/**
 * HandsHome
 *
 * This is the new base/home page for the app (mounted at `/`).
 * It was previously served at `/hands`.
 */
export function HandsHome() {
  const [leftHanded, setLeftHanded] = useState(false);
  const visuals = getAllEnabledVisuals();
  const { bodyTrackingEnabled, setBodyTrackingEnabled, isHandTrackingEnabledForVisual, setHandTrackingEnabledForVisual } =
    useTrackingSettings();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 md:p-8 lg:p-24">
      <div className="z-10 max-w-6xl w-full">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold mb-2">Hand Tracking</h1>
          <p className="text-muted-foreground mb-6">
            Real-time hand tracking with MediaPipe. Choose a visualization to control with your hands.
          </p>
        </div>

        {/* Camera Feed Preview */}
        <Card className="mb-8">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>Camera Feed</CardTitle>
                <CardDescription>
                  Preview your hand tracking. Use this to test your setup before entering a visualization.
                </CardDescription>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={bodyTrackingEnabled}
                  onChange={(e) => setBodyTrackingEnabled(e.target.checked)}
                  className="w-4 h-4"
                />
                <span>Body tracking</span>
              </label>
            </div>
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
              <HandTracking leftHanded={leftHanded} enablePose={bodyTrackingEnabled} />
            </div>
          </CardContent>
        </Card>

        {/* Visualizations Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {visuals.map((visual) => (
            <Card key={visual.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="leading-tight">{visual.name}</CardTitle>
                  <span
                    className="shrink-0 rounded-full bg-blue-600/15 px-2 py-1 text-[11px] font-medium text-blue-700"
                    aria-label="Hand tracking badge"
                  >
                    Hand tracking
                  </span>
                </div>
                <CardDescription>{visual.description}</CardDescription>
                <label className="mt-3 flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isHandTrackingEnabledForVisual(visual.id)}
                    onChange={(e) => setHandTrackingEnabledForVisual(visual.id, e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span>
                    Hand tracking enabled{' '}
                    {!isHandTrackingEnabledForVisual(visual.id) && (
                      <span className="text-xs text-muted-foreground">(visual will not react)</span>
                    )}
                  </span>
                </label>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-2">
                  <Link
                    href={`/${visual.id}/final_view`}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-center text-sm"
                  >
                    Final View
                  </Link>
                  <div className="flex gap-2">
                    <Link
                      href={`/${visual.id}/control-panel`}
                      className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-center text-sm"
                    >
                      Control Panel
                    </Link>
                    <Link
                      href={`/${visual.id}`}
                      className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors text-center text-sm"
                    >
                      Dev View
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
}

