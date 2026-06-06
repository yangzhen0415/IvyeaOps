/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '/imgflow',
  trailingSlash: true,
  images: { remotePatterns: [{ protocol: 'https', hostname: '**' }] },
};
module.exports = nextConfig;
