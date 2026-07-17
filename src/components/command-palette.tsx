"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Search } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"

const NAV_DESTINATIONS = [
  { title: "Painel", url: "/painel", shortcut: "⌘1" },
  { title: "Clientes", url: "/clientes", shortcut: "⌘2" },
  { title: "Financeiro", url: "/financeiro", shortcut: "⌘3" },
  { title: "Serviços", url: "/servicos", shortcut: "⌘4" },
  { title: "Promoções", url: "/promocoes" },
  { title: "Revendas", url: "/revendas" },
  { title: "Automação", url: "/automacao" },
  { title: "Aquecimento", url: "/aquecimento" },
  { title: "Leads", url: "/leads" },
  { title: "Integrações", url: "/conexoes/gateways" },
  { title: "Painéis IPTV", url: "/conexoes/paineis" },
  { title: "Configurações", url: "/configuracoes" },
  { title: "Minha conta", url: "/minha-conta" },
  { title: "Suporte", url: "/suporte" },
]

// Rotas dos atalhos ⌘1–⌘4 (mesma ordem da sidebar)
const SHORTCUT_ROUTES = ["/painel", "/clientes", "/financeiro", "/servicos"]

type ClientHit = { id: string; name: string; status: string; phone: string | null }

/**
 * Busca global ⌘K (design_handoff §8): navegação + busca de clientes reais.
 * Também registra os atalhos globais ⌘1–⌘4.
 */
export function CommandPalette() {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [clients, setClients] = React.useState<ClientHit[]>([])
  const [isSearching, setIsSearching] = React.useState(false)
  const [searchError, setSearchError] = React.useState<string | null>(null)
  const router = useRouter()
  const supabase = React.useMemo(() => createClient(), [])

  // Atalhos globais: ⌘K abre; ⌘1–⌘4 navegam
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      if (e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((o) => !o)
        return
      }
      const idx = ["1", "2", "3", "4"].indexOf(e.key)
      if (idx >= 0) {
        e.preventDefault()
        router.push(SHORTCUT_ROUTES[idx])
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [router])

  // Mostra os clientes mais recentes ao abrir e pesquisa por nome ou telefone.
  React.useEffect(() => {
    if (!open) return

    let cancelled = false
    const term = query.trim()
    const digits = term.replace(/\D/g, "")
    const isPhoneQuery = term.length > 0 && /^[\d\s()+-]+$/.test(term)

    const t = setTimeout(async () => {
      setIsSearching(true)
      setSearchError(null)

      let request = supabase
        .from("clients")
        .select("id, name, status, phone")
        .limit(6)

      request = term
        ? isPhoneQuery
          ? request.ilike("phone", `%${digits}%`).order("name")
          : request.ilike("name", `%${term}%`).order("name")
        : request.order("created_at", { ascending: false })

      const { data, error } = await request
      if (cancelled) return

      setClients(error ? [] : data || [])
      setSearchError(error ? "Não foi possível consultar os clientes." : null)
      setIsSearching(false)
    }, term ? 250 : 0)

    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query, open, supabase])

  const go = (url: string) => {
    setOpen(false)
    setQuery("")
    router.push(url)
  }

  const statusDot = (status: string) =>
    status === "vencido" ? "bg-danger" : status === "pending" ? "bg-warning" : status === "active" ? "bg-money" : "bg-input"

  // Filtro manual (shouldFilter off): resultados async de clientes não casam com o filtro do cmdk
  const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  const navFiltered = query.trim()
    ? NAV_DESTINATIONS.filter((d) => normalize(d.title).includes(normalize(query.trim())))
    : NAV_DESTINATIONS

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-8 w-full max-w-[260px] items-center gap-2 rounded-md border border-input bg-secondary/60 px-2.5 text-left text-xs text-muted-foreground transition-colors hover:bg-secondary"
      >
        <Search className="size-3.5 shrink-0" />
        <span className="flex-1 truncate">Buscar cliente…</span>
        <kbd className="num rounded border border-border bg-card px-1 py-0.5 text-[9px] leading-none text-muted-foreground">
          ⌘K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar cliente ou ir para…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {isSearching && (
              <div role="status" className="px-3 py-4 text-center text-xs text-muted-foreground">
                Buscando clientes…
              </div>
            )}
            {!isSearching && searchError && (
              <div role="alert" className="px-3 py-4 text-center text-xs text-danger">
                {searchError}
              </div>
            )}
            {!isSearching && !searchError && clients.length === 0 && navFiltered.length === 0 && (
              <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
            )}
            {!isSearching && !searchError && clients.length > 0 && (
              <>
                <CommandGroup heading={query.trim() ? "Clientes" : "Clientes recentes"}>
                  {clients.map((c) => (
                    <CommandItem key={c.id} value={`cliente-${c.id}`} onSelect={() => go(`/clientes?q=${encodeURIComponent(c.name)}`)}>
                      <span className={`status-dot ${statusDot(c.status)}`} />
                      <span className="flex-1">{c.name}</span>
                      {c.phone && <span className="num text-[10px] text-muted-foreground">{c.phone}</span>}
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}
            {navFiltered.length > 0 && (
              <CommandGroup heading="Ir para">
                {navFiltered.map((d) => (
                  <CommandItem key={d.url} value={d.title} onSelect={() => go(d.url)}>
                    <span className="flex-1">{d.title}</span>
                    {d.shortcut && (
                      <span className="num text-[10px] text-muted-foreground">{d.shortcut}</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  )
}
