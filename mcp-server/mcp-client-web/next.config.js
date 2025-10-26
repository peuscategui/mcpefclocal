/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',  // ← CRÍTICO para Docker
  reactStrictMode: true,
  swcMinify: true,
  images: {
    domains: ['lh3.googleusercontent.com', 'graph.microsoft.com'],
  },
};

module.exports = nextConfig;
