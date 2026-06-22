const { createClient } = require('@supabase/supabase-js'); 
const supabase = createClient('https://rkxfwwooivqjukjhbhgg.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJreGZ3d29vaXZxanVramhiaGdnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTQwMDkzOSwiZXhwIjoyMDk0OTc2OTM5fQ.lEWc7gIy_SoUeZVu3AVSHZHmJj8AtKbrBR5LlQ1oI3E'); 
const msg = `Olá {{primeiro_nome}}! Seja muito bem-vindo(a)! 🌟\nSeu plano foi ativado com sucesso em nosso sistema!\n\nSalva esse número aqui, ele será o nosso canal oficial de suporte técnico e onde você receberá seus avisos de vencimento, ok? 🤝\n\n💰 Valor do Plano: R$ {{plan_value}}\n📅 Seu Vencimento: {{due_date}}\n\n🎁 *PROMOÇÃO INDIQUE E GANHE*\nSabia que você pode ganhar meses grátis? É muito simples: indicou um amigo e ele fechou com a gente, o seu próximo mês sai 100% DE GRAÇA! Sem sorteio, indicou, ganhou! 🚀\n\n📱 *NOSSO CANAL EXCLUSIVO*\nNão fique de fora das novidades, manutenções programadas e promoções relâmpago! Entre agora no nosso canal oficial para clientes:\n👉 {{link_canal}}\n\nQualquer dúvida, é só nos chamar por aqui. Aproveite!`; 

supabase.from('automations').insert({ 
  user_id: '2c4d3b1a-8915-4de2-a71f-56bf7831dc78', 
  organization_id: '32b1baea-ed83-4267-88f0-2d997c3a5c16', 
  alert_type: 'activation', 
  message_template: msg, 
  is_active: true, 
  days_offset: 0, 
  send_time: '12:00' 
}).then(res => console.log('INSERIDO:', res.error || 'SUCESSO'));
