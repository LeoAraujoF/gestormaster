import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing credentials")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
  console.log("Testing query 1: users!referred_user_id(full_name)")
  const { error: e1 } = await supabase
    .from('affiliate_earnings')
    .select('*, referred_user:users!referred_user_id(full_name)')
    .limit(1)
  console.log("Error 1:", e1)

  console.log("Testing query 2: users!fk_affiliate_earnings_referred_user(full_name)")
  const { error: e2 } = await supabase
    .from('affiliate_earnings')
    .select('*, referred_user:users!fk_affiliate_earnings_referred_user(full_name)')
    .limit(1)
  console.log("Error 2:", e2)
}

test()
