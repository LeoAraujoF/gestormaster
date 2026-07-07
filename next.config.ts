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
  allowedDevOrigins: ['192.168.1.9', 'localhost'],
};

export default nextConfig;
