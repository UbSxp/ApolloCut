/* ============================================================
   APOLLOCUT — Workbox Configuration for PWA
   ============================================================ */

module.exports = {
  globDirectory: 'dist/',
  globPatterns: [
    '**/*.{html,css,js,woff2,svg,png,ico,webmanifest}',
  ],
  swDest: 'dist/sw.js',
  clientsClaim: true,
  skipWaiting: true,
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/@huggingface\/transformers@.*/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'transformers-cache',
        expiration: {
          maxEntries: 10,
          maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
        },
      },
    },
    {
      urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/.*/,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'jsdelivr-cache',
      },
    },
  ],
};