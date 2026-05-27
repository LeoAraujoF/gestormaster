import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data: clients } = await supabase.from('clients').select('id, name, due_date, status').eq('status', 'active');
  const { data: rules } = await supabase.from('automations').select('*').eq('is_active', true);
  
  const todayStrLocal = '2026-05-27';
  const today = new Date(`${todayStrLocal}T12:00:00Z`);

  console.log("--- CLIENTS ---");
  clients.forEach(c => {
    const due = new Date(`${c.due_date}T12:00:00Z`);
    const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
    console.log(`Client: ${c.name}, Due: ${c.due_date}, DiffDays: ${diffDays}`);
  });

  console.log("\n--- RULES ---");
  rules.forEach(rule => {
    if (!['before_due', 'on_due', 'after_due'].includes(rule.alert_type)) return;
    
    let countUI = 0;
    clients.forEach(c => {
      const due = new Date(`${c.due_date}T12:00:00Z`);
      const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
      if (rule.alert_type === 'before_due' && diffDays === Math.abs(rule.days_offset)) countUI++;
      if (rule.alert_type === 'on_due' && diffDays === 0) countUI++;
      if (rule.alert_type === 'after_due' && diffDays === -Math.abs(rule.days_offset)) countUI++;
    });

    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() - rule.days_offset);
    const targetDateStr = targetDate.toISOString().split('T')[0];
    
    let countServer = 0;
    clients.forEach(c => {
      if (c.due_date === targetDateStr) countServer++;
    });

    console.log(`Rule: ${rule.alert_type} (${rule.days_offset} days)`);
    console.log(`  UI shows match count: ${countUI}`);
    console.log(`  Server looks for due_date: ${targetDateStr} (Matches: ${countServer})`);
    
    if (countUI !== countServer) {
       console.log("  !!! MISMATCH DETECTED !!!");
    }
  });
}

run();
