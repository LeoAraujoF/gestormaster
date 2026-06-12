import '../env';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseServiceKey && typeof window === 'undefined' && process.env.DOCKER_BUILD !== '1') {
  console.warn("⚠️ SUPABASE_SERVICE_ROLE_KEY não encontrada no .env! O Worker falhará ao inserir no banco por conta do RLS.");
}

// Inicializa o cliente apenas se a URL for válida (evita crash durante Docker Build)
let supabaseAdmin: SupabaseClient;

if (supabaseUrl && supabaseUrl.startsWith('http') && !supabaseUrl.includes('placeholder')) {
  supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
} else {
  // Durante o build, cria um cliente "vazio" que será sobrescrito em runtime
  supabaseAdmin = createClient('https://placeholder.supabase.co', 'placeholder', {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

export { supabaseAdmin };
