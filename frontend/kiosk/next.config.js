/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
    NEXT_PUBLIC_KIOSK_SECRET: process.env.NEXT_PUBLIC_KIOSK_SECRET || '',
    NEXT_PUBLIC_BRANCH_ID: process.env.NEXT_PUBLIC_BRANCH_ID || '660e8400-e29b-41d4-a716-446655440002',
  },
};

module.exports = nextConfig;
