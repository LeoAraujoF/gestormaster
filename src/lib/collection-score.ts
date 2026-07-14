export type CollectionProfileCode = 'excellent' | 'regular' | 'attention' | 'high_risk' | 'vip' | 'premium'

export function resolveProfileCode(score: number, confidence: string, tags: string[]): CollectionProfileCode {
  if (tags.includes('vip')) return 'vip'
  if (tags.includes('premium')) return 'premium'
  if (confidence !== 'high') return 'regular'
  if (score >= 80) return 'excellent'
  if (score >= 60) return 'regular'
  if (score >= 40) return 'attention'
  return 'high_risk'
}
