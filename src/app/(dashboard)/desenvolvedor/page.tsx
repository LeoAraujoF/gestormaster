"use client"

import { useEffect, useState } from "react"
import { Code, Key, Copy, Plus, Trash2, Eye, ShieldAlert, Check, Terminal } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "sonner"
import { format } from "date-fns"

export default function DesenvolvedorPage() {
  const [keys, setKeys] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [missingTable, setMissingTable] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [newKeyName, setNewKeyName] = useState("")
  const [newlyCreatedToken, setNewlyCreatedToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const fetchKeys = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/developer/keys')
      if (res.ok) {
        const data = await res.json()
        if (data.missingTable) {
          setMissingTable(true)
        } else {
          setKeys(data.keys || [])
        }
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchKeys()
  }, [])

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) {
      toast.error("Dê um nome para identificar esta chave.")
      return
    }

    setIsCreating(true)
    try {
      const res = await fetch('/api/developer/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName })
      })
      const data = await res.json()

      if (res.ok && data.success) {
        setNewlyCreatedToken(data.key.plainToken)
        setNewKeyName("")
        fetchKeys()
        toast.success("Chave de API gerada com sucesso!")
      } else {
        toast.error(data.error || "Erro ao gerar chave.")
      }
    } catch (e) {
      toast.error("Erro interno ao gerar chave.")
    } finally {
      setIsCreating(false)
    }
  }

  const handleDeleteKey = async (id: string) => {
    if (!confirm("Tem certeza que deseja revogar esta chave? Todas as integrações usando ela irão parar de funcionar imediatamente.")) return

    try {
      const res = await fetch(`/api/developer/keys?id=${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success("Chave revogada com sucesso!")
        fetchKeys()
      } else {
        toast.error("Erro ao revogar chave.")
      }
    } catch (e) {
      toast.error("Erro ao revogar chave.")
    }
  }

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success("Copiado para a área de transferência!")
  }

  return (
    <div className="flex flex-col space-y-8 p-4 md:p-8 max-w-6xl mx-auto">
      <div>
        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Code className="w-8 h-8 text-zinc-500" />
          API & Desenvolvedores
        </h2>
        <p className="text-muted-foreground mt-1">Integre o Gestor Master com seus próprios sistemas e fluxos via API REST.</p>
      </div>

      {missingTable && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="text-amber-500 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5" />
              Recurso Indisponível no Momento
            </CardTitle>
            <CardDescription>
              O administrador do sistema ainda não habilitou a tabela `api_keys` no banco de dados. 
              Por favor, entre em contato com o suporte ou crie a tabela caso você seja o administrador.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {newlyCreatedToken && (
        <Card className="border-emerald-500/50 bg-emerald-500/5 shadow-lg animate-in fade-in slide-in-from-top-4">
          <CardHeader>
            <CardTitle className="text-emerald-600 flex items-center gap-2">
              <Key className="w-5 h-5" />
              Sua Nova Chave de API
            </CardTitle>
            <CardDescription className="text-emerald-700/80">
              Por motivos de segurança, esta chave <strong>só será exibida agora</strong>. Guarde-a em um local seguro. Se você a perder, precisará gerar uma nova.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input value={newlyCreatedToken} readOnly className="font-mono text-lg py-6 bg-background border-emerald-500/30 text-emerald-700" />
              <Button onClick={() => handleCopy(newlyCreatedToken)} className="h-auto bg-emerald-600 hover:bg-emerald-700 px-8">
                {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
              </Button>
            </div>
          </CardContent>
          <CardFooter>
            <Button variant="outline" onClick={() => setNewlyCreatedToken(null)} className="w-full text-emerald-700 border-emerald-500/30">
              Eu já copiei e guardei a chave
            </Button>
          </CardFooter>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="flex flex-row justify-between items-start">
              <div>
                <CardTitle>Gerenciar Chaves de API</CardTitle>
                <CardDescription>Crie chaves exclusivas para conectar o N8N, Typebot ou Make.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3 mb-6">
                <Input 
                  placeholder="Nome da integração (ex: Meu N8N)" 
                  value={newKeyName} 
                  onChange={(e) => setNewKeyName(e.target.value)}
                  disabled={missingTable || isCreating}
                  className="max-w-xs"
                />
                <Button onClick={handleCreateKey} disabled={missingTable || isCreating}>
                  {isCreating ? <span className="animate-spin mr-2">⏳</span> : <Plus className="w-4 h-4 mr-2" />}
                  Gerar Nova Chave
                </Button>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome da Chave</TableHead>
                    <TableHead>Prefixo</TableHead>
                    <TableHead>Criada em</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-8">Carregando...</TableCell></TableRow>
                  ) : keys.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Você ainda não tem nenhuma chave gerada.</TableCell></TableRow>
                  ) : (
                    keys.map((key) => (
                      <TableRow key={key.id}>
                        <TableCell className="font-medium">{key.name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-mono">gm_live_••••••</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {format(new Date(key.created_at), "dd/MM/yyyy")}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" className="text-red-500 hover:bg-red-500/10 hover:text-red-600" onClick={() => handleDeleteKey(key.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-sky-500/20 shadow-sm bg-gradient-to-b from-sky-500/5 to-transparent">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sky-600 dark:text-sky-400">
                <Terminal className="w-5 h-5" />
                Como Utilizar
              </CardTitle>
              <CardDescription>Documentação rápida para envio de mensagens via API.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Badge variant="outline" className="bg-sky-500/10 text-sky-600 border-sky-500/20">POST</Badge>
                <code className="text-xs font-mono block break-all text-muted-foreground bg-secondary/50 p-2 rounded border">
                  https://seusistema.com/api/v1/messages/send
                </code>
              </div>
              
              <div className="space-y-2">
                <p className="text-sm font-semibold">Cabeçalhos (Headers):</p>
                <div className="text-xs font-mono bg-secondary/50 p-2 rounded border space-y-1">
                  <div><span className="text-sky-600">Content-Type:</span> application/json</div>
                  <div><span className="text-sky-600">Authorization:</span> Bearer gm_live_...</div>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold">Corpo (JSON):</p>
                <div className="text-xs font-mono bg-secondary/50 p-2 rounded border text-muted-foreground whitespace-pre">
{`{
  "phone": "5511999999999",
  "message": "Olá mundo via API!",
  "instance_id": "opcional_uuid"
}`}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  )
}
