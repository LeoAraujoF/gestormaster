const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('evolution_instances').select('*').limit(1).then(r => {
  if (r.data && r.data[0]) console.log(Object.keys(r.data[0]));
  else console.log("No data found");
}).catch(console.error);
