require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  console.log("Fetching client_services...");
  const { data: services, error } = await supabase.from('client_services').select('id, client_id');
  if (error) {
    console.error("Error fetching:", error);
    return;
  }
  
  console.log(`Found ${services.length} client_services.`);
  
  const { data: clients, error: err2 } = await supabase.from('clients').select('id');
  if (err2) {
    console.error("Error fetching clients:", err2);
    return;
  }
  
  const clientIds = new Set(clients.map(c => c.id));
  
  const orphaned = services.filter(s => !clientIds.has(s.client_id));
  console.log(`Found ${orphaned.length} orphaned client_services.`);
  
  if (orphaned.length > 0) {
    const orphanedIds = orphaned.map(o => o.id);
    console.log("Deleting orphaned...");
    const { error: delErr } = await supabase.from('client_services').delete().in('id', orphanedIds);
    if (delErr) {
      console.error("Error deleting:", delErr);
    } else {
      console.log("Successfully deleted orphaned client_services.");
    }
  }
}

run();
