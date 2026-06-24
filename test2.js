const { createClient } = require('@supabase/supabase-js')
const dotenv = require('dotenv')
dotenv.config({ path: '.env' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
  const { data: { session }, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'principalmirinha@gmail.com',
    password: '261219$Vava'
  })
  
  if (authErr) {
    console.log('Login failed:', authErr.message)
    return
  }

  console.log('Logged in!')

  const { error: e1 } = await supabase
    .from('affiliate_earnings')
    .select('*, referred_user:users!referred_user_id(full_name)')
    .eq('referrer_id', session.user.id)
    .limit(1)
  console.log('Error 1:', e1?.message || 'Success')

  const { error: e2 } = await supabase
    .from('affiliate_earnings')
    .select('*, referred_user:users!fk_affiliate_earnings_referred_user(full_name)')
    .eq('referrer_id', session.user.id)
    .limit(1)
  console.log('Error 2:', e2?.message || 'Success')
}

test()
