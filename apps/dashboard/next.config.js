/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // A13.9: no raw HTML injection anywhere in this app.
  productionBrowserSourceMaps: false,
};

module.exports = nextConfig;
