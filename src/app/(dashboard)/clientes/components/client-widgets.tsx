import { ClientsManagementMetrics } from "@/types/database"
import { ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts"
import { Users, UserCheck, UserMinus, UserX, AlertCircle, PhoneOff, Smartphone, CalendarDays, TrendingUp, HelpCircle } from "lucide-react"
import { cn } from "@/lib/utils"

export function ClickableKPI({
  icon: Icon,
  label,
  value,
  colorClass,
  onClick,
  active
}: {
  icon: any
  label: string
  value: number
  colorClass: string
  onClick: () => void
  active: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full flex-col gap-1 rounded-lg border bg-card p-4 text-left transition-all hover:border-foreground/30 hover:shadow-sm",
        active ? "border-foreground shadow-sm ring-1 ring-foreground" : "border-border"
      )}
    >
      <div className="flex items-center gap-2">
        <Icon className={cn("size-4", colorClass)} />
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <span className="mt-1 text-2xl font-bold tracking-tight text-foreground">{value}</span>
    </button>
  )
}

export function BaseGrowthChart({ data }: { data: Array<{ month: string; new_clients: number }> }) {
  if (!data || data.length === 0) {
    return <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Sem dados.</div>
  }
  
  return (
    <div className="flex h-full flex-col">
      <h3 className="mb-4 text-sm font-semibold text-foreground">Crescimento da Base</h3>
      <div className="min-h-[200px] flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} dy={10} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
            <Tooltip
              cursor={{ fill: 'var(--muted)' }}
              contentStyle={{ borderRadius: '8px', border: '1px solid var(--border)', fontSize: '12px' }}
            />
            <Bar dataKey="new_clients" name="Novos Clientes" fill="var(--money)" radius={[4, 4, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export function ClientsByStatusChart({ data }: { data: Array<{ name: string; value: number }> }) {
  if (!data || data.length === 0) return null

  const COLORS: Record<string, string> = {
    active: '#10b981', // money
    vencido: '#ef4444', // danger
    suspended: '#f59e0b', // warning
    canceled: '#6b7280', // muted
    inactive: '#6b7280',
    pending: '#3b82f6', // interactive
  }

  const labelMap: Record<string, string> = {
    active: 'Ativos', vencido: 'Vencidos', suspended: 'Suspensos',
    canceled: 'Cancelados', inactive: 'Inativos', pending: 'Pendentes'
  }

  return (
    <div className="flex h-full flex-col">
      <h3 className="mb-2 text-sm font-semibold text-foreground">Status da Carteira</h3>
      <div className="flex min-h-[160px] flex-1 items-center justify-center">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%" cy="50%" innerRadius={40} outerRadius={60}
              paddingAngle={2} dataKey="value" nameKey="name" stroke="none"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[entry.name] || '#8884d8'} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: any, name: any) => [value, labelMap[name] || name]}
              contentStyle={{ borderRadius: '8px', border: '1px solid var(--border)', fontSize: '12px' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-2">
        {data.map((entry, index) => (
          <div key={index} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <div className="size-2.5 rounded-full" style={{ backgroundColor: COLORS[entry.name] || '#8884d8' }} />
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

  const COLORS = ['#6366f1', '#8b5cf6', '#d946ef', '#f43f5e', '#f97316', '#eab308']

  return (
    <div className="flex h-full flex-col">
      <h3 className="mb-4 text-sm font-semibold text-foreground">Distribuição por Serviço</h3>
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
