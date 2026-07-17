import { ResponsiveContainer, ComposedChart, Bar, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export function ClickableKPI({
  icon: Icon,
  label,
  value,
  hint,
  colorClass,
  onClick,
  active
}: {
  icon: LucideIcon
  label: string
  value: number
  hint: string
  colorClass: string
  onClick: () => void
  active: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "group flex min-h-[112px] w-full flex-col justify-between rounded-xl border bg-card p-4 text-left transition-colors hover:border-foreground/30 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-foreground bg-muted/60 ring-1 ring-foreground" : "border-border"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
        <Icon className={cn("size-4", colorClass)} aria-hidden="true" />
      </div>
      <div className="mt-3">
        <span className="num block text-2xl font-semibold tracking-tight text-foreground">{value}</span>
        <span className="mt-0.5 block text-[10px] text-muted-foreground">{hint}</span>
      </div>
    </button>
  )
}

export function ClientGrowthChart({
  data,
  currentMonth,
  previousMonth,
}: {
  data: Array<{ month: string; new_clients: number; cumulative: number }>
  currentMonth: number
  previousMonth: number
}) {
  if (!data || data.length === 0) {
    return <div className="flex min-h-[320px] items-center justify-center text-xs text-muted-foreground">Ainda não há histórico de aquisição.</div>
  }

  const difference = currentMonth - previousMonth
  const comparison = previousMonth > 0
    ? `${difference >= 0 ? "+" : ""}${((difference / previousMonth) * 100).toFixed(1)}%`
    : currentMonth > 0
      ? `+${currentMonth}`
      : "0"
  const hasAcquisition = data.some((item) => item.new_clients > 0)

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div><h3 className="text-base font-semibold text-foreground">Evolução mensal da aquisição</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Barras mostram novos clientes; a linha acompanha o acumulado adquirido no período exibido.</p></div>
        <div className="grid grid-cols-3 gap-2 sm:min-w-[300px]">
          <div className="rounded-lg bg-muted px-3 py-2"><span className="microlabel block text-[8px]">Este mês</span><span className="num mt-1 block text-base font-semibold text-foreground">{currentMonth}</span></div>
          <div className="rounded-lg bg-muted px-3 py-2"><span className="microlabel block text-[8px]">Mês anterior</span><span className="num mt-1 block text-base font-semibold text-foreground">{previousMonth}</span></div>
          <div className={cn("rounded-lg px-3 py-2", difference < 0 ? "bg-danger-bg" : "bg-success-bg")}><span className="microlabel block text-[8px]">Variação</span><span className={cn("num mt-1 block text-base font-semibold", difference < 0 ? "text-danger" : "text-success-fg")}>{comparison}</span></div>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-4 text-[11px] text-muted-foreground" aria-label="Legenda do gráfico de crescimento">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[var(--chart-2)]" />Novos no mês</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-[var(--chart-1)]" />Acumulado no período</span>
      </div>

      {hasAcquisition ? (
        <div className="mt-3 min-h-[250px] flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 12, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.55} />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} dy={10} />
              <YAxis yAxisId="clients" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
              <YAxis yAxisId="cumulative" orientation="right" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
              <Tooltip cursor={{ fill: 'var(--muted)' }} formatter={(value, name) => [value, name === "new_clients" ? "Novos clientes" : "Acumulado no período"]} contentStyle={{ borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)', fontSize: '12px' }} />
              <Bar yAxisId="clients" dataKey="new_clients" name="new_clients" fill="var(--chart-2)" radius={[6, 6, 0, 0]} maxBarSize={46} />
              <Line yAxisId="cumulative" type="monotone" dataKey="cumulative" name="cumulative" stroke="var(--chart-1)" strokeWidth={2.5} dot={{ r: 3, fill: 'var(--card)', strokeWidth: 2 }} activeDot={{ r: 5 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="mt-5 flex min-h-[250px] flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 px-6 text-center">
          <p className="text-sm font-medium text-foreground">Sem novas aquisições nos últimos seis meses</p>
          <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">O gráfico começará a comparar os meses assim que novos clientes forem cadastrados.</p>
        </div>
      )}
    </div>
  )
}

export function ClientsByStatusChart({ data }: { data: Array<{ name: string; value: number }> }) {
  if (!data || data.length === 0) return null

  const COLORS: Record<string, string> = {
    active: 'var(--chart-1)',
    vencido: 'var(--chart-4)',
    suspended: 'var(--chart-3)',
    canceled: 'var(--chart-5)',
    inactive: 'var(--chart-5)',
    pending: 'var(--chart-2)',
  }

  const labelMap: Record<string, string> = {
    active: 'Ativos', vencido: 'Vencidos', suspended: 'Suspensos',
    canceled: 'Cancelados', inactive: 'Inativos', pending: 'Pendentes'
  }

  return (
    <div className="flex h-full flex-col">
      <div><h3 className="text-sm font-semibold text-foreground">Status da carteira</h3><p className="mt-1 text-xs text-muted-foreground">Distribuição atual da base.</p></div>
      <div className="flex min-h-[160px] flex-1 items-center justify-center">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%" cy="50%" innerRadius={40} outerRadius={60}
              paddingAngle={2} dataKey="value" nameKey="name" stroke="none"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[entry.name] || 'var(--chart-2)'} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, name) => [value, labelMap[String(name)] || String(name)]}
              contentStyle={{ borderRadius: '8px', border: '1px solid var(--border)', fontSize: '12px' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-2">
        {data.map((entry, index) => (
          <div key={index} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <div className="size-2.5 rounded-full" style={{ backgroundColor: COLORS[entry.name] || 'var(--chart-2)' }} />
            {labelMap[entry.name] || entry.name} ({entry.value})
          </div>
        ))}
      </div>
    </div>
  )
}

export function ClientsByPlanChart({ data }: { data: Array<{ name: string; value: number }> }) {
  if (!data || data.length === 0) return (
    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Sem dados de planos ativos.</div>
  )

  const COLORS = ['var(--chart-2)', 'var(--chart-1)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)']

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4"><h3 className="text-sm font-semibold text-foreground">Distribuição por serviço</h3><p className="mt-1 text-xs text-muted-foreground">Concentração da carteira ativa.</p></div>
      <div className="flex flex-col gap-3">
        {data.slice(0, 5).map((item, i) => (
          <div key={i} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="size-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
              <span className="text-xs text-foreground truncate max-w-[120px]">{item.name}</span>
            </div>
            <span className="text-xs font-semibold">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
