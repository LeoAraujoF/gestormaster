import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { LucideIcon } from "lucide-react"

interface MetricCardProps {
  title: string
  value: string
  icon: LucideIcon
  description?: string
  trend?: {
    value: number
    label: string
  }
  colorVariant?: "violet" | "blue" | "green" | "red"
  className?: string
}

export function MetricCard({
  title,
  value,
  icon: Icon,
  description,
  trend,
  colorVariant = "violet",
  className,
}: MetricCardProps) {
  const iconColors = {
    violet: "text-[#8B5CF6] bg-[#8B5CF6]/10",
    blue: "text-[#3B82F6] bg-[#3B82F6]/10",
    green: "text-[#10B981] bg-[#10B981]/10",
    red: "text-[#EF4444] bg-[#EF4444]/10",
  }

  return (
    <Card className={cn("overflow-hidden relative group", className)}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between space-y-0 pb-2">
          <p className="text-sm font-medium text-muted-foreground">
            {title}
          </p>
          <div className={cn("p-2 rounded-lg transition-smooth", iconColors[colorVariant])}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            {value}
          </h2>
          {(description || trend) && (
            <div className="flex items-center gap-2 mt-1">
              {trend && (
                <span className={cn(
                  "text-xs font-medium px-2 py-0.5 rounded-full",
                  trend.value >= 0 
                    ? "bg-emerald-500/10 text-emerald-500" 
                    : "bg-red-500/10 text-red-500"
                )}>
                  {trend.value >= 0 ? "+" : ""}{trend.value}%
                </span>
              )}
              {description && (
                <p className="text-xs text-muted-foreground truncate">
                  {description}
                </p>
              )}
            </div>
          )}
        </div>
        {/* Decorative subtle background icon */}
        <Icon className="absolute -bottom-4 -right-4 w-24 h-24 opacity-5 pointer-events-none group-hover:scale-110 transition-transform duration-500" />
      </CardContent>
    </Card>
  )
}
