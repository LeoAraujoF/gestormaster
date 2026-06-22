const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
// Using service role key if available for deletion bypass, otherwise anon key might fail RLS if not authenticated
// Actually, if we run it as anon, RLS blocks us. 

console.log("Supabase URL:", supabaseUrl);
