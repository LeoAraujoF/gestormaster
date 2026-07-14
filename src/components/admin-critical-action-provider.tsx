"use client"

import { createContext, useContext, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type CriticalConfirmation = { reason: string; confirmation: string; idempotencyKey: string }
type Options = { title: string; description: string; confirmationText: string }
type Resolver = (value: CriticalConfirmation | null) => void

const Context = createContext<((options: Options) => Promise<CriticalConfirmation | null>) | null>(null)

export function useAdminCriticalAction() {
  const value = useContext(Context)
  if (!value) throw new Error('useAdminCriticalAction requer AdminCriticalActionProvider')
  return value
}

export function AdminCriticalActionProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<Options | null>(null)
  const [resolver, setResolver] = useState<Resolver | null>(null)
  const [password, setPassword] = useState('')
  const [reason, setReason] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const request = (next: Options) => new Promise<CriticalConfirmation | null>((resolve) => {
    setOptions(next); setResolver(() => resolve); setPassword(''); setReason(''); setConfirmation(''); setError('')
  })

  const close = (result: CriticalConfirmation | null) => {
    resolver?.(result); setOptions(null); setResolver(null)
  }

  const confirm = async () => {
    if (!options || reason.trim().length < 5 || confirmation !== options.confirmationText || !password) return
    setSubmitting(true); setError('')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) throw new Error('Sessão inválida')
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: user.email, password })
      if (signInError) throw new Error('Senha incorreta')
      close({ reason: reason.trim(), confirmation, idempotencyKey: crypto.randomUUID() })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível confirmar sua identidade')
    } finally { setSubmitting(false) }
  }

  return <Context.Provider value={request}>
    {children}
    <Dialog open={Boolean(options)} onOpenChange={(open) => !open && close(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{options?.title}</DialogTitle><DialogDescription>{options?.description}</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>Motivo</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Explique por que esta ação é necessária" /></div>
          <div className="space-y-1.5"><Label>Digite {options?.confirmationText}</Label><Input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="off" /></div>
          <div className="space-y-1.5"><Label>Confirme sua senha</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => close(null)}>Cancelar</Button><Button variant="destructive" disabled={submitting || reason.trim().length < 5 || confirmation !== options?.confirmationText || !password} onClick={confirm}>{submitting ? 'Confirmando…' : 'Confirmar ação'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </Context.Provider>
}
