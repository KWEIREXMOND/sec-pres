/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ['*.e2b.app', '127.0.0.1'],
  experimental: {
    serverComponentsExternalPackages: [
      '@electric-sql/pglite',
      'postgres',
      'pdfkit',
      'web-push',
      '@supabase/supabase-js',
    ],
    outputFileTracingIncludes: {
      '/api/[[...path]]': ['./node_modules/@electric-sql/pglite/dist/**/*'],
    },
  },
  async headers() {
    const developmentHeaders = process.env.NODE_ENV !== 'production'
      ? [{ key: 'Cache-Control', value: 'no-store' }]
      : [];
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          ...developmentHeaders,
        ],
      },
    ];
  },
};

export default nextConfig;
