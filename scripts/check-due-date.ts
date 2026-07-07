import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl!, supabaseKey!);

async function check() {
  // we can use PostgREST introspection or just fetch a client to see its due_date format
  const { data, error } = await supabase.from('clients').select('due_date').limit(1);
  console.log("due_date data:", data);
  if (error) console.error(error);
}
check();
