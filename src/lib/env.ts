// src/lib/env.ts
// Validação leve de variáveis de ambiente, sem dependência externa.
// As variáveis de servidor são validadas apenas em runtime, não durante o build.

const isServer = typeof window === 'undefined';
const isDockerBuild = process.env.DOCKER_BUILD === '1';

function getEnvVar(key: string, required = true): string {
  const value = process.env[key] || '';
  if (required && !value && isServer && !isDockerBuild) {
    console.warn(`⚠️ Variável de ambiente ${key} não configurada.`);
  }
  return value;
}

// Variáveis de servidor (só validadas em runtime, não no build)
export const env = {
  // Supabase
  SUPABASE_URL: getEnvVar('NEXT_PUBLIC_SUPABASE_URL'),
  SUPABASE_SERVICE_ROLE_KEY: getEnvVar('SUPABASE_SERVICE_ROLE_KEY'),
  
  // Stripe
  STRIPE_SECRET_KEY: getEnvVar('STRIPE_SECRET_KEY'),
  STRIPE_WEBHOOK_SECRET: getEnvVar('STRIPE_WEBHOOK_SECRET'),
  
  // WhatsApp Evolution
  EVOLUTION_API_URL: getEnvVar('EVOLUTION_API_URL'),
  EVOLUTION_API_TOKEN: getEnvVar('EVOLUTION_API_KEY'),
  
  // Redis
  REDIS_URL: getEnvVar('REDIS_URL', false),
  
  // Security
  JWT_SECRET: getEnvVar('JWT_SECRET', false),
  NEXTAUTH_SECRET: getEnvVar('NEXTAUTH_SECRET', false),
  
  // Email
  EMAIL_SERVER: getEnvVar('EMAIL_SERVER', false),
  EMAIL_FROM: getEnvVar('EMAIL_FROM', false),

  // Client (públicas)
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '',
};
