import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/service-role'
import { logAudit, getIpFromRequest } from '@/lib/audit'
import { getAuthorizedOrganizationId } from '@/lib/access-control'

/**
 * Papel do número no motor de envio.
 *
 * O principal (`is_primary`) é o canal de lembretes e alertas ao cliente e fica
 * fora do disparo em massa. Os outros números só entram em massa se liberados
 * aqui — e, enquanto estiverem em uma campanha ativa, não são usados para
 * lembrete (a exclusão vive em `listMassBusyInstanceNames`).
 *
 * Rota separada de `/api/evolution/settings` porque aquela aplica a mesma
 * configuração a **todas** as instâncias do usuário de uma vez; papel é por
 * número.
 */

const roleSchema = z.object({
  instanceName: z.string().trim().min(1).max(100),
  allowMass: z.boolean(),
})

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const organizationId = await getAuthorizedOrganizationId(supabase, user.id)
    if (!organizationId) return NextResponse.json({ error: 'Organização não autorizada' }, { status: 403 })

    const parsed = roleSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Informe instanceName e allowMass.' }, { status: 400 })
    }
    const { instanceName, allowMass } = parsed.data

    const { data: instance, error: instanceError } = await supabaseAdmin
      .from('evolution_instances')
      .select('id, instance_name, is_primary, allow_mass')
      .eq('organization_id', organizationId)
      .eq('instance_name', instanceName)
      .maybeSingle()

    if (instanceError) throw instanceError
    if (!instance) return NextResponse.json({ error: 'Número não encontrado nesta organização.' }, { status: 404 })

    // Liberar o principal para massa contraria o motivo de ele existir: é o
    // canal que precisa continuar limpo para cobrança e aviso de renovação.
    // Para usar esse número em massa, troque o principal primeiro.
    if (allowMass && instance.is_primary === true) {
      return NextResponse.json({
        error: 'Este é o número principal, reservado a lembretes e alertas. Defina outro número como principal antes de liberá-lo para disparo em massa.',
      }, { status: 409 })
    }

    const { error: updateError } = await supabaseAdmin
      .from('evolution_instances')
      .update({ allow_mass: allowMass })
      .eq('id', instance.id)
      .eq('organization_id', organizationId)

    if (updateError) throw updateError

    await logAudit({
      user_id: user.id,
      organization_id: organizationId,
      action: 'whatsapp.set_instance_role',
      resource: 'evolution_instances',
      resource_id: instance.id,
      details: { instance_name: instanceName, allow_mass: allowMass, previous: instance.allow_mass },
      ip_address: getIpFromRequest(request),
    })

    return NextResponse.json({ success: true, instance_name: instanceName, allow_mass: allowMass })
  } catch (error: unknown) {
    console.error('instance-role PATCH error:', error)
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 })
  }
}
