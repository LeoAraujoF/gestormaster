"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DollarSign, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"

interface PixRapidoModalProps {
  children?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

import { useFeatureFlags } from "@/components/providers/feature-flags-provider"

export function PixRapidoModal({ children, open, onOpenChange }: PixRapidoModalProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const { flags } = useFeatureFlags()
  
  const isOpen = open !== undefined ? open : internalOpen
  const setIsOpen = onOpenChange !== undefined ? onOpenChange : setInternalOpen

  const [pixValor, setPixValor] = useState("")
  const [pixDescricao, setPixDescricao] = useState("")
  const [pixTelefone, setPixTelefone] = useState("")
  const [pixInstance, setPixInstance] = useState("")
  const [pixInstances, setPixInstances] = useState<any[]>([])
  const [isGeneratingPix, setIsGeneratingPix] = useState(false)
  const [generatedPix, setGeneratedPix] = useState<{copia_e_cola: string, qr_code_base64: string} | null>(null)
  
  const supabase = createClient()

  useEffect(() => {
    if (isOpen) {
      // Fetch instances when opened
      supabase.from('evolution_instances').select('instance_name').then(({ data }) => {
        if (data && data.length > 0) {
          setPixInstances(data)
          setPixInstance(data[0].instance_name)
        } else {
          setPixInstances([{ instance_name: "Nenhuma" }])
          setPixInstance("Nenhuma")
        }
      })
    }
  }, [isOpen])

  const handleGeneratePix = async () => {
    if (!pixValor || !pixTelefone || !pixInstance) {
      toast.error("Preencha Valor, Telefone e Instância.")
      return
    }

    setIsGeneratingPix(true)
    setGeneratedPix(null)

    try {
      const res = await fetch('/api/pix/gerar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          valor: parseFloat(pixValor.replace(',', '.')),
          descricao: pixDescricao || 'PIX rápido',
          telefone_pagador: pixTelefone,
          instance_name: pixInstance,
          purpose: 'manual',
          expires_minutes: 24 * 60,
        })
      })

      const data = await res.json()
      if (res.ok && data.success) {
        setGeneratedPix({ copia_e_cola: data.copia_e_cola, qr_code_base64: data.qr_code_base64 })
        toast.success("PIX dinâmico gerado! Você será avisado no WhatsApp quando for pago.")
      } else {
        toast.error(data.error || "Erro ao gerar Pix.")
      }
    } catch (e) {
      toast.error("Erro interno ao gerar Pix.")
    } finally {
      setIsGeneratingPix(false)
    }
  }

  const handleCopyPix = () => {
    if (generatedPix) {
      navigator.clipboard.writeText(generatedPix.copia_e_cola)
      toast.success("Copia e Cola copiado!")
    }
  }

  if (flags['action_pix_rapido'] === false) return null

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {open === undefined && (
        <DialogTrigger nativeButton={true} render={
          (children || (
            <Button className="bg-emerald-500 hover:bg-emerald-600 text-white gap-2">
              <DollarSign className="w-4 h-4" /> Gerar Pix Rápido
            </Button>
          )) as React.ReactElement
        } />
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-500" />
            Gerador de Pix Manual
          </DialogTitle>
          <DialogDescription>
            Gere uma cobrança via Mercado Pago e receba o aviso no WhatsApp quando for pago.
          </DialogDescription>
        </DialogHeader>

        {!generatedPix ? (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Valor (R$)</Label>
              <Input type="number" step="0.01" placeholder="50.00" value={pixValor} onChange={e => setPixValor(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Telefone do Cliente (Ex: 5511999999999)</Label>
              <Input placeholder="5511999999999" value={pixTelefone} onChange={e => setPixTelefone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Descrição (Opcional)</Label>
              <Input placeholder="Mensalidade" value={pixDescricao} onChange={e => setPixDescricao(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>WhatsApp Emissor</Label>
              <Select value={pixInstance} onValueChange={(v) => setPixInstance(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a instância" />
                </SelectTrigger>
                <SelectContent>
                  {pixInstances.map(inst => (
                    <SelectItem key={inst.instance_name} value={inst.instance_name}>{inst.instance_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Esta instância enviará a mensagem de confirmação.</p>
            </div>
            <Button className="w-full mt-4" onClick={handleGeneratePix} disabled={isGeneratingPix}>
              {isGeneratingPix ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Gerar Código Pix
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-4 flex flex-col items-center">
            <div className="p-4 bg-white rounded-xl border-4 border-emerald-500/20">
              <img src={`data:image/jpeg;base64,${generatedPix.qr_code_base64}`} alt="QR Code" className="w-48 h-48" />
            </div>
            <div className="w-full space-y-2">
              <Label>Pix Copia e Cola</Label>
              <div className="flex gap-2">
                <Input readOnly value={generatedPix.copia_e_cola} className="font-mono text-xs text-muted-foreground bg-muted" />
                <Button variant="secondary" onClick={handleCopyPix}>Copiar</Button>
              </div>
            </div>
            <Button variant="outline" className="w-full mt-2" onClick={() => setGeneratedPix(null)}>Gerar Outro</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
