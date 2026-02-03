/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  env: {
    API_URL: process.env.API_URL || 'http://localhost:3000/api',
    KIOSK_SECRET: process.env.KIOSK_SECRET || '',
    BRANCH_ID: process.env.BRANCH_ID || '660e8400-e29b-41d4-a716-446655440002',
  },
};

module.exports = nextConfig;
