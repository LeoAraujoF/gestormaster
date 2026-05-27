/**
 * column-mapper.ts
 * 
 * Utilitário para mapeamento inteligente de colunas CSV.
 * Usa um dicionário de sinônimos para auto-detectar campos,
 * corrige telefones em notação científica, e lida com colunas extras.
 */

// Campos do sistema que podem ser mapeados
export type SystemField = 'name' | 'phone' | 'email' | 'status' | 'source' | 'notes'

export interface ColumnMapping {
  csvHeader: string
  systemField: SystemField | 'custom' | 'ignore'
  confidence: 'high' | 'medium' | 'low'
}

export interface MappingResult {
  mappings: ColumnMapping[]
  preview: Record<string, string>[]
  warnings: string[]
}

// Labels amigáveis para os campos do sistema
export const SYSTEM_FIELD_LABELS: Record<SystemField | 'custom' | 'ignore', string> = {
  name: 'Nome',
  phone: 'Telefone',
  email: 'E-mail',
  status: 'Status',
  source: 'Origem',
  notes: 'Notas',
  custom: 'Campo Extra',
  ignore: 'Ignorar',
}

// Dicionário de sinônimos para cada campo do sistema
const SYNONYMS: Record<SystemField, string[]> = {
  name: [
    'nome', 'name', 'nome_completo', 'nome completo', 'full_name', 'fullname',
    'cliente', 'contato', 'contact', 'razao_social', 'razão social', 'razao social',
    'empresa', 'company', 'responsavel', 'responsável',
  ],
  phone: [
    'telefone', 'phone', 'celular', 'fone', 'tel', 'whatsapp', 'whats', 'wpp',
    'numero', 'número', 'cell', 'mobile', 'contato_telefone', 'phone_number',
    'telefone_1', 'telefone_2', 'telefone1', 'telefone2', 'cel', 'fixo',
    'fone_1', 'fone_2', 'num_telefone', 'ddd_telefone',
  ],
  email: [
    'email', 'e-mail', 'e_mail', 'mail', 'correio', 'correio_eletronico',
    'email_address', 'endereco_email', 'endereço_email',
  ],
  status: [
    'status', 'situação', 'situacao', 'fase', 'etapa', 'stage', 'estado',
    'state', 'lead_status',
  ],
  source: [
    'source', 'origem', 'canal', 'fonte', 'channel', 'lead_source',
    'como_conheceu', 'indicacao', 'indicação', 'referencia', 'referência',
  ],
  notes: [
    'notes', 'notas', 'observação', 'observacao', 'obs', 'anotações', 'anotacoes',
    'comentário', 'comentario', 'description', 'descricao', 'descrição',
    'observacoes', 'observações', 'nota', 'comments', 'remark', 'remarks',
  ],
}

/**
 * Remove acentos e caracteres especiais de uma string
 */
function removeAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/**
 * Normaliza um header de CSV para matching
 */
function normalizeHeader(header: string): string {
  return removeAccents(header)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '_') // substitui caracteres especiais por _
    .replace(/_+/g, '_')        // colapsa múltiplos _
    .replace(/^_|_$/g, '')      // remove _ nas bordas
}

/**
 * Detecta se um valor está em notação científica (ex: "3,2E+10", "3.2E10")
 */
export function isScientificNotation(value: string): boolean {
  if (!value) return false
  const cleaned = value.replace(',', '.')
  return /^[0-9]+\.?[0-9]*[eE][+]?[0-9]+$/.test(cleaned.trim())
}

/**
 * Converte um valor em notação científica para número inteiro como string
 * Ex: "3,2E+10" → "32000000000"
 */
export function fixScientificNotation(value: string): string {
  if (!value) return value
  
  if (isScientificNotation(value)) {
    const cleaned = value.replace(',', '.')
    const num = parseFloat(cleaned)
    if (!isNaN(num)) {
      return num.toFixed(0)
    }
  }
  
  return value
}

/**
 * Limpa e normaliza um número de telefone
 */
export function cleanPhone(value: string): string {
  if (!value) return ''
  
  // Primeiro tenta corrigir notação científica
  let phone = fixScientificNotation(value)
  
  // Remove tudo que não é dígito
  phone = phone.replace(/\D/g, '')
  
  // Remove zeros à esquerda excessivos
  if (phone.length > 13) {
    phone = phone.replace(/^0+/, '')
  }
  
  return phone
}

/**
 * Auto-mapeia colunas de um CSV para campos do sistema.
 * Retorna um mapeamento com nível de confiança para cada coluna.
 */
