import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { TVdeCasaAdapter } from '../src/services/iptv/TVdeCasaAdapter';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // make sure it's in env
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data: authData } = await supabase.from('iptv_accounts').select('*').limit(1).single();
  if (!authData) {
    console.log("No iptv accounts found");
    return;
  }
  
  const { username, password } = authData;
  console.log("Found iptv integration for", username);

  const adapter = new TVdeCasaAdapter();
  const cookies = await adapter.authenticate(username, password);
  console.log("Authenticated. Fetching clients...");
  
  const clients = await adapter.fetchClients(cookies);
  console.log(`Fetched ${clients.length} clients`);
  if (clients.length > 0) {
    console.log(clients[0]);
  }
}
test();
