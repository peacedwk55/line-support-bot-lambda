import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: 'standalone',
  async rewrites() {
    // Dev only: proxy /api/* to local backend so `npm run dev` works without changing env
    if (process.env.NODE_ENV !== 'development') return []
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001'
    return [
      { source: '/api/:path*', destination: `${backendUrl}/api/:path*` },
    ]
  },
};

export default nextConfig;
