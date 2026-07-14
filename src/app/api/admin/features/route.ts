import { NextResponse } from "next/server"

import { getIpFromRequest, logAudit } from "@/lib/audit"
import {
  AdminAccessError,
  adminErrorResponse,
  claimAdminAction,
  finishAdminAction,
  protectAdminMutation,
  requireMasterAdmin,
} from "@/lib/admin-security"
import { adminFeaturePatchSchema } from "@/lib/admin-types"
import { supabaseAdmin } from "@/lib/supabase/service-role"

const FEATURE_COLUMNS = "key,name,category,is_enabled,updated_at"
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" }

export async function GET() {
  try {
    await requireMasterAdmin()

    const { data, error } = await supabaseAdmin
      .from("system_features")
      .select(FEATURE_COLUMNS)
      .order("name")

    if (error) throw error

    return NextResponse.json(
      { data: data || [], meta: { total: data?.length || 0, scope: "global" } },
      { headers: NO_STORE_HEADERS },
    )
  } catch (error) {
    return adminErrorResponse(error)
  }
}

export async function PATCH(request: Request) {
  let claimId: string | null = null

  try {
    const admin = await protectAdminMutation(request, { recentAuth: true, limit: 10 })
    const input = adminFeaturePatchSchema.parse(await request.json())

    if (input.confirmation !== `ALTERAR ${input.key}`) {
      return NextResponse.json(
        { error: { code: "ADMIN_CONFIRMATION_MISMATCH", message: "Confirmação inválida" } },
        { status: 400, headers: NO_STORE_HEADERS },
      )
    }

    const { data: currentFeature, error: currentFeatureError } = await supabaseAdmin
      .from("system_features")
      .select(FEATURE_COLUMNS)
      .eq("key", input.key)
      .maybeSingle()

    if (currentFeatureError) throw currentFeatureError
    if (!currentFeature) {
      return NextResponse.json(
        { error: { code: "ADMIN_FEATURE_NOT_FOUND", message: "Recurso global não encontrado" } },
        { status: 404, headers: NO_STORE_HEADERS },
      )
    }

    claimId = await claimAdminAction(admin, input, "admin.feature.update")

    if (currentFeature.is_enabled === input.isEnabled) {
      await finishAdminAction(claimId, "completed")
      await logAudit({
        user_id: admin.userId,
        action: "admin.feature.update",
        resource: "system_features",
        resource_id: input.key,
        details: {
          scope: "global",
          previous_is_enabled: currentFeature.is_enabled,
          is_enabled: input.isEnabled,
          changed: false,
        },
        reason: input.reason,
        correlation_id: input.idempotencyKey,
        outcome: "success",
        ip_address: getIpFromRequest(request),
      })

      return NextResponse.json(
        { data: currentFeature, meta: { scope: "global", changed: false } },
        { headers: NO_STORE_HEADERS },
      )
    }

    const updatedAt = new Date().toISOString()
    const { data: updatedFeature, error: updateError } = await supabaseAdmin
      .from("system_features")
      .update({ is_enabled: input.isEnabled, updated_at: updatedAt })
      .eq("key", input.key)
      .eq("is_enabled", currentFeature.is_enabled)
      .select(FEATURE_COLUMNS)
      .maybeSingle()

    if (updateError) throw updateError
    if (!updatedFeature) {
      throw new AdminAccessError(
        409,
        "ADMIN_FEATURE_STATE_CONFLICT",
        "O recurso foi alterado por outra sessão. Atualize a lista e tente novamente.",
      )
    }

    await finishAdminAction(claimId, "completed")
    await logAudit({
      user_id: admin.userId,
      action: "admin.feature.update",
      resource: "system_features",
      resource_id: input.key,
      details: {
        scope: "global",
        previous_is_enabled: currentFeature.is_enabled,
        is_enabled: updatedFeature.is_enabled,
        changed: true,
      },
      reason: input.reason,
      correlation_id: input.idempotencyKey,
      outcome: "success",
      ip_address: getIpFromRequest(request),
    })

    return NextResponse.json(
      { data: updatedFeature, meta: { scope: "global", changed: true } },
      { headers: NO_STORE_HEADERS },
    )
  } catch (error) {
    if (claimId) await finishAdminAction(claimId, "failed")
    return adminErrorResponse(error)
  }
}
