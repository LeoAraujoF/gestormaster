export type DeletionMembership = {
  organizationId: string
  role: 'owner' | 'admin' | 'member'
}

export function accountDeletionBlockReason(memberships: DeletionMembership[]): string | null {
  return memberships.some((membership) => membership.role === 'owner')
    ? 'OWNER_TRANSFER_REQUIRED'
    : null
}

export function normalizeAccountDeletionLimit(value: number): number {
  if (!Number.isFinite(value)) return 25
  return Math.min(50, Math.max(1, Math.trunc(value)))
}
