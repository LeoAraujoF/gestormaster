import '../env';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseServiceKey) {
  console.warn("⚠️ SUPABASE_SERVICE_ROLE_KEY não encontrada no .env! O Worker falhará ao inserir no banco por conta do RLS.");
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  },
  // Desabilita o auto-connect do Realtime (Workers não precisam de WebSocket)
  // Isso evita o crash "Node.js 20 detected without native WebSocket support"
  realtime: {
    params: {
      eventsPerSecond: 0
    }
  }
});

// Previne a tentativa de conexão WebSocket no Node 20
try {
  supabaseAdmin.realtime.disconnect();
} catch (_) {
  // Ignora se já estiver desconectado
}
