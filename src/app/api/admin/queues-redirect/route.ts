import { NextResponse } from "next/server"

import { getIpFromRequest, logAudit } from "@/lib/audit"
import { adminErrorResponse, requireMasterAdmin } from "@/lib/admin-security"
import { getBullBoardAvailability } from "@/app/api/admin/queues/bull-board-url"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const admin = await requireMasterAdmin({ recentAuth: true })
    const board = getBullBoardAvailability()
    if (!board.url) {
      return NextResponse.json(
        { error: { code: "BULL_BOARD_UNAVAILABLE", message: "Bull Board não está disponível em modo seguro de somente leitura" } },
        { status: 503, headers: { "Cache-Control": "private, no-store, max-age=0" } },
      )
    }

    await logAudit({
      user_id: admin.userId,
      action: "admin.queues.board_access",
      resource: "bull_board",
      details: { read_only: true },
      outcome: "success",
      ip_address: getIpFromRequest(request),
    })

    const response = NextResponse.redirect(board.url, 307)
    response.headers.set("Cache-Control", "private, no-store, max-age=0")
    response.headers.set("Referrer-Policy", "no-referrer")
    return response
  } catch (error) {
    const response = adminErrorResponse(error)
    response.headers.set("Cache-Control", "private, no-store, max-age=0")
    return response
  }
}
