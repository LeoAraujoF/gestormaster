"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { TriangleAlert } from "lucide-react"

type QuotaInstance = {
  instance_name: string
  status: string
  is_primary: boolean
  role: string
  used: number | null
  remaining: number | null
  exhausted: boolean
  reset_in_ms: number
}

type QuotaResponse = {
  plan: string
  limit: number | null
  unlimited: boolean
  any_exhausted: boolean
  instances: QuotaInstance[]
}

/** "em 3h20" / "em 45 min" — para dizer quando o envio volta, não só que parou. */
function formatarEspera(ms: number) {
  const minutos = Math.max(1, Math.round(ms / 60000))
  if (minutos < 60) return `em ${minutos} min`
  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60
  return resto === 0 ? `em ${horas}h` : `em ${horas}h${String(resto).padStart(2, "0")}`
}

/**
 * Avisa quando o limite diário de mensagens de um número esgotou.
 *
 * Em 10/09/2026 o teto de 80 mensagens/dia travou lembretes e boas-vindas sem
 * nenhum sinal na interface — o contador vive no Redis e o operador não tinha
 * como saber. Este aviso existe para que "a mensagem não saiu" deixe de ser um
 * mistério: diz qual número esgotou, quando volta e o que fazer.
 *
 * Só aparece quando há algo esgotado. Plano ilimitado nunca mostra nada.
 */
export function DailyQuotaAlert({ className }: { className?: string }) {
  const [data, setData] = useState<QuotaResponse | null>(null)

  const carregar = useCallback(async () => {
    try {
      const res = await fetch("/api/evolution/daily-quota", { cache: "no-store" })
      if (!res.ok) return
      setData(await res.json())
    } catch {
      // Silencioso: não saber o consumo não pode quebrar a tela que hospeda o aviso.
    }
  }, [])

  useEffect(() => {
    void carregar()
    const timer = setInterval(() => { void carregar() }, 120_000)
    return () => clearInterval(timer)
  }, [carregar])

  if (!data || data.unlimited || !data.any_exhausted) return null

  const esgotados = data.instances.filter((instance) => instance.exhausted)
  const livres = data.instances.filter((instance) => !instance.exhausted && instance.status === "connected")
  const espera = Math.max(...esgotados.map((instance) => instance.reset_in_ms), 0)

  return (
    <div
      role="alert"
      className={`flex flex-col gap-2 rounded-xl border border-warning-border bg-warning-bg px-4 py-3 text-warning-fg sm:flex-row sm:items-start sm:gap-3 ${className || ""}`}
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          {esgotados.length === 1
            ? `Limite diário esgotado no número ${esgotados[0].instance_name}`
            : `Limite diário esgotado em ${esgotados.length} números`}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed opacity-90">
          O plano {data.plan} permite <span className="num">{data.limit}</span> mensagens por dia em cada número.
          As mensagens que não saíram não foram perdidas: voltam a ser tentadas {formatarEspera(espera)}, quando o
          contador vira o dia.
          {livres.length > 0
            ? ` Você ainda tem ${livres.length} ${livres.length === 1 ? "número livre" : "números livres"} hoje.`
            : " Nenhum número livre hoje."}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          {esgotados.map((instance) => (
            <span key={instance.instance_name} className="num text-[10.5px] opacity-90">
              {instance.instance_name} · {instance.used}/{data.limit}
              {instance.is_primary ? " · principal" : ""}
            </span>
          ))}
        </div>
      </div>
      <Link
        href="/planos"
        className="shrink-0 self-start rounded-md border border-warning-border px-2.5 py-1 text-[11.5px] font-semibold hover:bg-warning-fg/10"
      >
        Ver planos
      </Link>
    </div>
  )
}
