import '../lib/env';
import { Worker, Job } from 'bullmq';
import { redisConnection } from '../lib/redis';
import { WEBHOOK_QUEUE_NAME, aiQueue, messageQueue } from '../lib/queue';
import { supabaseAdmin } from '../lib/supabase/service-role';
import crypto from 'crypto';
import { logger, runWithCorrelationId } from '../lib/logger';

logger.info('🛡️ Webhook Worker iniciado e aguardando eventos...');

const worker = new Worker(WEBHOOK_QUEUE_NAME, async (job: Job) => {
  const payload = job.data;
  
  // Webhooks geralmente não trazem correlationId, então o wrapper vai criar um
  return runWithCorrelationId(payload.correlationId, undefined, async () => {
    // 1. Controle de Idempotência
    const hash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const idempotencyKey = `webhook:idempotency:${hash}`;

    const alreadyProcessed = await redisConnection.get(idempotencyKey);
    if (alreadyProcessed) {
      logger.info(`[Job ${job.id}] ♻️ Evento duplicado descartado (Idempotency Key: ${idempotencyKey})`);
      return; // Sucesso imediato (não processa novamente)
    }

    logger.info(`[Job ${job.id}] 📥 Processando webhook: ${payload.event}`);

  try {
    if (payload.event === 'CONNECTION_UPDATE' || payload.event === 'connection.update') {
      const instanceName = payload.instance;
      const state = payload.data?.state;
      const sender = payload.sender || payload.data?.sender;
      
      if (instanceName && state) {
         const updateData: any = { 
           status: state === 'open' ? 'connected' : 'disconnected',
           updated_at: new Date().toISOString()
         };

         if (state === 'open' && sender) {
           updateData.phone_number = sender.split('@')[0];
         }

         const { error, data: updatedInstance } = await supabaseAdmin.from('evolution_instances')
           .update(updateData)
           .eq('instance_name', instanceName)
           .select('organization_id')
           .single();
           
         if (error) throw error;

         // Se acabou de conectar com sucesso, vamos checar se a org tem Typebot ativo para plugar
         if (state === 'open' && updatedInstance?.organization_id) {
           const { data: typebotInt } = await supabaseAdmin
             .from('integrations')
             .select('credentials')
             .eq('organization_id', updatedInstance.organization_id)
             .eq('provider', 'typebot')
             .eq('is_active', true)
             .single();

           if (typebotInt) {
             try {
               const { createEvolutionClient } = await import('../lib/evolution');
               const evolution = createEvolutionClient();
               await evolution.setTypebot(instanceName, {
                 enabled: true,
                 url: typebotInt.credentials.viewer_url,
                 typebot: typebotInt.credentials.typebot_name,
                 expire: 0,
                 keywordFinish: "#SAIR",
                 delayMessage: 1000,
                 unknownMessage: "",
                 listeningFromMe: false,
                 stopBotFromMe: true,
                 keepOpen: false,
                 debounceTime: 10
               });
               logger.info(`🤖 Typebot plugado automaticamente na instância ${instanceName}`);
             } catch (e) {
               logger.error(`Falha ao plugar Typebot na instância ${instanceName}`, e);
             }
           }
         }
      }
    }
    else if (payload.event === 'MESSAGES_UPSERT' || payload.event === 'messages.upsert') {
      // Compatibilidade: Evolution v1 usa array (messages[0]), v2 às vezes manda o objeto direto
      const msg = payload.data?.messages?.[0] || payload.data;
      if (msg && msg.key && !msg.key.fromMe) {
        const textMessage = msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.message?.imageMessage?.caption;
        logger.info(`Mensagem recebida de ${msg.key.remoteJid}: ${textMessage}`);
        
        const instanceName = payload.instance;
        if (instanceName && textMessage) {
          const { data: instanceData } = await supabaseAdmin
            .from('evolution_instances')
            .select('organization_id')
            .eq('instance_name', instanceName)
            .single();

          if (instanceData?.organization_id) {
            const orgId = instanceData.organization_id;
            const phone = msg.key.remoteJid.split('@')[0];
            const textLower = textMessage.toLowerCase();
            const renewStateKey = `renew_flow:${orgId}:${phone}`;
            
            // 1. Checar se está no meio do fluxo de renovação
            const currentState = await redisConnection.get(renewStateKey);
            
            if (currentState) {
              const stateData = JSON.parse(currentState);
              
              if (stateData.step === 'choosing_plan') {
                const choice = parseInt(textMessage.trim());
                if (!isNaN(choice) && choice >= 1 && choice <= stateData.plans.length) {
                  const chosenPlan = stateData.plans[choice - 1];
                  
                  // Gerar Pix via Mercado Pago
                  const { data: mpInt } = await supabaseAdmin
                    .from('integrations')
                    .select('credentials')
                    .eq('organization_id', orgId)
                    .eq('provider', 'mercadopago')
                    .eq('is_active', true)
                    .single();

                  if (mpInt?.credentials?.access_token) {
                    const appUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://roboajuda.site');
                    const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${mpInt.credentials.access_token}`,
                        'X-Idempotency-Key': crypto.randomUUID()
                      },
                      body: JSON.stringify({
                        transaction_amount: Number(chosenPlan.price),
                        description: `Renovação - Plano ${chosenPlan.name}`,
                        payment_method_id: "pix",
                        payer: { 
                          email: "pagamento@automacao.com",
                          first_name: "Cliente",
                          last_name: "Gestor",
                          identification: {
                            type: "CPF",
                            number: "19119119100" // CPF genérico para passar na validação do Mercado Pago
                          }
                        },
                        external_reference: `${orgId}|${instanceName}|${phone}|RENEWAL|${stateData.clientId}|${chosenPlan.name}`,
                        notification_url: `${appUrl}/api/webhooks/mercadopago?orgId=${orgId}`
                      })
                    });

                    if (mpResponse.ok) {
                      const mpData = await mpResponse.json();
                      const copiaCola = mpData.point_of_interaction?.transaction_data?.qr_code;
                      
                      const formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
                      
                      // Mensagem 1: Instruções
                      await messageQueue.add('send-message', {
                        organizationId: orgId,
                        instanceName: instanceName,
                        phone: phone,
                        finalMessage: `Excelente! Você escolheu o plano *${chosenPlan.name}* (${formatter.format(chosenPlan.price)}).\n\nAqui está o seu Pix Copia e Cola para pagamento:`,
                        source: 'renewal_bot'
                      });

                      // Mensagem 2: Apenas o código Pix (fácil de copiar)
                      await messageQueue.add('send-message', {
                        organizationId: orgId,
                        instanceName: instanceName,
                        phone: phone,
                        finalMessage: copiaCola,
                        source: 'renewal_bot'
                      });

                      // Mensagem 3: Confirmação
                      await messageQueue.add('send-message', {
                        organizationId: orgId,
                        instanceName: instanceName,
                        phone: phone,
                        finalMessage: `_Assim que o pagamento for confirmado, seu plano será renovado automaticamente!_`,
                        source: 'renewal_bot'
                      });
                      
                      await redisConnection.del(renewStateKey);
                      return; // Interrompe para não ir pra IA
                    } else {
                      const errorData = await mpResponse.text();
                      logger.error(`[Job ${job.id}] ❌ Erro Mercado Pago (Status ${mpResponse.status}): ${errorData}`);
                    }
                  } else {
                    logger.warn(`[Job ${job.id}] ⚠️ Integração MercadoPago não encontrada ou token ausente para a Org ${orgId}`);
                  }
                  
                  // Falha ao gerar Pix
                  await messageQueue.add('send-message', {
                    organizationId: orgId,
                    instanceName: instanceName,
                    phone: phone,
                    finalMessage: "Desculpe, ocorreu um erro ao gerar o seu PIX. Por favor, tente novamente mais tarde ou contate o suporte.",
                    source: 'renewal_bot'
                  });
                  await redisConnection.del(renewStateKey);
                  return;
                } else {
                  await messageQueue.add('send-message', {
                    organizationId: orgId,
                    instanceName: instanceName,
                    phone: phone,
                    finalMessage: "Opção inválida. Por favor, digite o *número* correspondente ao plano desejado.",
                    source: 'renewal_bot'
                  });
                  return;
                }
              }
            } else if (textLower.includes('quero renovar') || textLower === 'renovar' || textLower === 'renovar plano') {
              // Buscar o cliente pelo telefone
              let normalizedPhone = phone;
              if (phone.startsWith('55') && phone.length > 11) normalizedPhone = phone.substring(2); // Remove 55
              
              // Cria um pattern para ignorar máscaras (ex: "11999999999" vira "%11%99999%9999%")
              const phoneDdd = normalizedPhone.substring(0, 2);
              const phonePart1 = normalizedPhone.substring(2, 7);
              const phonePart2 = normalizedPhone.substring(7);
              const likePattern = `%${phoneDdd}%${phonePart1}%${phonePart2}%`;

              const { data: clients, error: clientErr } = await supabaseAdmin
                .from('clients')
                .select('id, name, status, client_services(services(id, name, plans))')
                .eq('organization_id', orgId)
                .like('phone', likePattern)
                .limit(1);

              if (clientErr) {
                logger.error(`[Job ${job.id}] Erro ao buscar cliente:`, clientErr);
              }

              if (clients && clients.length > 0) {
                const client = clients[0];
                // client_services contains an array of objects { services: { id, name, plans } }
                const serviceWithPlans = client.client_services
                  ?.map((cs: any) => cs.services)
                  ?.find((s: any) => s && s.plans && s.plans.length > 0);
                
                if (serviceWithPlans && serviceWithPlans.plans.length > 0) {
                  const plans = serviceWithPlans.plans;
                  
                  let menuText = `Olá ${client.name.split(' ')[0]}! Para renovar o seu serviço *${serviceWithPlans.name}*, escolha um dos planos abaixo:\n\n`;
                  const formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
                  
                  plans.forEach((plan: any, idx: number) => {
                    menuText += `*${idx + 1}.* ${plan.name} - ${formatter.format(plan.price)}\n`;
                  });
                  menuText += `\n_Digite apenas o NÚMERO da opção desejada._`;
                  
                  await redisConnection.setex(renewStateKey, 1800, JSON.stringify({ // Expira em 30 min
                    step: 'choosing_plan',
                    plans: plans,
                    clientId: client.id,
                    serviceId: serviceWithPlans.id
                  }));
                  
                  await messageQueue.add('send-message', {
                    organizationId: orgId,
                    instanceName: instanceName,
                    phone: phone,
                    finalMessage: menuText,
                    source: 'renewal_bot'
                  });
                  return; // Impede que vá para a IA
                }
              }
            }

            // Se não caiu no fluxo de renovação, vai para a IA
            const { data: aiData } = await supabaseAdmin
              .from('integrations')
              .select('credentials')
              .eq('organization_id', instanceData.organization_id)
              .eq('provider', 'ai_assistant')
              .eq('is_active', true)
              .single();

            if (aiData) {
              await aiQueue.add('process-ai', {
                organization_id: instanceData.organization_id,
                instance_name: instanceName,
                remoteJid: msg.key.remoteJid,
                messageText: textMessage,
                credentials: aiData.credentials
              });
              logger.info(`🤖 [Job ${job.id}] Mensagem enviada para AI Worker (Org: ${instanceData.organization_id})`);
            }
          }
        }
      }
    }

    // 3. Marca como processado no Redis (Expira em 24h)
    await redisConnection.setex(idempotencyKey, 86400, 'processed');
    logger.info(`[Job ${job.id}] ✅ Evento Inbound processado com sucesso!`);

  } catch (error: any) {
    logger.error(`[Job ${job.id}] ❌ Falha ao processar webhook: ${error.message}`);
    throw error; // Devolve pra fila e retenta em 2 segundos (backoff)
  }
  });

}, { 
  connection: redisConnection as any,
  concurrency: 10, // Maior concorrência pois só insere/atualiza no BD local
});

worker.on('failed', (job, err) => {
  if (job) {
    logger.error(`[Webhook Job ${job.id}] Falhou: ${err.message}`);
  }
});
