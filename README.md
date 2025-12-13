# Video Skeleton Base

A Next.js 16 web application foundation that captures webcam video and overlays real-time skeleton tracking for body, hands, and face using MediaPipe. Built with shadcn/ui and react-bits for a modern, extensible UI.

## Features

- 🎥 **Webcam Capture**: Real-time video stream from user's webcam
- 🦴 **Body Tracking**: Full body pose detection with skeleton overlay
- ✋ **Hand Tracking**: Multi-hand detection and tracking
- 😊 **Face Tracking**: Face mesh detection and visualization
- 🎨 **Modern UI**: Built with shadcn/ui and Tailwind CSS
- ⚡ **Next.js 16**: Leverages latest Next.js features including Turbopack
- 🚀 **Vercel Ready**: Optimized for easy deployment to Vercel

## Prerequisites

- Node.js 18 or later (Node.js 20.9+ recommended for Next.js 16)
- npm or yarn package manager
- A webcam/camera for testing

## Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd video-skeleton-base
```

2. Install dependencies:
```bash
npm install
```

3. Copy environment variables (if needed):
```bash
cp .env.local.example .env.local
```

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
video-skeleton-base/
├── app/                    # Next.js App Router
│   ├── layout.tsx         # Root layout
│   ├── page.tsx           # Main application page
│   └── globals.css        # Global styles
├── components/
│   ├── ui/                # shadcn/ui components
│   ├── video/             # Video capture components
│   │   └── WebcamCapture.tsx
│   └── skeleton/          # Skeleton visualization
│       └── SkeletonOverlay.tsx
├── hooks/
│   └── useMediaPipe.ts    # MediaPipe integration hook
├── lib/
│   ├── mediapipe/         # MediaPipe utilities
│   │   ├── pose.ts       # Body tracking setup
│   │   ├── hands.ts      # Hand tracking setup
│   │   ├── face.ts       # Face tracking setup
│   │   └── index.ts      # Exports
│   └── utils.ts          # Utility functions
├── types/
│   └── mediapipe.ts      # TypeScript types
└── public/               # Static assets
```

## Architecture

The application follows this data flow:

1. **WebcamCapture** component accesses the user's webcam via `getUserMedia` API
2. Video stream is passed to **useMediaPipe** hook which initializes MediaPipe detectors
3. MediaPipe processes each video frame and detects body, hands, and face landmarks
4. Results are passed to **SkeletonOverlay** component which renders the skeleton on a canvas
5. UI controls allow toggling different tracking types and viewing status

## Usage

### Basic Usage

1. Click "Start Camera" to begin webcam capture
2. Allow camera permissions when prompted
3. The skeleton overlay will appear automatically once MediaPipe initializes
4. Use the toggle buttons to enable/disable body, hands, or face tracking

### Customization

#### Adjusting Tracking Confidence

Edit `app/page.tsx` to modify detection confidence thresholds:

```typescript
const { isInitialized, fps, startProcessing } = useMediaPipe({
  enableBody: true,
  enableHands: true,
  enableFace: true,
  minDetectionConfidence: 0.5, // Adjust this value (0-1)
  minTrackingConfidence: 0.5,  // Adjust this value (0-1)
  // ...
});
```

#### Changing Skeleton Colors

Edit `components/skeleton/SkeletonOverlay.tsx`:

```typescript
// Body skeleton color
color: '#00FF00', // Green

// Hands skeleton color
color: index === 0 ? '#FF0000' : '#0000FF', // Red/Blue

// Face mesh color
color: '#FFFF00', // Yellow
```

## Deployment to Vercel

### Option 1: Vercel CLI

1. Install Vercel CLI:
```bash
npm i -g vercel
```

2. Deploy:
```bash
vercel
```

3. Follow the prompts to link your project

### Option 2: GitHub Integration

1. Push your code to GitHub
2. Import your repository in [Vercel](https://vercel.com)
3. Vercel will automatically detect Next.js and deploy

### Environment Variables

No environment variables are required for basic functionality. MediaPipe models are loaded from CDN.

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

### Adding shadcn/ui Components

```bash
npx shadcn@latest add [component-name]
```

### Testing

Basic test structure is set up. Add tests in `__tests__/` directories:

```bash
npm test
```

## Browser Compatibility

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support (may require HTTPS for camera access)
- Mobile browsers: Supported (camera access required)

**Note**: Camera access requires HTTPS in production or localhost for development.

## Performance Tips

1. **Reduce Model Complexity**: Lower `modelComplexity` in MediaPipe config for better performance
2. **Disable Unused Tracking**: Turn off body/hands/face tracking you don't need
3. **Adjust Video Resolution**: Lower video resolution in `WebcamCapture` for better performance
4. **Use Production Build**: Always test performance with `npm run build` before deploying

## Troubleshooting

### Camera Not Working

- Ensure you've granted camera permissions
- Check browser console for errors
- Verify camera is not being used by another application
- Try a different browser

### MediaPipe Not Initializing

- Check browser console for network errors (CDN access)
- Ensure you have internet connection (models load from CDN)
- Try clearing browser cache

### Low FPS

- Reduce video resolution
- Lower model complexity
- Disable unused tracking features
- Check browser performance tab for bottlenecks

## Extending the Foundation

This foundation is designed to be extended. Here are some ideas:

- **Gesture Recognition**: Use hand landmarks to detect gestures
- **Pose Classification**: Classify body poses for fitness apps
- **Virtual Avatar**: Map skeleton to a 3D avatar
- **Motion Capture**: Record and replay skeleton animations
- **AR Effects**: Add augmented reality effects based on tracking

## Technologies Used

- **Next.js 16**: React framework with App Router
- **TypeScript**: Type-safe development
- **MediaPipe**: Google's ML framework for pose/hand/face detection
- **shadcn/ui**: Accessible UI components
- **Tailwind CSS**: Utility-first CSS framework
- **react-bits**: Additional React utilities

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

