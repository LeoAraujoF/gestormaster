import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { AdvancedDashboardMetrics, PixChargeMetrics } from "@/types/database"
import { formatCurrency, cn } from "@/lib/utils"
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts"
import { TrendingUp, TrendingDown, ShieldCheck, Zap, Activity, Clock, Server, AlertCircle, Bot, Edit2, Check, X, QrCode } from "lucide-react"

/** Régua PIX — Fase 1 (pendentes / pagos hoje / pagos no mês) */
export function PixMetricsStrip({
  metrics,
  displayValue,
}: {
  metrics: PixChargeMetrics | null
  displayValue: (v: string | number) => string | number
}) {
  if (!metrics) return null

  const items = [
    {
      label: "PIX pendentes",
      value: String(displayValue(formatCurrency(metrics.pending_amount))),
      hint: `${metrics.pending_count} cobrança${metrics.pending_count === 1 ? "" : "s"}`,
      className: "text-warning-fg",
    },
    {
      label: "PIX pagos hoje",
      value: String(displayValue(formatCurrency(metrics.paid_today_amount))),
      hint: `${metrics.paid_today_count} pagamento${metrics.paid_today_count === 1 ? "" : "s"}`,
      className: "text-money",
    },
    {
      label: "PIX no mês",
      value: String(displayValue(formatCurrency(metrics.paid_month_amount))),
      hint: `${metrics.paid_month_count} pagamento${metrics.paid_month_count === 1 ? "" : "s"}`,
      className: "text-foreground",
    },
  ]

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <QrCode className="size-3.5 text-muted-foreground" />
        <p className="text-[12px] font-semibold text-foreground">Recebimentos PIX</p>
        <span className="text-[10px] text-muted-foreground">dinâmico · renovação automática</span>
      </div>
      <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {items.map((item) => (
          <div key={item.label} className="p-4">
            <p className="microlabel">{item.label}</p>
            <p className={cn("num mt-1 text-[18px] font-semibold tracking-[-0.02em]", item.className)}>
              {item.value}
            </p>
            <p className="mt-0.5 text-[10.5px] text-muted-foreground">{item.hint}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// Componente: AI Assistant Placeholder
export function AIAssistantBanner({ metrics }: { metrics: AdvancedDashboardMetrics }) {
  const alertsCount = (metrics.default_clients > 0 ? 1 : 0) + (metrics.alerts_sent_today > 0 ? 1 : 0);

  return (
    <div className="flex items-center gap-3 rounded-lg border border-purple-500/20 bg-purple-500/5 px-4 py-3 text-sm text-purple-600 dark:text-purple-400">
      <Bot className="size-5 shrink-0" />
      <p>
        <strong className="font-semibold">Assistente:</strong>{" "}
        {alertsCount > 0
          ? `Identifiquei ${alertsCount} pontos de atenção hoje na sua operação financeira.`
          : "Tudo em ordem com sua operação hoje."}
      </p>
    </div>
  )
}

// Componente: Monthly Goal Bar
export function MonthlyGoalBar({ metrics, onUpdate }: { metrics: AdvancedDashboardMetrics, onUpdate?: () => void }) {
  const [isEditing, setIsEditing] = useState(false)
  const [goalValue, setGoalValue] = useState(metrics.monthly_goal?.toString() || "10000")
  const [isSaving, setIsSaving] = useState(false)
  const supabase = createClient()

  const goal = metrics.monthly_goal || 10000;
  const current = metrics.received_month;
  const percentage = Math.min(100, Math.round((current / goal) * 100));

  const handleSave = async () => {
    const numValue = Number(goalValue.replace(/[^0-9]/g, ''))
    if (!numValue || numValue <= 0) {
      toast.error("Insira um valor válido para a meta.")
      return
    }

    setIsSaving(true)
    const { error } = await supabase.rpc("update_monthly_goal", { new_goal: numValue })
    setIsSaving(false)

    if (error) {
      toast.error("Erro ao atualizar meta.")
    } else {
      toast.success("Meta atualizada com sucesso!")
      setIsEditing(false)
      if (onUpdate) onUpdate()
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-foreground">Meta Mensal</span>
          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <Edit2 className="size-3" />
            </button>
          )}
        </div>
        {!isEditing && <span className="font-semibold text-money">{percentage}%</span>}
      </div>

      {isEditing ? (
        <div className="flex items-center gap-2 mt-1">
          <div className="relative flex-1">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
            <input
              type="number"
              value={goalValue}
              onChange={(e) => setGoalValue(e.target.value)}
              className="w-full rounded-md border border-input bg-transparent px-7 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              disabled={isSaving}
              autoFocus
            />
          </div>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex size-6 items-center justify-center rounded-md bg-money/10 text-money hover:bg-money/20 transition-colors"
          >
            <Check className="size-3.5" />
          </button>
          <button
            onClick={() => setIsEditing(false)}
            disabled={isSaving}
            className="flex size-6 items-center justify-center rounded-md bg-danger/10 text-danger hover:bg-danger/20 transition-colors"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full bg-money transition-all duration-500"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <p className="text-right text-xs text-muted-foreground">
            {formatCurrency(current)} / {formatCurrency(goal)}
          </p>
        </>
      )}
    </div>
  )
}

// Componente: Financial Score
export function FinancialScore({ metrics }: { metrics: AdvancedDashboardMetrics }) {
  // Score mock calculation base
  let score = 100;
  if (metrics.total_clients > 0) {
    const defaultRate = metrics.default_clients / metrics.total_clients;
    score -= defaultRate * 100 * 2; // perde 2 pontos pra cada 1% de inadimplência
  }
  score = Math.max(0, Math.min(100, Math.round(score)));

  let label = "Excelente";
  let color = "text-money";
  if (score < 50) { label = "Crítico"; color = "text-danger"; }
  else if (score < 80) { label = "Atenção"; color = "text-warning"; }

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card p-6 text-center">
      <h3 className="mb-2 text-sm font-medium text-muted-foreground">Score Financeiro</h3>
      <div className={cn("text-5xl font-bold tracking-tighter", color)}>
        {score}
      </div>
      <p className="mt-1 text-sm font-medium text-foreground">{label}</p>
      <p className="mt-2 text-[11px] text-muted-foreground">Baseado em inadimplência e pagamentos.</p>
    </div>
  )
}

// Componente: System Health
export function SystemHealth() {
  const services = [
    { name: "WhatsApp", status: "Operacional", icon: Zap, color: "text-money" },
    { name: "Fila de Envios", status: "Operacional", icon: Activity, color: "text-money" },
    { name: "API Pix", status: "Instável", icon: Server, color: "text-warning" },
  ];

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-medium text-foreground">Saúde do Sistema</h3>
      <div className="space-y-3">
        {services.map((s, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <s.icon className={cn("size-4", s.color)} />
              <span className="text-muted-foreground">{s.name}</span>
            </div>
            <span className={cn("text-xs font-medium", s.color)}>{s.status}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Componente: Automation Savings
export function AutomationSavings({ metrics }: { metrics: AdvancedDashboardMetrics }) {
  // 2 min por mensagem enviada
  const minutesSaved = metrics.alerts_sent_today * 2;
  const hours = Math.floor(minutesSaved / 60);
  const minutes = minutesSaved % 60;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <Clock className="size-4 text-interactive" />
        <h3 className="text-sm font-medium text-foreground">Economia da Automação</h3>
      </div>
      <p className="text-2xl font-semibold text-foreground">
        {hours > 0 ? `${hours}h ` : ''}{minutes}min
      </p>
      <p className="text-xs text-muted-foreground mt-1">de trabalho manual economizado hoje.</p>
    </div>
  )
}

// Componente: Top Clients
export function TopClients({ metrics }: { metrics: AdvancedDashboardMetrics }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-medium text-foreground">Top 5 Clientes</h3>
      <div className="space-y-3">
        {metrics.top_clients && metrics.top_clients.length > 0 ? (
          metrics.top_clients.map((c, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex size-5 items-center justify-center rounded-full bg-secondary text-[10px] font-bold text-muted-foreground">
                  {i + 1}
                </div>
                <span className="text-sm text-foreground truncate max-w-[120px]">{c.name}</span>
              </div>
              <span className="text-sm font-medium text-money">{formatCurrency(c.total_paid)}</span>
            </div>
          ))
        ) : (
          <p className="text-xs text-muted-foreground">Sem dados suficientes.</p>
        )}
      </div>
    </div>
  )
}

// Componente: Receipts Distribution Chart
export function ReceiptDistribution({ metrics }: { metrics: AdvancedDashboardMetrics }) {
  const data = metrics.receipt_methods || [];
  const COLORS = ['#10b981', '#6366f1', '#f59e0b'];

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-medium text-foreground">Distribuição de Recebimentos</h3>
      {data.length > 0 ? (
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={60}
                paddingAngle={2}
                dataKey="value"
                nameKey="method"
                stroke="none"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: any) => formatCurrency(value)}
                contentStyle={{ borderRadius: '8px', border: '1px solid var(--border)' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-8">Sem dados.</p>
      )}
      <div className="flex justify-center gap-4 mt-2">
        {data.map((entry, index) => (
          <div key={index} className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <div className="size-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
            {entry.method}
          </div>
        ))}
      </div>
    </div>
  )
}

// Componente: Revenue Evolution Chart
export function RevenueEvolutionChart({ metrics }: { metrics: AdvancedDashboardMetrics }) {
  const data = metrics.revenue_evolution || [];

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-4 text-sm font-medium text-foreground">Evolução do Faturamento (30 dias)</h3>
      <div className="h-60">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--money)" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="var(--money)" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              dy={10}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              tickFormatter={(val) => `R$${val}`}
            />
            <Tooltip
              formatter={(value: any) => formatCurrency(value)}
              contentStyle={{ borderRadius: '8px', border: '1px solid var(--border)' }}
            />
            <Area
              type="monotone"
              dataKey="amount"
              stroke="var(--money)"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorAmount)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export function TrendIndicator({ current, last }: { current: number, last: number }) {
  const diff = current - last;
  if (diff === 0) return null;
  const isUp = diff > 0;
  const Icon = isUp ? TrendingUp : TrendingDown;
  return (
    <div className={cn("flex items-center gap-1 text-[11px]", isUp ? "text-money" : "text-danger")}>
      <Icon className="size-3" />
      {Math.abs(diff)} em relação ao mês passado
    </div>
  )
}
