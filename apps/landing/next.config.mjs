/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Image optimizer: resizes + converts to AVIF/WebP, caches the optimized
  // result on the server, and serves it with a long browser Cache-Control so
  // a visitor's device keeps it across visits.
  images: {
    formats: ['image/avif', 'image/webp'],
    // How long an optimized image stays cached (server + the browser TTL
    // derived from it). 30 days — these are static brand/marketing assets.
    minimumCacheTTL: 60 * 60 * 24 * 30,
    remotePatterns: [
      { protocol: 'https', hostname: 'i.ibb.co' },
      { protocol: 'https', hostname: 'd8j0ntlcm91z4.cloudfront.net' },
      { protocol: 'https', hostname: 'lirp.cdn-website.com' },
      { protocol: 'https', hostname: 'encrypted-tbn0.gstatic.com' },
      { protocol: 'https', hostname: 'static.wixstatic.com' }
    ]
  },

  async headers() {
    const oneYearImmutable = 'public, max-age=31536000, immutable';
    return [
      {
        // Next build output is content-hashed → safe to cache forever.
        source: '/_next/static/:path*',
        headers: [{ key: 'Cache-Control', value: oneYearImmutable }]
      },
      {
        // Optimized images from the /_next/image endpoint.
        source: '/_next/image:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=2592000, stale-while-revalidate=86400' }]
      },
      {
        // Static brand assets in /public — logo, icons, og image.
        source: '/:file*.(png|jpg|jpeg|svg|webp|avif|ico|gif)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=2592000, stale-while-revalidate=604800' }]
      },
      {
        // Fonts.
        source: '/:file*.(woff|woff2|ttf|otf)',
        headers: [{ key: 'Cache-Control', value: oneYearImmutable }]
      }
    ];
  }
};

export default nextConfig;
