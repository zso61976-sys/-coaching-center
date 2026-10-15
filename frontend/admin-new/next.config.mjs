/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  experimental: {
    // Keep visited pages in the client router cache for 5 minutes, so moving
    // between sidebar pages does not wait on the server every time
    staleTimes: { dynamic: 300, static: 300 },
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
  },
};

export default nextConfig;
