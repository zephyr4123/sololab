/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // SoloLab is a self-hosted local Docker tool — browser ↔ server is loopback,
  // so on-the-fly image transcoding (WebP/AVIF via sharp) buys nothing measurable
  // and would add a fragile native-binary install step to the runner. Serve the
  // assets as-is via next/image; they're already sized appropriately at source.
  images: {
    unoptimized: true,
  },
  experimental: {
    serverActions: true,
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
