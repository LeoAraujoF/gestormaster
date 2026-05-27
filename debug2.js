import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data: user } = await supabase.auth.admin.getUserById('a0d24497-25ad-4786-8fa8-00a4fb52a9d2');
  const userMeta = { timezone: '-03:00' };

  const tzOffsetStr = userMeta.timezone || "-03:00"
  const nowUtc = new Date()
  const sign = tzOffsetStr.startsWith('-') ? -1 : 1
  const [hh, mm] = tzOffsetStr.replace(/[+-]/, '').split(':').map(Number)
  const offsetMs = sign * ((hh * 3600) + (mm * 60)) * 1000

  const localNow = new Date(nowUtc.getTime() + offsetMs)
  const todayStrLocal = localNow.toISOString().split('T')[0]

  const todayLocalObj = new Date(`${todayStrLocal}T12:00:00Z`)
  const targetDate = new Date(todayLocalObj)
  
  // Rule has days_offset = -1
  const days_offset = -1;
  targetDate.setDate(todayLocalObj.getDate() - days_offset)
  const targetDateStr = targetDate.toISOString().split('T')[0]

  console.log('Now UTC:', nowUtc);
  console.log('Local Now:', localNow);
  console.log('todayStrLocal:', todayStrLocal);
  console.log('todayLocalObj:', todayLocalObj);
  console.log('targetDate:', targetDate);
  console.log('targetDateStr (O que o robo procura):', targetDateStr);
}

run();
