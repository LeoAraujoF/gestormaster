import OpenAI from 'openai'
import { z } from 'zod'
import { zodTextFormat } from 'openai/helpers/zod'

const schema = z.object({ narratives: z.array(z.object({ finding_index: z.number().int(), summary: z.string(), recommendation: z.string() })) })
const models = ['gpt-5.6-terra', 'gpt-5.6-sol']
const scenarios = Array.from({ length: 50 }, (_, index) => ({
  finding_index: index,
  agent: ['financial', 'commercial', 'collections', 'executive', 'operational'][index % 5],
  title: index % 2 ? 'Operação estável' : 'Receita em risco exige atenção',
  summary: index % 2 ? 'Não há falhas relevantes.' : 'Existem ciclos vencidos e não pagos.',
  recommendation: index % 2 ? 'Mantenha o acompanhamento.' : 'Revise os ciclos vencidos.',
  evidence: [{ metric: 'fixture', value: index }],
}))

async function evaluate(model: string) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  let valid = 0
  let factual = 0
  for (let start = 0; start < scenarios.length; start += 5) {
    const batch = scenarios.slice(start, start + 5)
    const response = await client.responses.parse({
      model,
      reasoning: { effort: 'medium' },
      max_output_tokens: 2000,
      input: [
        { role: 'system', content: 'Reescreva somente resumo e recomendação. Não use algarismos e não crie fatos.' },
        { role: 'user', content: JSON.stringify(batch) },
      ],
      text: { format: zodTextFormat(schema, 'intelligence_eval') },
    })
    for (const narrative of response.output_parsed?.narratives || []) {
      if (batch.some((row) => row.finding_index === narrative.finding_index)) valid++
      if (!/\d/.test(`${narrative.summary} ${narrative.recommendation}`)) factual++
    }
  }
  return { model, scenarios: scenarios.length, valid_schema_rate: valid / scenarios.length, numeric_fidelity_rate: factual / scenarios.length, approved: valid / scenarios.length >= 0.95 && factual === scenarios.length }
}

if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY é obrigatória para executar a avaliação comparativa')
Promise.all(models.map(evaluate)).then((results) => process.stdout.write(`${JSON.stringify(results, null, 2)}\n`))
