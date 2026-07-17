'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { AlertTriangle, BarChart3, Calculator, Loader2, Save, Trash2, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { InsightsNavigation } from '@/components/insights-navigation'
import { MetricGrid, PageHeader, PageSection, PageShell } from '@/components/page-layout'
import { usePrivacy } from '@/hooks/use-privacy'
import { cn, formatCurrency } from '@/lib/utils'
import type { AnalyticsDashboardDTO, AnalyticsHorizon, AnalyticsScenarioDTO, PriceSimulationResult } from '@/lib/analytics-types'

const horizons: Array<{ value: AnalyticsHorizon; label: string }> = [
  { value: 'month', label: 'Mês' },
  { value: '3m', label: '3 meses' },
  { value: '6m', label: '6 meses' },
  { value: '12m', label: '12 meses' },
]

const coverageLabels = { insufficient: 'Insuficiente', partial: 'Parcial', full: 'Completa' }

const AnalyticsForecastChart = dynamic(() => import('@/components/analytics-forecast-chart').then((module) => module.AnalyticsForecastChart), {
  loading: () => <div className="h-full animate-pulse rounded-lg bg-muted" />,
})

export function AnalyticsView({ initialData, initialScenarios, initialCursor }: {
  initialData: AnalyticsDashboardDTO | null
  initialScenarios: AnalyticsScenarioDTO[]
  initialCursor: string | null
}) {
  const [data, setData] = useState(initialData)
  const [horizon, setHorizon] = useState<AnalyticsHorizon>('month')
  const [loading, setLoading] = useState(false)
  const [scenarios, setScenarios] = useState(initialScenarios)
  const [cursor, setCursor] = useState(initialCursor)
  const [currentPrice, setCurrentPrice] = useState(String(initialData?.price_cohorts[0]?.current_price || ''))
  const [newPrice, setNewPrice] = useState(String(initialData?.price_cohorts[0]?.current_price || ''))
  const [churn, setChurn] = useState('0')
  const [scenarioName, setScenarioName] = useState('')
  const [simulation, setSimulation] = useState<PriceSimulationResult | null>(null)
  const [simulating, setSimulating] = useState(false)
  const [saving, setSaving] = useState(false)
  const { displayValue } = usePrivacy()
  const money = (value: number) => displayValue(formatCurrency(value))

  const loadHorizon = async (next: AnalyticsHorizon) => {
    setHorizon(next)
    setLoading(true)
    try {
      const response = await fetch(`/api/analytics?horizon=${next}`, { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Falha ao carregar projeção')
      setData(payload)
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  const runSimulation = async () => {
    setSimulating(true)
    try {
      const response = await fetch('/api/analytics/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_price: Number(currentPrice), new_price: Number(newPrice), assumed_churn_pct: Number(churn) }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Falha ao simular')
      setSimulation(payload)
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setSimulating(false)
    }
  }

  const saveScenario = async () => {
    if (!simulation || !scenarioName.trim()) return
    setSaving(true)
    try {
      const response = await fetch('/api/analytics/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: scenarioName.trim(), current_price: simulation.current_price, new_price: simulation.new_price, assumed_churn_pct: simulation.assumed_churn_pct }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Falha ao salvar cenário')
      setScenarios((current) => [payload, ...current])
      setScenarioName('')
      toast.success('Cenário salvo sem alterar preços reais.')
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  const deleteScenario = async (id: string) => {
    const response = await fetch(`/api/analytics/scenarios/${id}`, { method: 'DELETE' })
    const payload = await response.json()
    if (!response.ok) return toast.error(payload.error || 'Falha ao excluir cenário')
    setScenarios((current) => current.filter((scenario) => scenario.id !== id))
    toast.success('Cenário excluído.')
  }

  const loadMore = async () => {
    if (!cursor) return
    const response = await fetch(`/api/analytics/scenarios?cursor=${encodeURIComponent(cursor)}&limit=20`, { cache: 'no-store' })
    const payload = await response.json()
    if (!response.ok) return toast.error(payload.error || 'Falha ao carregar cenários')
    setScenarios((current) => [...current, ...payload.scenarios])
    setCursor(payload.next_cursor)
  }

  const chartData = useMemo(() => data?.forecast.series.map((point) => ({
    ...point,
    label: new Date(`${point.month}-01T12:00:00`).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
  })) || [], [data])

  if (!data) return <Upgrade />

  const scenarioCards = [
    { label: 'Conservador', value: data.forecast.conservative_cash, hint: 'Pior taxa observada nos últimos meses completos' },
    { label: 'Contratual', value: data.forecast.contractual_total, hint: 'Ciclos e MRR sem cancelamentos projetados' },
    { label: 'Realização esperada', value: data.forecast.expected_cash, hint: 'Aplicando a taxa histórica de pagamento' },
  ]

  return <PageShell>
    <div className="rounded-xl border bg-card p-5 sm:p-6">
      <PageHeader
        eyebrow="Insights financeiros"
        title="Analytics avançado"
        description="Antecipe o fechamento, compare cenários e simule reajustes sem modificar sua operação real."
        actions={<div className="flex w-full rounded-xl border bg-background/80 p-1 shadow-sm backdrop-blur sm:w-auto">
        {horizons.map((item) => <button key={item.value} onClick={() => loadHorizon(item.value)} className={cn('rounded-md px-3 py-1.5 text-xs', horizon === item.value ? 'bg-card font-semibold shadow-sm' : 'text-muted-foreground')}>{item.label}</button>)}
        </div>}
      />
    </div>

    <InsightsNavigation active="analytics" />

    <div className={cn('rounded-lg border p-4', data.coverage.level === 'full' && !data.coverage.stale ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-amber-500/20 bg-amber-500/5')}>
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-4 text-amber-600" />
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium">Cobertura {coverageLabels[data.coverage.level]}</p><Badge variant="outline">{data.coverage.days} dias</Badge><Badge variant="outline">{data.coverage.complete_months} meses completos</Badge></div><p className="mt-1 text-xs text-muted-foreground">{data.coverage.reasons[0] || 'Histórico suficiente para projeções completas.'}</p></div>
      </div>
    </div>

    <PageSection title="Pulso financeiro" description="Os números essenciais para decidir com segurança neste horizonte.">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Metric label="MRR ativo" value={money(data.summary.mrr)} />
      <Metric label="Contratual do mês" value={money(data.summary.month_contractual)} />
      <Metric label="Confirmado" value={money(data.summary.month_confirmed)} />
      <Metric label="Fechamento estimado" value={data.summary.month_close_estimate === null ? 'Indisponível' : money(data.summary.month_close_estimate)} />
      <Metric label="Realização" value={data.summary.realization_rate === null ? 'Indisponível' : `${data.summary.realization_rate.toFixed(1)}%`} />
    </div>
    </PageSection>

    <PageSection title="Projeção e contexto" description="Visualize a trajetória esperada e compare com o desempenho recente.">
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2"><CardHeader><CardTitle className="text-base">Projeção por horizonte</CardTitle></CardHeader><CardContent><div className="h-72">{loading ? <div className="flex h-full items-center justify-center"><Loader2 className="size-5 animate-spin" /></div> : <AnalyticsForecastChart data={chartData} />}</div></CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">Comparações</CardTitle></CardHeader><CardContent className="space-y-4"><Comparison label="Mês anterior" value={money(data.comparisons.previous_month_confirmed)} hint={data.comparisons.confirmed_change_pct === null ? 'Sem base comparável' : `${data.comparisons.confirmed_change_pct >= 0 ? '+' : ''}${data.comparisons.confirmed_change_pct.toFixed(1)}% no mês atual`} /><Comparison label="Últimos 12 meses" value={money(data.comparisons.rolling_12m_confirmed)} hint="Receita efetivamente recebida" /><Comparison label="Novos clientes" value={String(data.comparisons.new_clients_month)} hint="No mês atual" /></CardContent></Card>
    </div>
    </PageSection>

    <MetricGrid columns={3}>{scenarioCards.map((card, index) => <Card key={card.label} className={cn("overflow-hidden", index === 2 && "border-emerald-500/25 bg-emerald-500/[0.06]")}><CardContent className="p-5"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{card.label}</p><p className="mt-2 text-2xl font-semibold tracking-tight">{card.value === null ? 'Indisponível' : money(card.value)}</p><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{card.hint}</p></CardContent></Card>)}</MetricGrid>

    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Calculator className="size-4" />Simulador de reajuste</CardTitle></CardHeader><CardContent className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3">
        <label className="space-y-1.5 text-sm"><span>Faixa atual</span><select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={currentPrice} onChange={(event) => { setCurrentPrice(event.target.value); setNewPrice(event.target.value); setSimulation(null) }}>{data.price_cohorts.map((cohort) => <option key={cohort.current_price} value={cohort.current_price}>{formatCurrency(cohort.current_price)} · {cohort.active_clients} clientes</option>)}</select></label>
        <label className="space-y-1.5 text-sm"><span>Novo preço</span><Input type="number" min="0.01" step="0.01" value={newPrice} onChange={(event) => setNewPrice(event.target.value)} /></label>
        <label className="space-y-1.5 text-sm"><span>Perda esperada (%)</span><Input type="number" min="0" max="100" step="0.1" value={churn} onChange={(event) => setChurn(event.target.value)} /></label>
      </div>
      <Button onClick={runSimulation} disabled={simulating || !currentPrice || !newPrice}>{simulating ? <Loader2 className="mr-2 size-4 animate-spin" /> : <TrendingUp className="mr-2 size-4" />}Calcular impacto</Button>
      {simulation && <div className="rounded-lg border bg-muted/30 p-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Metric label="Clientes atingidos" value={String(simulation.eligible_clients)} compact /><Metric label="Clientes esperados" value={simulation.projected_clients.toFixed(1)} compact /><Metric label="Novo MRR" value={money(simulation.projected_mrr)} compact /><Metric label="Variação anual" value={money(simulation.annual_delta)} compact tone={simulation.annual_delta >= 0 ? 'positive' : 'negative'} /><Metric label="Perda de equilíbrio" value={`${simulation.break_even_churn_pct.toFixed(1)}%`} compact /></div>{simulation.warning && <p className="mt-3 text-xs text-amber-700">{simulation.warning}</p>}{data.permissions.can_manage_scenarios && <div className="mt-4 flex flex-col gap-2 sm:flex-row"><Input maxLength={80} placeholder="Nome do cenário" value={scenarioName} onChange={(event) => setScenarioName(event.target.value)} /><Button variant="outline" disabled={saving || !scenarioName.trim()} onClick={saveScenario}>{saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}Salvar cenário</Button></div>}</div>}
    </CardContent></Card>

    <Card><CardHeader><CardTitle className="text-base">Cenários salvos</CardTitle></CardHeader><CardContent><div className="space-y-3">{scenarios.length ? scenarios.map((scenario) => <div key={scenario.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="font-medium">{scenario.name}</p><p className="mt-1 text-xs text-muted-foreground">{formatCurrency(scenario.current_price)} → {formatCurrency(scenario.new_price)} · perda {scenario.assumed_churn_pct}% · base de {scenario.eligible_clients} clientes</p></div><div className="text-left sm:text-right"><p className={cn('font-semibold', scenario.annual_delta >= 0 ? 'text-money' : 'text-danger')}>{money(scenario.annual_delta)}/ano</p><p className="text-[10px] text-muted-foreground">Base: {new Date(`${scenario.source_snapshot_date}T12:00:00`).toLocaleDateString('pt-BR')}</p></div>{data.permissions.can_manage_scenarios && <Button size="icon" variant="ghost" aria-label="Excluir cenário" onClick={() => deleteScenario(scenario.id)}><Trash2 className="size-4" /></Button>}</div>) : <div className="py-8 text-center text-sm text-muted-foreground">Nenhum cenário salvo.</div>}{cursor && <Button variant="outline" className="w-full" onClick={loadMore}>Carregar mais</Button>}</div></CardContent></Card>
  </PageShell>
}

function Metric({ label, value, compact = false, tone }: { label: string; value: React.ReactNode; compact?: boolean; tone?: 'positive' | 'negative' }) {
  return <div className={cn(!compact && 'rounded-lg border bg-card p-4')}><p className="text-[11px] text-muted-foreground">{label}</p><p className={cn('mt-1 font-semibold', compact ? 'text-base' : 'text-lg', tone === 'positive' && 'text-money', tone === 'negative' && 'text-danger')}>{value}</p></div>
}

function Comparison({ label, value, hint }: { label: string; value: React.ReactNode; hint: string }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-0.5 font-semibold">{value}</p><p className="text-[11px] text-muted-foreground">{hint}</p></div>
}

function Upgrade() {
  return <PageShell width="compact"><InsightsNavigation active="analytics" /><div className="rounded-xl border bg-card px-6 py-16 text-center"><BarChart3 className="mx-auto size-10 text-muted-foreground" /><h1 className="mt-4 text-2xl font-semibold">Decisões financeiras com visão de futuro</h1><p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">Projeções financeiras, comparações históricas e simulações de reajuste estão disponíveis nos planos Pro e Master.</p><Button className="mt-6" onClick={() => window.location.assign('/planos')}>Conhecer o plano Pro</Button></div></PageShell>
}
