import OpenAI from 'openai';

const openai = process.env.OPENAI_API_KEY 
  ? new OpenAI({ 
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || undefined,
    })
  : null;

/**
 * Gera uma nova mensagem de WhatsApp que pareça extremamente humana.
 * O objetivo é manter duas instâncias conversando para aumentar o trust score.
 */
export async function generateWarmupMessage(previousContext?: string): Promise<string> {
  // Se a chave não existir, retornamos falha graciosa ou uma mensagem estática fallback
  if (!process.env.OPENAI_API_KEY) {
    const fallbacks = [
      "Tudo certo por aqui, e contigo?",
      "Acabei de ver, haha",
      "Pode me mandar aquele arquivo depois?",
      "Tranquilo, te aviso.",
      "Blz, qualquer coisa me chama.",
      "Cara, não acredito nisso kkkk",
      "Nossa, que doideira.",
      "Vai fazer o que hoje mais tarde?",
      "Tô enrolado aqui no trabalho, já te respondo.",
      "Sério? Não tava sabendo.",
      "Me manda o link disso aí depois.",
      "Fechado!",
      "Acho que sim, vou confirmar e te falo.",
      "Bom dia! Tudo na paz?",
      "Opa, e aí mano, beleza?",
      "Tô indo almoçar agora, te ligo mais tarde.",
      "Vixe, pior que eu esqueci de ver isso.",
      "Mano, cê não tem ideia do que rolou.",
      "Aham, pode deixar.",
      "Top, gostei da ideia."
    ];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }

  const systemPrompt = `Você é um usuário brasileiro comum no WhatsApp conversando com um amigo.
Regras:
1. Responda em apenas 1 ou 2 frases curtas.
2. Use gírias leves (ex: blz, haha, mano, cara, ué, nossa).
3. Nunca use hashtags, emojis excessivos ou formatações corporativas.
4. Mantenha o tom extremamente informal e preguiçoso.
5. Se houver contexto anterior, continue o assunto. Se não, puxe um assunto aleatório cotidiano (filmes, trabalho, comida, tempo).`;

  try {
    const messages: any[] = [
      { role: 'system', content: systemPrompt }
    ];

    if (previousContext) {
      messages.push({ role: 'user', content: `Mensagem anterior do meu amigo: "${previousContext}". Me dê uma resposta curta e natural:` });
    } else {
      messages.push({ role: 'user', content: 'Inicie uma conversa curta aleatória.' });
    }

    if (!openai) throw new Error('OpenAI client is null');

    const modelName = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';

    const response = await openai.chat.completions.create({
      model: modelName,
      messages,
      temperature: 0.8,
      max_tokens: 50,
    });

    return response.choices[0].message.content || 'Blz';
  } catch (error) {
    console.error('Erro na OpenAI:', error);
    return 'Blz, depois a gente se fala.';
  }
}
