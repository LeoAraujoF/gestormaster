/* =====================================================================
 * client-form-dialog.tsx — TRECHOS para o "Novo cliente / Ficha"
 * Objetivo: usuário + senha OPCIONAIS por serviço selecionado + Observação.
 * Cole cada bloco no lugar indicado do seu client-form-dialog.tsx atual.
 * Estilo já pensado para a direção 2a (tokens do README principal).
 * ===================================================================== */

/* ---------------------------------------------------------------------
 * (A) IMPORTS extras
 * ------------------------------------------------------------------- */
import { useState } from "react"
import { Eye, EyeOff, KeyRound } from "lucide-react"
// (Input, Label, Textarea, CheckCircle2, Box já são importados no arquivo)


/* ---------------------------------------------------------------------
 * (B) SCHEMA (Zod) — troca o `username` único por acessos por serviço
 * ------------------------------------------------------------------- */
const clientSchema = z.object({
  name: z.string().min(2, "Nome é obrigatório"),
  phone: z.string().optional(),
  selected_services: z.array(z.string()).min(1, "Selecione ao menos um serviço"),
  // credenciais por serviço — chaveado por service_id, tudo opcional:
  service_access: z
    .record(z.object({ username: z.string().optional(), password: z.string().optional() }))
    .optional()
    .default({}),
  plan_value: z.number().min(0, "O valor não pode ser negativo"),
  screens: z.number().min(1, "Mínimo de 1 tela").max(10, "Máximo de 10 telas"),
  due_date: z.string().min(1, "Data de vencimento é obrigatória"),
  due_time: z.string().optional(),
  status: z.enum(["active", "inactive", "pending", "vencido"]),
  observation: z.string().optional(),
  description: z.string().optional(),
})
type ClientForm = z.infer<typeof clientSchema>


/* ---------------------------------------------------------------------
 * (C) defaultValues do useForm — remova `username`, adicione service_access
 * ------------------------------------------------------------------- */
// defaultValues: {
//   name: "", phone: "",
//   selected_services: [],
//   service_access: {},
//   plan_value: 0, screens: 1,
//   due_date: new Date().toISOString().split("T")[0],
//   due_time: "23:59", status: "active",
//   observation: "", description: "",
// }


/* ---------------------------------------------------------------------
 * (D) EFEITO de carregamento (editar cliente) — monta o mapa de acessos
 * ------------------------------------------------------------------- */
// Dentro do useEffect(open, client, reset), no ramo `if (client)`:
const accessFromClient: Record<string, { username?: string; password?: string }> = {}
;(client?.client_services || []).forEach((cs: any) => {
  accessFromClient[cs.service_id] = { username: cs.username || "", password: cs.password || "" }
})
// reset({ ...demais campos, selected_services: (client.client_services||[]).map(cs=>cs.service_id),
//         service_access: accessFromClient })


/* ---------------------------------------------------------------------
 * (E) ESTADO local p/ mostrar/ocultar senha por serviço
 *     (declare junto dos outros useState do componente)
 * ------------------------------------------------------------------- */
const [revealed, setRevealed] = useState<Record<string, boolean>>({})
const toggleReveal = (id: string) => setRevealed((r) => ({ ...r, [id]: !r[id] }))


/* ---------------------------------------------------------------------
 * (F) SEÇÃO "Serviços e acessos" — substitui o box de serviços atual.
 *     Requer: const selectedServices = watch("selected_services") || []
 *             register, toggleService (já existem no arquivo)
 * ------------------------------------------------------------------- */
;<div className="rounded-xl border border-border bg-muted/20 overflow-hidden">
  <div className="bg-muted/40 px-4 py-3 border-b border-border flex items-center gap-2">
    <KeyRound className="w-4 h-4 text-primary" />
    <h3 className="text-[11px] font-semibold uppercase tracking-wider font-mono">
      Serviços e acessos <span className="text-destructive">*</span>
    </h3>
    <span className="ml-auto text-[11px] text-muted-foreground">usuário e senha são opcionais</span>
  </div>

  <div className="p-4 space-y-2">
    {servicesList.map((service) => {
      const isSelected = selectedServices.includes(service.id)
      const show = !!revealed[service.id]
      return (
        <div
          key={service.id}
          className={cn(
            "rounded-lg border overflow-hidden transition-colors",
            isSelected ? "border-ring/40 bg-accent/40" : "border-border bg-card"
          )}
        >
          {/* linha de seleção */}
          <div
            onClick={() => toggleService(service.id)}
            className="flex items-center gap-3 px-3 py-3 cursor-pointer"
          >
            <span
              className={cn(
                "w-[18px] h-[18px] rounded-[5px] flex items-center justify-center border",
                isSelected ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/40"
              )}
            >
              {isSelected && <CheckCircle2 className="w-3 h-3" />}
            </span>
            <span className="flex-1 text-sm font-medium">{service.name}</span>
            <span className="text-[11px] text-muted-foreground">
              {isSelected ? "incluído" : "toque para adicionar"}
            </span>
          </div>

          {/* credenciais opcionais — só quando selecionado */}
          {isSelected && (
            <div className="px-3 pb-3 grid grid-cols-2 gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Usuário</Label>
                <Input
                  placeholder="login do painel"
                  className="h-8 font-mono text-[11px] bg-background"
                  {...register(`service_access.${service.id}.username` as const)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Senha</Label>
                <div className="relative">
                  <Input
                    type={show ? "text" : "password"}
                    placeholder="senha de acesso"
                    className="h-8 font-mono text-[11px] bg-background pr-8"
                    {...register(`service_access.${service.id}.password` as const)}
                  />
                  <button
                    type="button"
                    onClick={() => toggleReveal(service.id)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )
    })}

    {errors.selected_services && (
      <p className="text-xs font-semibold text-destructive mt-1">{errors.selected_services.message}</p>
    )}
  </div>
</div>


/* ---------------------------------------------------------------------
 * (G) CAMPO Observação — mantenha o Textarea (campo `observation` já existe)
 * ------------------------------------------------------------------- */
;<div className="space-y-2">
  <Label htmlFor="observation" className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
    Observação
  </Label>
  <Textarea
    id="observation"
    placeholder="Anotações internas sobre o cliente (opcional)…"
    {...register("observation")}
    className="resize-none h-20 bg-background"
  />
</div>


/* ---------------------------------------------------------------------
 * (H) SALVAR — monta as linhas de client_services COM as credenciais.
 *     Substitui os dois blocos onde hoje se insere `service_id` puro.
 *     (vale tanto no ramo "novo" quanto após o delete no ramo "editar")
 * ------------------------------------------------------------------- */
if (clientId && data.selected_services.length > 0) {
  const access = data.service_access || {}
  const servicesToInsert = data.selected_services.map((serviceId) => ({
    client_id: clientId,
    service_id: serviceId,
    username: access[serviceId]?.username?.trim() || null,
    password: access[serviceId]?.password || null,
  }))

  const { error: serviceError } = await supabase.from("client_services").insert(servicesToInsert)
  if (serviceError) throw serviceError
}

/* ---------------------------------------------------------------------
 * (I) SELECTs que leem client_services e precisam trazer as credenciais
 *     na hora de EDITAR — adicione username, password ao select:
 *     .select(`*, client_services ( service_id, username, password, services (id, name, cost) )`)
 *     (arquivos: clientes/page.tsx, e onde a ficha é aberta para edição)
 *     Nunca traga `password` em telas de listagem/observadores externos.
 * ------------------------------------------------------------------- */
