/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Optimize for Vercel deployment
  output: 'standalone',
  // Enable experimental features for Next.js 16
  experimental: {
    // Turbopack is stable in Next.js 16
  },
  // Turbopack config (empty to silence warning when using webpack)
  turbopack: {},
  // Handle MediaPipe packages (client-side only)
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    } else {
      // Server-side: externalize completely to avoid bundling
      config.externals = config.externals || [];
      config.externals.push({
        '@mediapipe/pose': 'commonjs @mediapipe/pose',
        '@mediapipe/hands': 'commonjs @mediapipe/hands',
        '@mediapipe/face_mesh': 'commonjs @mediapipe/face_mesh',
        '@mediapipe/drawing_utils': 'commonjs @mediapipe/drawing_utils',
      });
    }
    return config;
  },
}

module.exports = nextConfig

