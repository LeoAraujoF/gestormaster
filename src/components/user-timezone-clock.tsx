"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Clock3 } from "lucide-react"

const DEFAULT_TIMEZONE = "-03:00"
const SUPPORTED_TIMEZONES = new Set(["-03:00", "-04:00", "-05:00", "+01:00", "+00:00"])

const TIMEZONE_NAMES: Record<string, string> = {
  "-03:00": "Horário de Brasília",
  "-04:00": "Amazonas / Nova York",
  "-05:00": "Acre",
  "+01:00": "Portugal",
  "+00:00": "Londres",
}

function validTimezone(value: unknown): value is string {
  return typeof value === "string" && SUPPORTED_TIMEZONES.has(value)
}

function timezoneMinutes(timezone: string) {
  const sign = timezone.startsWith("-") ? -1 : 1
  const [hours, minutes] = timezone.slice(1).split(":").map(Number)
  return sign * (hours * 60 + minutes)
}

function timezoneLabel(timezone: string) {
  if (timezone === "+00:00") return "UTC"
  const sign = timezone.startsWith("-") ? "−" : "+"
  return `UTC${sign}${Number(timezone.slice(1, 3))}`
}

function clockParts(now: Date, timezone: string) {
  const shifted = new Date(now.getTime() + timezoneMinutes(timezone) * 60_000)
  const pad = (value: number) => String(value).padStart(2, "0")
  const hours = pad(shifted.getUTCHours())
  const minutes = pad(shifted.getUTCMinutes())
  const seconds = pad(shifted.getUTCSeconds())
  const day = pad(shifted.getUTCDate())
  const month = pad(shifted.getUTCMonth() + 1)
  const year = shifted.getUTCFullYear()

  return {
    compact: `${hours}:${minutes}`,
    full: `${hours}:${minutes}:${seconds}`,
    date: `${day}/${month}/${year}`,
    dateTime: `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${timezone}`,
  }
}

export function UserTimezoneClock({ initialTimezone }: { initialTimezone?: string }) {
  const [timezone, setTimezone] = useState(validTimezone(initialTimezone) ? initialTimezone : DEFAULT_TIMEZONE)
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    queueMicrotask(() => setNow(new Date()))
    const interval = window.setInterval(() => setNow(new Date()), 1_000)
    const handleTimezoneChange = (event: Event) => {
      const nextTimezone = (event as CustomEvent<{ timezone?: unknown }>).detail?.timezone
      if (validTimezone(nextTimezone)) setTimezone(nextTimezone)
    }

    window.addEventListener("gestor:timezone-change", handleTimezoneChange)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener("gestor:timezone-change", handleTimezoneChange)
    }
  }, [])

  const parts = now ? clockParts(now, timezone) : null
  const name = TIMEZONE_NAMES[timezone] ?? "Fuso configurado"
  const offset = timezoneLabel(timezone)

  return (
    <Link
      href="/minha-conta"
      className="flex h-8 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-2"
      title={`${name} (${offset}) · Clique para alterar em Minha conta`}
      aria-label={parts ? `Horário configurado: ${parts.full}, ${parts.date}, ${name}` : `Carregando horário de ${name}`}
    >
      <Clock3 className="hidden size-3.5 lg:block" aria-hidden="true" />
      <time dateTime={parts?.dateTime} className="num text-[11px] font-semibold tabular-nums text-foreground">
        <span className="sm:hidden">{parts?.compact ?? "--:--"}</span>
        <span className="hidden sm:inline">{parts?.full ?? "--:--:--"}</span>
      </time>
      <span className="hidden text-[10px] font-medium 2xl:inline">{offset}</span>
    </Link>
  )
}
