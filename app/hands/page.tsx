'use client';

import { useState } from 'react';
import { HandTracking } from '@/components/hand-tracking/HandTracking';
import Link from 'next/link';
import { getAllEnabledVisuals } from './visuals-config';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function HandsPage() {
  const [leftHanded, setLeftHanded] = useState(false);
  const visuals = getAllEnabledVisuals();

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
            <CardTitle>Camera Feed</CardTitle>
            <CardDescription>
              Preview your hand tracking. Use this to test your setup before entering a visualization.
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

        {/* Visualizations Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {visuals.map((visual) => (
            <Card key={visual.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle>{visual.name}</CardTitle>
                <CardDescription>{visual.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Link
                    href={`/hands/${visual.id}`}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-center text-sm"
                  >
                    View
                  </Link>
                  <Link
                    href={`/hands/${visual.id}/control-panel`}
                    className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-center text-sm"
                  >
                    Control Panel
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
}
