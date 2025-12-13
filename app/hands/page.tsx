'use client';

import { HandTracking } from '@/components/hand-tracking/HandTracking';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function HandsPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 md:p-8 lg:p-24">
      <div className="z-10 max-w-6xl w-full">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold mb-2">Hand Tracking</h1>
          <p className="text-muted-foreground">
            Real-time hand tracking with MediaPipe
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Camera Feed</CardTitle>
            <CardDescription>
              Hand skeleton tracking overlay
            </CardDescription>
          </CardHeader>
          <CardContent>
            <HandTracking />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
