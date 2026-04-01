/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    serverActions: true,
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/:path*`,
      },
      {
        source: '/oc/:path*',
        destination: `${process.env.NEXT_PUBLIC_OPENCODE_URL || 'http://localhost:3101'}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
