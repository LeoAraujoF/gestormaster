import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // Type-checking é obrigatório no build (0 erros hoje).
  // (Next 16 não roda ESLint no build; não há mais a chave `eslint` no config.)
  typescript: { ignoreBuildErrors: false },
  async rewrites() {
    return [
      {
        source: '/admin/queues',
        destination: `${process.env.BULL_BOARD_URL || 'http://localhost:3001'}/admin/queues`,
      },
      {
        source: '/admin/queues/:path*',
        destination: `${process.env.BULL_BOARD_URL || 'http://localhost:3001'}/admin/queues/:path*`,
      },
    ];
  },
  async headers() {
    const isProduction = process.env.NODE_ENV === 'production'
    const contentSecurityPolicy = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      `script-src 'self' 'unsafe-inline'${isProduction ? '' : " 'unsafe-eval'"}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com",
      "frame-src https://js.stripe.com https://hooks.stripe.com",
      ...(isProduction ? ['upgrade-insecure-requests'] : []),
    ].join('; ')

    const headers = [
      { key: 'Content-Security-Policy', value: contentSecurityPolicy },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
    ]

    if (isProduction) {
      headers.push({ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' })
    }

    return [{ source: '/:path*', headers }]
  },
  // O acesso local também é feito pelo IP da rede. Sem esta origem, o
  // bundle/HMR pode não carregar e formulários client-side caem no submit
  // nativo, ignorando a autenticação do Supabase.
  allowedDevOrigins: ['192.168.1.8', '192.168.1.9', 'localhost'],
};

export default nextConfig;
