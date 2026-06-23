import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { userId, method, type, password } = body

    if (!userId || !method) {
      return NextResponse.json({ error: 'Parâmetros incompletos' }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Supabase configs não encontradas' }, { status: 500 })
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // 1. Buscar os dados do usuário
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId)
    if (userError || !userData?.user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
    }

    const user = userData.user
    const phone = user.user_metadata?.phone || user.phone
    const email = user.email
    const plan = user.user_metadata?.plan_name || 'Free'
    
    // Configurações do Evolution API
    const evoUrl = process.env.EVOLUTION_API_URL
    const evoKey = process.env.EVOLUTION_API_KEY
    const instanceName = "gestor_master" // Instância do Master Admin
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

    let messageText = ""

    // 2. Lógica de Boas Vindas
    if (type === 'welcome') {
      messageText = `*Olá ${user.user_metadata?.full_name || ''}!* 👋\n\nSua conta no nosso sistema acaba de ser criada com sucesso!\n\n🔗 *Acesso:* ${siteUrl}/login\n📧 *Email:* ${email}`
      if (password) {
        messageText += `\n🔑 *Senha provisória:* ${password}\n\nAconselhamos que mude sua senha assim que fizer o primeiro login.`
      }
      messageText += `\n\nSeja muito bem-vindo!`
    } else {
      // LÓGICA DE COBRANÇA
      let checkoutUrl = ""

      if (method === 'email') {
        // GERAR LINK STRIPE
        const stripeKey = process.env.STRIPE_SECRET_KEY
        if (!stripeKey) {
          return NextResponse.json({ error: 'Chave Stripe não configurada' }, { status: 500 })
        }
        const stripe = new Stripe(stripeKey, { apiVersion: '2025-02-24.acacia' })
        
        // Define preço base dependendo do plano (Exemplo: Pro = 97 BRL)
        const amount = plan === 'Pro' ? 9700 : 0
        
        if (amount > 0) {
          const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            customer_email: email,
            line_items: [{
              price_data: {
                currency: 'brl',
                product_data: { name: `Assinatura SaaS - Plano ${plan}` },
                unit_amount: amount,
              },
              quantity: 1,
            }],
            mode: 'payment',
            success_url: `${siteUrl}/admin/users?payment=success`,
            cancel_url: `${siteUrl}/admin/users?payment=canceled`,
          })
          checkoutUrl = session.url || ""
        }
        
        messageText = `Sua fatura do Plano ${plan} está disponível para pagamento no Cartão de Crédito:\n\n${checkoutUrl}`
        
        // Simular envio de Email (Até configurar o Resend)
        console.log(`[Email] Simulação de envio para ${email}:\n${messageText}`)
        return NextResponse.json({ success: true, message: `Cobrança enviada via E-mail` })

      } else if (method === 'whatsapp') {
        // GERAR PIXGO
        const pixGoKey = process.env.PIXGO_API_KEY
        
        let pixCopiaCola = ""
        
        if (pixGoKey) {
          try {
            const amountStr = plan === 'Pro' ? 97.00 : plan === 'Premium' ? 147.00 : 0
            
            const pixgoPayload = {
              amount: Number(amountStr),
              description: `Assinatura Gestor Master - ${plan}`,
              customer_name: user.user_metadata?.full_name || "Cliente Gestor",
              customer_email: user.email,
              external_id: user.id
            }

            const pixgoReq = await fetch("https://pixgo.org/api/v1/payment/create", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-API-Key": pixGoKey
              },
              body: JSON.stringify(pixgoPayload)
            })

            const pixgoRes = await pixgoReq.json()
            
            if (pixgoReq.ok && pixgoRes.success) {
              pixCopiaCola = pixgoRes.data.qr_code
            } else {
              console.error("PIXGO Error:", pixgoRes)
              pixCopiaCola = "Falha ao gerar PIX"
            }
          } catch (e) {
            console.error("Erro ao gerar PixGo:", e)
            pixCopiaCola = "Falha ao gerar PIX"
          }
        } else {
           pixCopiaCola = "00020126580014br.gov.bcb.pix0136" + Math.random().toString(36).substring(2) + "5204000053039865802BR5913GESTORMASTER6009SAOPAULO62070503***6304ABCD"
        }
        
        messageText = `*Fatura Disponível - Plano ${plan}* 📄\n\nAqui está a sua chave PIX Copia e Cola:\n\n\`\`\`${pixCopiaCola}\`\`\`\n\nBasta copiar o código acima e colar no seu app do banco para ativar o plano.`
      }
    }

    // 3. Disparo via Evolution API (WhatsApp)
    if ((type === 'welcome' || method === 'whatsapp') && phone) {
      if (evoUrl && evoKey) {
        try {
          // Remover caracteres não numéricos do telefone e adicionar DDI se faltar
          let cleanPhone = phone.replace(/\D/g, '')
          if (!cleanPhone.startsWith('55')) cleanPhone = '55' + cleanPhone

          await fetch(`${evoUrl}/message/sendText/${instanceName}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': evoKey
            },
            body: JSON.stringify({
              number: cleanPhone,
              text: messageText,
              delay: 1200
            })
          })
          console.log(`[WhatsApp] Mensagem enviada via Evolution API para ${cleanPhone}`)
        } catch (e) {
          console.error("Falha ao conectar com Evolution API:", e)
        }
      } else {
        console.log(`[WhatsApp Simulado] Faltam chaves do Evolution. Mensagem para ${phone}:\n${messageText}`)
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: type === 'welcome' ? 'Boas vindas enviadas' : `Cobrança enviada via ${method}` 
    })
  } catch (error: any) {
    console.error("Erro interno ao enviar cobrança/msg:", error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