export function autoMapColumns(headers: string[]): ColumnMapping[] {
  const usedFields = new Set<SystemField>()
  const mappings: ColumnMapping[] = []

  // Primeira passada: matches de alta confiança (exato)
  for (const header of headers) {
    const normalized = normalizeHeader(header)
    let found = false

    for (const [field, synonyms] of Object.entries(SYNONYMS) as [SystemField, string[]][]) {
      if (usedFields.has(field)) continue

      const normalizedSynonyms = synonyms.map(s => normalizeHeader(s))
      if (normalizedSynonyms.includes(normalized)) {
        mappings.push({ csvHeader: header, systemField: field, confidence: 'high' })
        usedFields.add(field)
        found = true
        break
      }
    }

    if (!found) {
      // Placeholder - será resolvido na segunda passada
      mappings.push({ csvHeader: header, systemField: 'custom', confidence: 'low' })
    }
  }

  // Segunda passada: matches parciais para os que ficaram como 'custom'
  for (let i = 0; i < mappings.length; i++) {
    if (mappings[i].confidence !== 'low') continue

    const normalized = normalizeHeader(mappings[i].csvHeader)

    for (const [field, synonyms] of Object.entries(SYNONYMS) as [SystemField, string[]][]) {
      if (usedFields.has(field)) continue

      const normalizedSynonyms = synonyms.map(s => normalizeHeader(s))
      
      // Match parcial: o header contém algum sinônimo ou vice-versa
      const partialMatch = normalizedSynonyms.some(syn => 
        normalized.includes(syn) || syn.includes(normalized)
      )

      if (partialMatch) {
        mappings[i] = { csvHeader: mappings[i].csvHeader, systemField: field, confidence: 'medium' }
        usedFields.add(field)
        break
      }
    }
  }

  // Tratamento especial: se há colunas de telefone duplicadas e 'phone' já foi alocado,
  // as extras ficam como 'custom' (ex: "Telefone" aparece 2x)
  
  return mappings
}

/**
 * Aplica o mapeamento confirmado pelo usuário aos dados do CSV.
 * Retorna os leads prontos para inserção no Supabase.
 */
export function applyMapping(
  data: Record<string, string>[],
  mappings: ColumnMapping[],
  userId: string
): { leads: Record<string, any>[], warnings: string[] } {
  const warnings: string[] = []
  let scientificCount = 0

  const leads = data.map((row, index) => {
    const lead: Record<string, any> = {
      user_id: userId,
      name: 'Desconhecido',
      phone: '',
      email: '',
      status: 'novo',
      source: 'CSV',
      notes: '',
      custom_fields: {} as Record<string, string>,
    }

    for (const mapping of mappings) {
      const rawValue = (row[mapping.csvHeader] || '').trim()
      if (!rawValue) continue

      if (mapping.systemField === 'ignore') continue

      if (mapping.systemField === 'custom') {
        // Normaliza o nome do campo custom para uso como variável de template
        const customKey = normalizeHeader(mapping.csvHeader)
        lead.custom_fields[customKey] = rawValue
      } else if (mapping.systemField === 'phone') {
        // Tratamento especial para telefone
        if (isScientificNotation(rawValue)) {
          scientificCount++
        }
        const cleaned = cleanPhone(rawValue)
        // Se já tem phone, não sobrescreve (usa o primeiro válido)
        if (!lead.phone && cleaned.length >= 8) {
          lead.phone = cleaned
        } else if (cleaned.length >= 8 && lead.phone !== cleaned) {
          // Segundo telefone vai para custom_fields
          const customKey = normalizeHeader(mapping.csvHeader) || 'telefone_2'
          lead.custom_fields[customKey] = cleaned
        }
      } else if (mapping.systemField === 'name') {
        lead.name = rawValue
      } else {
        lead[mapping.systemField] = rawValue
      }
    }

    // Limpar custom_fields vazio
    if (Object.keys(lead.custom_fields).length === 0) {
      delete lead.custom_fields
    }

    return lead
  })

  if (scientificCount > 0) {
    warnings.push(`${scientificCount} telefone(s) em notação científica foram corrigidos automaticamente.`)
  }

  return { leads, warnings }
}

/**
 * Coleta todas as chaves de custom_fields únicas de uma lista de leads
 */
export function getCustomFieldKeys(leads: { custom_fields?: Record<string, string> }[]): string[] {
  const keys = new Set<string>()
  for (const lead of leads) {
    if (lead.custom_fields) {
      for (const key of Object.keys(lead.custom_fields)) {
        keys.add(key)
      }
    }
  }
  return Array.from(keys).sort()
}
