import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data: clients, error: cErr } = await supabase.from('clients').select('id, name, due_date, status').eq('status', 'active');
  const { data: rules, error: rErr } = await supabase.from('automations').select('id, alert_type, days_offset, send_time');
  const { data: logs, error: lErr } = await supabase.from('alert_history').select('*').order('created_at', { ascending: false }).limit(5);

  console.log('--- CLIENTS ---');
  console.log(clients);
  console.log('--- RULES ---');
  console.log(rules);
  console.log('--- LATEST LOGS ---');
  console.log(logs);
}

run();
