"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import { Upload, Download, Search, FileText, Phone, Trash2, UserPlus, Lock, Zap, Loader2, Edit, ChevronLeft, ChevronRight, Play, Square, Settings2, Image as ImageIcon, AlertCircle, CheckCircle2, Info, X, ArrowRight, Columns3, Tag, ListChecks, Wand2, Star, MoreHorizontal, BarChart3, Users } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { phoneMask } from "@/lib/utils"
import { logAuditClient } from "@/lib/audit-client"
import { useRouter } from "next/navigation"
import {
  autoMapColumns,
  applyMapping,
  getCustomFieldKeys,
  SYSTEM_FIELD_LABELS,
  isScientificNotation,
  fixScientificNotation,
  type ColumnMapping,
  type SystemField,
} from "@/lib/column-mapper"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MetricGrid, PageHeader, PageShell } from "@/components/page-layout"

interface Lead {
  id: string
  user_id?: string
  name: string
  phone: string
  email?: string
  status: string
  source?: string
  notes?: string
  custom_fields?: Record<string, string>
  created_at?: string
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [activeTab, setActiveTab] = useState("base")
  const [searchTerm, setSearchTerm] = useState("")
  const [filterStatus, setFilterStatus] = useState("all")
  const [filterSource, setFilterSource] = useState("all")
  const [filterTag, setFilterTag] = useState("all")
  const [filterDate, setFilterDate] = useState("all")
  const [isLoading, setIsLoading] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const [userPlan, setUserPlan] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 50

  const [editingLead, setEditingLead] = useState<Lead | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)

  // -- BULK ACTIONS STATE --
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set())
  const [isBulkTagDialogOpen, setIsBulkTagDialogOpen] = useState(false)
  const [bulkTagInput, setBulkTagInput] = useState("")

  // Smart filters memoized hooks (placed before early returns to satisfy React Rules of Hooks)
  const availableSources = useMemo(() => {
    const sources = new Set(leads.map(l => l.source).filter(Boolean))
    return Array.from(sources) as string[]
  }, [leads])

  const availableTags = useMemo(() => {
    const tags = new Set<string>()
    leads.forEach(l => {
      if (l.custom_fields?.tags) {
        l.custom_fields.tags.split(',').forEach(t => tags.add(t.trim()))
      }
    })
    return Array.from(tags)
  }, [leads])

  const statusCounts = useMemo(() => ({
    all: leads.length,
    novo: leads.filter(l => l.status === 'novo').length,
    concluido: leads.filter(l => l.status === 'concluido').length,
  }), [leads])

  const filteredLeads = leads.filter(l => {
    // Text search
    const matchesSearch = !searchTerm || 
      l.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (l.phone && l.phone.includes(searchTerm)) ||
      (l.email && l.email.toLowerCase().includes(searchTerm.toLowerCase()))
    
    // Status filter
    const matchesStatus = filterStatus === 'all' || l.status === filterStatus
    
    // Source filter
    const matchesSource = filterSource === 'all' || l.source === filterSource
    
    // Tag filter
    const matchesTag = filterTag === 'all' || (l.custom_fields?.tags && l.custom_fields.tags.split(',').map(t => t.trim()).includes(filterTag))
    
    // Date filter
    let matchesDate = true
    if (filterDate !== 'all' && l.created_at) {
      const created = new Date(l.created_at)
      const now = new Date()
      if (filterDate === 'today') {
        matchesDate = created.toDateString() === now.toDateString()
      } else if (filterDate === '7days') {
        matchesDate = (now.getTime() - created.getTime()) <= 7 * 86400000
      } else if (filterDate === '30days') {
        matchesDate = (now.getTime() - created.getTime()) <= 30 * 86400000
      }
    }
    
    return matchesSearch && matchesStatus && matchesSource && matchesTag && matchesDate
  })

  const toggleLeadSelection = (id: string) => {
    const newSet = new Set(selectedLeads)
    if (newSet.has(id)) newSet.delete(id)
    else newSet.add(id)
    setSelectedLeads(newSet)
  }

  const toggleAllLeads = (currentPaginated: Lead[]) => {
    if (selectedLeads.size === currentPaginated.length && currentPaginated.length > 0) {
      setSelectedLeads(new Set())
    } else {
      setSelectedLeads(new Set(currentPaginated.map(l => l.id)))
    }
  }

  const handleBulkDelete = async () => {
    if (selectedLeads.size === 0) return
    setIsLoading(true)
    const supabase = createClient()
    const ids = Array.from(selectedLeads)
    const { error } = await supabase.from('leads').delete().in('id', ids)
    if (!error) {
      logAuditClient({ action: 'lead.bulk_delete', resource: 'leads', details: { count: ids.length } })
      setLeads(prev => prev.filter(l => !selectedLeads.has(l.id)))
      setSelectedLeads(new Set())
      toast.success(`${ids.length} leads removidos.`)
    } else {
      toast.error("Erro ao remover leads.")
    }
    setIsLoading(false)
  }

  const handleBulkAddTag = async () => {
    if (selectedLeads.size === 0 || !bulkTagInput.trim()) return
    setIsLoading(true)
    const supabase = createClient()
    const ids = Array.from(selectedLeads)
    const newTag = bulkTagInput.trim()
    
    let successCount = 0
    for (const id of ids) {
      const lead = leads.find(l => l.id === id)
      if (!lead) continue
      const cf = lead.custom_fields || {}
      let tags = cf.tags ? cf.tags.split(',').map((t: string) => t.trim()) : []
      if (!tags.includes(newTag)) {
        tags.push(newTag)
        const newCf = { ...cf, tags: tags.join(', ') }
        await supabase.from('leads').update({ custom_fields: newCf }).eq('id', id)
        
        setLeads(prev => prev.map(l => l.id === id ? { ...l, custom_fields: newCf } : l))
        successCount++
      }
    }
    
    setIsBulkTagDialogOpen(false)
    setBulkTagInput("")
    setSelectedLeads(new Set())
    toast.success(`Tag "${newTag}" adicionada a ${successCount} leads.`)
    setIsLoading(false)
  }

  // -- CSV MAPPING MODAL STATE --
  const [isMappingModalOpen, setIsMappingModalOpen] = useState(false)
  const [csvRawData, setCsvRawData] = useState<Record<string, string>[]>([])
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([])
  const [mappingWarnings, setMappingWarnings] = useState<string[]>([])

  // -- MASS MESSAGING STATE --
  const [instances, setInstances] = useState<any[]>([])
  const [selectedInstances, setSelectedInstances] = useState<string[]>([])
  const [messageVariants, setMessageVariants] = useState<string[]>(["Olá {{nome}}, tudo bem?\n\nTemos uma novidade para você!"])
  const [activeVariantIndex, setActiveVariantIndex] = useState(0)
  
  // -- AI GENERATOR STATE --
  const [isGeneratingAI, setIsGeneratingAI] = useState(false)
  const [aiContext, setAiContext] = useState("")
  const [isAiModalOpen, setIsAiModalOpen] = useState(false)

  const [mediaBase64, setMediaBase64] = useState<string | null>(null)
  const [mediaMimeType, setMediaMimeType] = useState<string | null>(null)
  const [minDelay, setMinDelay] = useState(15)
  const [maxDelay, setMaxDelay] = useState(30)
  const [pauseCount, setPauseCount] = useState(50)
  const [pauseDuration, setPauseDuration] = useState(5)
  const [messagesPerInstance, setMessagesPerInstance] = useState(10)
  
  const [isSending, setIsSending] = useState(false)
  const [logs, setLogs] = useState<{ id: string, time: string, type: 'success' | 'error' | 'info', message: string }[]>([])
  const abortControllerRef = useRef<AbortController | null>(null)
  const logEndRef = useRef<HTMLDivElement>(null)

  // -- CAMPAIGN MANAGER STATE --
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("")
  const [campaignName, setCampaignName] = useState("")
  const [isSavingCampaign, setIsSavingCampaign] = useState(false)

  // Auto-scroll para o final do terminal de logs
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs])

  // Evita fechamento acidental com F5 quando a campanha estiver rodando
  useEffect(() => {
    if (!isSending) return
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = "Uma campanha de envio está ativa. Se você sair ou atualizar a página, o envio será interrompido!"
      return e.returnValue
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isSending])

  // Sincroniza o estado de disparo com o localStorage para o layout / header
  useEffect(() => {
    localStorage.setItem('wa_campaign_active', isSending ? 'true' : 'false')
    window.dispatchEvent(new Event('wa_campaign_status_changed'))
  }, [isSending])

  const loadCampaigns = async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error && data) {
      setCampaigns(data)
    }
  }

  const handleSaveCampaign = async () => {
    if (!campaignName.trim()) {
      toast.error("Por favor, digite um nome para a campanha.")
      return
    }
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setIsSavingCampaign(true)
    try {
      const payload = {
        user_id: user.id,
        name: campaignName,
        message_template: JSON.stringify(messageVariants),
        selected_instances: selectedInstances
      }

      if (selectedCampaignId && selectedCampaignId !== "new") {
        // Update
        const { error } = await supabase
          .from('campaigns')
          .update(payload)
          .eq('id', selectedCampaignId)

        if (error) throw error
        logAuditClient({ action: 'lead.update', resource: 'leads', details: { lead_name: campaignName } })
        await loadCampaigns()
        toast.success("Campanha atualizada com sucesso!")
      } else {
        // Insert new
        const { data, error } = await supabase
          .from('campaigns')
          .insert(payload)
          .select()
          .single()

        if (error) throw error
        logAuditClient({ action: 'lead.create', resource: 'leads', details: { lead_name: campaignName } })
        await loadCampaigns()
        setSelectedCampaignId(data.id)
        toast.success("Campanha criada e salva com sucesso!")
      }
    } catch (e) {
      toast.error("Erro ao salvar campanha.")
    } finally {
      setIsSavingCampaign(false)
    }
  }

  const handleGenerateAI = async () => {
    if (!aiContext.trim()) {
      toast.error("Por favor, digite o objetivo da campanha.")
      return
    }
    setIsGeneratingAI(true)
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: aiContext, count: 4 })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erro ao gerar.")
      
      if (data.variants && data.variants.length > 0) {
        setMessageVariants(data.variants)
        setActiveVariantIndex(0)
        toast.success(`${data.variants.length} mensagens geradas com sucesso!`)
        setIsAiModalOpen(false)
        setAiContext("")
      }
    } catch (error: any) {
      toast.error(error.message || "Erro de conexão com a Inteligência Artificial.")
    } finally {
      setIsGeneratingAI(false)
    }
  }

  const handleDeleteCampaign = async () => {
    if (!selectedCampaignId || selectedCampaignId === "new") return
    const supabase = createClient()
    try {
      const { error } = await supabase
        .from('campaigns')
        .delete()
        .eq('id', selectedCampaignId)

      if (error) throw error
      logAuditClient({ action: 'campaign.delete', resource: 'campaigns', resource_id: selectedCampaignId })
      toast.success("Campanha excluída!")
      setSelectedCampaignId("")
      setCampaignName("")
      setMessageVariants(["Olá {{nome}}, tudo bem?\n\nTemos uma novidade para você!"])
      setActiveVariantIndex(0)
      setSelectedInstances([])
      await loadCampaigns()
    } catch (e) {
      toast.error("Erro ao excluir campanha.")
    }
  }

  const toggleLeadStatus = async (lead: Lead) => {
    const supabase = createClient()
    const newStatus = lead.status === 'concluido' ? 'novo' : 'concluido'
    
    try {
      const { error } = await supabase
        .from('leads')
        .update({ status: newStatus })
        .eq('id', lead.id)

      if (error) throw error
      logAuditClient({ action: 'lead.status_change', resource: 'leads', resource_id: lead.id, details: { new_status: newStatus } })

      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: newStatus } : l))
      toast.success(newStatus === 'concluido' ? "Lead marcado como Concluído!" : "Lead marcado como Novo!")
    } catch (e) {
      toast.error("Erro ao atualizar status do lead.")
    }
  }

  const getChipCampaignAssignment = (instanceName: string) => {
    // Find any campaign OTHER than the currently selected one that has this chip in selected_instances
    const otherCampaign = campaigns.find(c => 
      c.id !== selectedCampaignId && 
      c.selected_instances?.includes(instanceName)
    )
    return otherCampaign ? otherCampaign.name : null
  }

  // Load selected campaign data
  useEffect(() => {
    if (selectedCampaignId && selectedCampaignId !== "new") {
      const campaign = campaigns.find(c => c.id === selectedCampaignId)
      if (campaign) {
        setCampaignName(campaign.name)
        try {
          const parsed = JSON.parse(campaign.message_template)
          if (Array.isArray(parsed) && parsed.length > 0) setMessageVariants(parsed)
          else setMessageVariants([campaign.message_template || ""])
        } catch(e) {
          setMessageVariants([campaign.message_template || ""])
        }
        setActiveVariantIndex(0)
        setSelectedInstances(campaign.selected_instances || [])
      }
    } else if (selectedCampaignId === "new") {
      setCampaignName("")
      setMessageVariants(["Olá {{nome}}, tudo bem?\n\nTemos uma novidade para você!"])
      setActiveVariantIndex(0)
      setSelectedInstances([])
    }
  }, [selectedCampaignId, campaigns])

  useEffect(() => {
    const checkUserAndFetchLeads = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUserPlan(user.user_metadata?.plan_name || "Desconhecido")
        setUserId(user.id)
        try {
          const res = await fetch('/api/admin/check')
          const data = await res.json()
          setIsAdmin(data.isAdmin)
        } catch (e) {
          setIsAdmin(false)
        }

        const { data: leadsData, error: leadsError } = await supabase
          .from('leads')
          .select('*')
          .order('created_at', { ascending: false })

        if (leadsError) {
          console.error("Error fetching leads:", leadsError)
          if (leadsError.code !== '42P01') {
             toast.error("Erro ao carregar leads. Verifique sua conexão.")
          }
        } else if (leadsData) {
          setLeads(leadsData as Lead[])
        }

        const { data: instData } = await supabase
         .from('evolution_instances')
         .select('*')
         .eq('status', 'connected')
       
        if (instData) {
          setInstances(instData)
          // Auto-select: prefer non-primary chips; only use primary if it's the only one
          const nonPrimary = instData.filter((i: any) => !i.is_primary)
          if (nonPrimary.length > 0) {
            setSelectedInstances([nonPrimary[0].instance_name])
          } else if (instData.length > 0) {
            setSelectedInstances([instData[0].instance_name])
          }
        }

        // Carregar campanhas salvas
        const { data: campaignsData } = await supabase
          .from('campaigns')
          .select('*')
          .order('created_at', { ascending: false })
        if (campaignsData) {
          setCampaigns(campaignsData)
        }
      }
      setIsLoading(false)
    }
    checkUserAndFetchLeads()
  }, [])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm])

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !userId) return

    const Papa = (await import("papaparse")).default
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data as Record<string, string>[]
        
        if (data.length === 0) {
          toast.error("O arquivo CSV parece estar vazio ou num formato inválido.")
          if (fileInputRef.current) fileInputRef.current.value = ""
          return
        }

        // Extrair headers do CSV
        const headers = Object.keys(data[0]).filter(h => h.trim() !== '')

        if (headers.length === 0) {
          toast.error("Nenhuma coluna encontrada no CSV.")
          if (fileInputRef.current) fileInputRef.current.value = ""
          return
        }

        // Auto-mapear colunas usando o dicionário de sinônimos
        const mappings = autoMapColumns(headers)

        // Detectar warnings (notação científica, etc)
        const warnings: string[] = []
        let scientificCount = 0
        const phoneMappings = mappings.filter(m => m.systemField === 'phone')
        for (const pm of phoneMappings) {
          for (const row of data.slice(0, 20)) {
            if (isScientificNotation(row[pm.csvHeader] || '')) {
              scientificCount++
            }
          }
        }
        if (scientificCount > 0) {
          warnings.push(`Detectados telefones em notação científica (ex: 3,2E+10). Serão corrigidos automaticamente.`)
        }

        // Abrir modal de mapeamento
        setCsvRawData(data)
        setCsvHeaders(headers)
        setColumnMappings(mappings)
        setMappingWarnings(warnings)
        setIsMappingModalOpen(true)

        if (fileInputRef.current) fileInputRef.current.value = ""
      },
      error: (error) => {
        toast.error(`Erro ao ler CSV: ${error.message}`)
      }
    })
  }

  const handleConfirmImport = async () => {
    if (!userId || csvRawData.length === 0) return

    setIsMappingModalOpen(false)
    setIsLoading(true)

    // Aplicar mapeamento usando o utilitário
    const { leads: parsedLeads, warnings } = applyMapping(csvRawData, columnMappings, userId)
    
    if (warnings.length > 0) {
      warnings.forEach(w => toast.info(w))
    }

    if (parsedLeads.length > 0) {
      const supabase = createClient()
      
      // Deduplicação contra clientes existentes
      const { data: existingClients, error: clientsError } = await supabase
        .from('clients')
        .select('phone')
        
      let finalLeads = parsedLeads;
      let duplicatedCount = 0;
      
      if (!clientsError && existingClients) {
        const clientPhones = new Set(
          existingClients
            .map(c => c.phone ? c.phone.replace(/\D/g, '') : null)
            .filter(Boolean)
        );
        
        finalLeads = parsedLeads.filter((lead: Record<string, any>) => {
          if (!lead.phone) return true;
          const cleanPhone = lead.phone.replace(/\D/g, '');
          
          const phoneWith55 = cleanPhone.length >= 10 && !cleanPhone.startsWith('55') ? `55${cleanPhone}` : cleanPhone;
          const phoneWithout55 = cleanPhone.startsWith('55') ? cleanPhone.substring(2) : cleanPhone;
          
          if (clientPhones.has(cleanPhone) || clientPhones.has(phoneWith55) || clientPhones.has(phoneWithout55)) {
            duplicatedCount++;
            return false;
          }
          return true;
        });
      }

      if (finalLeads.length > 0) {
        const { data, error } = await supabase
          .from('leads')
          .insert(finalLeads)
          .select()

        if (error) {
          console.error(error)
          toast.error("Erro ao salvar leads. A tabela 'leads' já foi criada no Supabase?")
        } else if (data) {
          logAuditClient({ action: 'lead.bulk_import', resource: 'leads', details: { count: data.length } })
          setLeads(prev => [...data, ...prev])
          if (duplicatedCount > 0) {
            toast.success(`${data.length} leads importados. ${duplicatedCount} ignorados por já serem clientes.`)
          } else {
            toast.success(`${data.length} leads importados com sucesso!`)
          }
        }
      } else {
        toast.info(`Nenhum lead novo importado. Todos os ${duplicatedCount} contatos da planilha já são clientes ativos.`)
      }
    } else {
      toast.error("O arquivo CSV parece estar vazio ou num formato inválido.")
    }
    
    // Limpar estado do modal
    setCsvRawData([])
    setCsvHeaders([])
    setColumnMappings([])
    setMappingWarnings([])
    setIsLoading(false)
  }

  const updateMapping = (index: number, newField: SystemField | 'custom' | 'ignore') => {
    setColumnMappings(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], systemField: newField, confidence: 'high' }
      return updated
    })
  }

  const exportToCSV = async () => {
    if (leads.length === 0) {
      toast.warning("Nenhum lead para exportar.")
      return
    }

    const exportData = leads.map(({ id, user_id, created_at, custom_fields, ...rest }) => ({
      ...rest,
      ...(custom_fields || {})
    }))
    const Papa = (await import("papaparse")).default
    const csv = Papa.unparse(exportData)
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement("a")
    const url = URL.createObjectURL(blob)
    link.setAttribute("href", url)
    link.setAttribute("download", `leads_export_${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success("Arquivo exportado com sucesso!")
  }

  const deleteLead = async (id: string) => {
    const supabase = createClient()
    const { error } = await supabase.from('leads').delete().eq('id', id)
    if (error) {
      toast.error("Erro ao remover lead.")
    } else {
      logAuditClient({ action: 'lead.delete', resource: 'leads', resource_id: id })
      setLeads(prev => prev.filter(l => l.id !== id))
      toast.success("Lead removido.")
    }
  }

  const clearAll = async () => {
    if (!userId) return
    setIsLoading(true)
    const supabase = createClient()
    const { error } = await supabase.from('leads').delete().eq('user_id', userId)
    if (error) {
      toast.error("Erro ao limpar lista.")
    } else {
      logAuditClient({ action: 'lead.delete_all', resource: 'leads' })
      setLeads([])
      toast.success("Todos os leads foram removidos.")
    }
    setIsLoading(false)
  }

  const handleSaveEdit = async () => {
    if (!editingLead || !editingLead.id) return
    const supabase = createClient()
    const { id, user_id, created_at, ...updates } = editingLead
    
    const { error } = await supabase.from('leads').update(updates).eq('id', id)
    if (error) {
      toast.error("Erro ao atualizar lead.")
    } else {
      logAuditClient({ action: 'lead.update', resource: 'leads', resource_id: id, details: { lead_name: editingLead.name } })
      setLeads(prev => prev.map(l => l.id === id ? editingLead : l))
      toast.success("Lead atualizado com sucesso!")
      setIsEditDialogOpen(false)
    }
  }

  const getWhatsAppLink = (phone: string) => {
    let cleanPhone = phone.replace(/\D/g, '')
    if (cleanPhone.length >= 10 && cleanPhone.length <= 11 && !cleanPhone.startsWith('55')) {
      cleanPhone = '55' + cleanPhone
    }
    return `https://wa.me/${cleanPhone}`
  }

  const convertToClient = () => {
    toast.info("A função de conversão para clientes (separada dos leads) estará disponível em breve.")
  }

  // --- MASS MESSAGING LOGIC ---
  const handleMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    if (file.size > 5 * 1024 * 1024) {
      toast.error("O arquivo deve ter no máximo 5MB.")
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      setMediaBase64(event.target?.result as string)
      setMediaMimeType(file.type)
    }
    reader.readAsDataURL(file)
  }

  const removeMedia = () => {
    setMediaBase64(null)
    setMediaMimeType(null)
    if (mediaInputRef.current) mediaInputRef.current.value = ""
  }

  const addLog = (type: 'success' | 'error' | 'info', message: string) => {
    setLogs(prev => [{ id: Date.now().toString() + Math.random().toString(), time: new Date().toLocaleTimeString('pt-BR'), type, message }, ...prev])
  }

  const applySpintax = (text: string) => {
    let result = text
    const spintaxRegex = /\{([^{}]*)\}/
    while (spintaxRegex.test(result)) {
      result = result.replace(spintaxRegex, (match, contents) => {
        const choices = contents.split('|')
        return choices[Math.floor(Math.random() * choices.length)]
      })
    }
    return result
  }

  const parseMessage = (template: string, lead: Lead) => {
    let msg = template
    msg = applySpintax(msg)
    msg = msg.replace(/{{nome}}/g, lead.name.split(' ')[0] || 'Amigo(a)')
    msg = msg.replace(/{{nome_completo}}/g, lead.name || 'Amigo(a)')
    msg = msg.replace(/{{email}}/g, lead.email || '')
    msg = msg.replace(/{{telefone}}/g, lead.phone || '')
    
    // Variáveis dinâmicas dos custom_fields
    if (lead.custom_fields) {
      for (const [key, value] of Object.entries(lead.custom_fields)) {
        const regex = new RegExp(`{{${key}}}`, 'g')
        msg = msg.replace(regex, value || '')
      }
    }
    return msg
  }

  // Coletar todas as chaves de custom_fields disponíveis para uso em templates
  const availableCustomKeys = useMemo(() => getCustomFieldKeys(leads), [leads])

  const getRandomDelay = () => {
    return Math.floor(Math.random() * (maxDelay - minDelay + 1) + minDelay) * 1000
  }

  const startMassMessage = async () => {
    if (filteredLeads.length === 0) {
      toast.error("Você não tem leads filtrados para enviar mensagens.")
      return
    }
    if (selectedInstances.length === 0) {
      toast.error("Selecione pelo menos uma instância do WhatsApp.")
      return
    }
    const currentPlan = userPlan?.toLowerCase() || ''
    const maxAllowed = currentPlan === 'pro' ? 2 : currentPlan === 'plus' ? 3 : 999
    if (!isAdmin && selectedInstances.length > maxAllowed) {
      toast.error(`Seu plano ${userPlan} permite selecionar no máximo ${maxAllowed} chips para a roleta da campanha.`)
      return
    }
    if (!messageVariants[0]?.trim() && !mediaBase64) {
      toast.error("Adicione uma mensagem ou uma imagem.")
      return
    }

    setIsSending(true)
    setLogs([])
    addLog('info', `Iniciando campanha para ${filteredLeads.length} leads filtrados...`)
    
    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    let successCount = 0
    let errorCount = 0
    let sentCount = 0

    for (let i = 0; i < filteredLeads.length; i++) {
      if (signal.aborted) {
        addLog('info', 'Campanha interrompida pelo usuário.')
        break
      }

      const lead = filteredLeads[i]
      if (lead.status === 'concluido' || lead.status === 'concluído') {
        addLog('info', `Ignorado: ${lead.name} (Concluído)`)
        continue
      }
      if (!lead.phone || lead.phone.length < 8) {
        addLog('error', `Ignorado: ${lead.name} (Telefone inválido)`)
        continue
      }

      let phone = lead.phone.replace(/\D/g, '')
      if (phone.length >= 10 && phone.length <= 11 && !phone.startsWith('55')) {
        phone = '55' + phone
      }

      const instanceIndex = Math.floor(i / messagesPerInstance) % selectedInstances.length
      const instance = selectedInstances[instanceIndex]
      const randomVariant = messageVariants[Math.floor(Math.random() * messageVariants.length)] || ""
      const finalMessage = parseMessage(randomVariant, lead)

      addLog('info', `Enviando para ${lead.name} (${phone}) via ${instance}...`)

      try {
        const req = await fetch('/api/evolution/send-single', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instanceName: instance,
            phone: phone,
            message: finalMessage,
            mediaBase64: mediaBase64,
            mediaMimeType: mediaMimeType
          }),
          signal
        })

        const res = await req.json()
        if (!req.ok || res.error) {
          addLog('error', `Falha ao enviar para ${lead.name}: ${res.error || 'Erro desconhecido'}`)
          errorCount++
        } else {
          addLog('success', `Mensagem enviada para ${lead.name}!`)
          successCount++
          sentCount++
          
          // Auto-mark lead as concluido
          const supabaseClient = createClient()
          await supabaseClient.from('leads').update({ status: 'concluido' }).eq('id', lead.id)
          setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: 'concluido' } : l))
        }
      } catch (err) {
        const error = err as Error
        if (error.name === 'AbortError') {
          addLog('info', 'Campanha abortada.')
          break
        }
        addLog('error', `Erro de conexão ao enviar para ${lead.name}.`)
        errorCount++
      }

      // Check pause
      if (sentCount > 0 && sentCount % pauseCount === 0 && i < leads.length - 1) {
        addLog('info', `Pausa de segurança (Anti-ban). Aguardando ${pauseDuration} minutos...`)
        try {
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(resolve, pauseDuration * 60 * 1000)
            signal.addEventListener('abort', () => {
              clearTimeout(timeout)
              reject(new Error('AbortError'))
            })
          })
        } catch (e) {
          if (signal.aborted) break
        }
      } 
      // Normal delay between messages
      else if (i < leads.length - 1) {
        const delay = getRandomDelay()
        addLog('info', `Aguardando ${delay/1000}s (Delay Aleatório)...`)
        try {
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(resolve, delay)
            signal.addEventListener('abort', () => {
              clearTimeout(timeout)
              reject(new Error('AbortError'))
            })
          })
        } catch (e) {
          if (signal.aborted) break
        }
      }
    }

    if (!signal.aborted) {
      addLog('info', `Processo finalizado. Sucessos: ${successCount} | Erros: ${errorCount}`)
    }
    
    setIsSending(false)
    abortControllerRef.current = null
  }

  const stopMassMessage = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      setIsSending(false)
    }
  }
  // --- END MASS MESSAGING LOGIC ---

  if (isLoading || isAdmin === null || userPlan === null) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-muted-foreground animate-pulse">Carregando dados...</p>
      </div>
    )
  }

  if (userPlan === "Lite" && !isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4 max-w-md mx-auto text-center animate-in fade-in slide-in-from-bottom-4">
        <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-2">
          <Lock className="w-10 h-10 text-slate-400" />
        </div>
        <h2 className="text-2xl font-bold">Gestão de Leads Bloqueada</h2>
        <p className="text-muted-foreground">
          A ferramenta de gestão, extração de Leads e disparos em massa é um recurso exclusivo dos planos <strong>Pro e Plus</strong>.
        </p>
        <Button className="mt-4 bg-sky-500 hover:bg-sky-600 text-white" onClick={() => router.push('/minha-conta')}>
          <Zap className="w-4 h-4 mr-2" />
          Fazer Upgrade
        </Button>
      </div>
    )
  }




  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / itemsPerPage))
  const paginatedLeads = filteredLeads.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  return (
    <PageShell className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="rounded-xl border bg-card p-5 sm:p-6">
        <PageHeader
          eyebrow="Aquisição e relacionamento"
          title="Gestão de Leads"
          description="Encontre quem precisa de atenção, organize sua base e transforme contatos em próximas ações claras."
          badge={`${statusCounts.novo} novos`}
          actions={<>
          <input 
            type="file" 
            accept=".csv" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            disabled={isLoading || isSending}
          />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isLoading || isSending}>
            {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            Importar CSV
          </Button>
          <Button onClick={exportToCSV} disabled={isSending}>
            <Download className="w-4 h-4 mr-2" />
            Exportar
          </Button>
          </>}
        />
      </div>

      {/* Mini-Dashboard Premium */}
      <MetricGrid columns={3}>
        <Card className="border-sky-500/20 bg-sky-500/[0.06] shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 bg-primary/10 rounded-xl text-primary">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total de Leads</p>
              <h3 className="text-2xl font-bold">{leads.length}</h3>
            </div>
          </CardContent>
        </Card>
        <Card className="border-amber-500/20 bg-amber-500/[0.05] shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 bg-amber-500/10 rounded-xl text-amber-500">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Novos Leads</p>
              <h3 className="text-2xl font-bold">{statusCounts.novo}</h3>
            </div>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/20 bg-emerald-500/[0.05] shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-500">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Concluídos</p>
              <h3 className="text-2xl font-bold">{statusCounts.concluido}</h3>
            </div>
          </CardContent>
        </Card>
      </MetricGrid>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-4 h-auto w-full justify-start rounded-xl border bg-card p-1 sm:w-auto">
          <TabsTrigger className="min-h-10 flex-1 px-5 sm:flex-none" value="base" disabled={isSending}>Base de Contatos</TabsTrigger>
          <TabsTrigger className="min-h-10 flex-1 px-5 sm:flex-none" value="disparo">Campanha</TabsTrigger>
        </TabsList>

        <TabsContent value="base" className="space-y-4 mt-0">
  <div className="flex flex-col xl:flex-row gap-6 items-start">
    <div className="flex-[1.5] min-w-0 w-full space-y-4">

          <Card className="glass-card">
            <CardHeader className="pb-4">
              <div className="flex flex-col gap-4">
                <div>
                  <CardTitle>Base de Contatos</CardTitle>
                  <CardDescription>
                    Gerencie, filtre e execute ações em lote nos seus leads.
                  </CardDescription>
                </div>
                
                {/* Unified Toolbar */}
                <div className="flex flex-col sm:flex-row gap-4 mt-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por nome, telefone ou e-mail..."
                      className="pl-9 bg-background/50"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  
                  <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v ?? "all")}>
                    <SelectTrigger className="w-full sm:w-[150px] bg-background/50">
                      <SelectValue placeholder="Status">
                        {filterStatus === 'all' ? 'Todos Status' : 
                         filterStatus === 'novo' ? 'Novos' : 'Concluídos'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos Status</SelectItem>
                      <SelectItem value="novo">Novos ({statusCounts.novo})</SelectItem>
                      <SelectItem value="concluido">Concluídos ({statusCounts.concluido})</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={filterDate} onValueChange={(v) => setFilterDate(v ?? "all")}>
                    <SelectTrigger className="w-full sm:w-[150px] bg-background/50">
                      <SelectValue placeholder="Período">
                         {filterDate === 'all' ? 'Todos Períodos' : filterDate === 'today' ? 'Hoje' : filterDate === '7days' ? '7 dias' : '30 dias'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos Períodos</SelectItem>
                      <SelectItem value="today">Importados Hoje</SelectItem>
                      <SelectItem value="7days">Últimos 7 dias</SelectItem>
                      <SelectItem value="30days">Últimos 30 dias</SelectItem>
                    </SelectContent>
                  </Select>

                  {availableSources.length > 1 && (
                    <Select value={filterSource} onValueChange={(v) => setFilterSource(v ?? "all")}>
                      <SelectTrigger className="w-full sm:w-[150px] bg-background/50">
                        <SelectValue placeholder="Origem">
                           {filterSource === 'all' ? 'Todas Origens' : filterSource}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas Origens</SelectItem>
                        {availableSources.map(s => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {availableTags.length > 0 && (
                    <Select value={filterTag} onValueChange={(v) => setFilterTag(v ?? "all")}>
                      <SelectTrigger className="w-full sm:w-[150px] bg-background/50">
                        <SelectValue placeholder="Tag">
                          {filterTag === 'all' ? 'Todas Tags' : filterTag}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas Tags</SelectItem>
                        {availableTags.map(t => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {(filterStatus !== 'all' || filterDate !== 'all' || filterSource !== 'all' || filterTag !== 'all') && (
                    <Button 
                      variant="ghost" 
                      className="px-3 text-muted-foreground hover:text-destructive" 
                      onClick={() => { setFilterStatus('all'); setFilterDate('all'); setFilterSource('all'); setFilterTag('all') }}
                    >
                      <X className="w-4 h-4 mr-2" /> Limpar
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Toolbar de Ações em Lote */}
              {selectedLeads.size > 0 && (
                <div className="flex items-center justify-between p-3 mb-4 bg-primary/5 border border-primary/20 rounded-lg animate-in slide-in-from-top-2">
                  <div className="flex items-center gap-2">
                    <ListChecks className="w-5 h-5 text-primary" />
                    <span className="font-medium text-sm">{selectedLeads.size} leads selecionados</span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setIsBulkTagDialogOpen(true)}>
                      <Tag className="w-4 h-4 mr-2" /> Adicionar Tag
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}>
                        <Trash2 className="w-4 h-4 mr-2" /> Excluir
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir Leads Selecionados</AlertDialogTitle>
                          <AlertDialogDescription>
                            Tem certeza que deseja excluir {selectedLeads.size} leads? Esta ação não pode ser desfeita.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground">Excluir</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              )}

              {leads.length === 0 ? (
                <div className="text-center py-16 px-4">
                  <div className="w-16 h-16 rounded-full bg-sky-500/10 flex items-center justify-center mx-auto mb-4">
                    <FileText className="w-8 h-8 text-sky-500" />
                  </div>
                  <h3 className="text-lg font-medium">Sua lista está vazia</h3>
                  <p className="text-muted-foreground max-w-sm mx-auto mt-2">
                    Importe uma planilha CSV do Excel ou Google Sheets para começar a prospectar clientes.
                  </p>
                  <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="mt-4">
                    Carregar Arquivo CSV
                  </Button>
                </div>
              ) : (
                <>
                  <div className="rounded-md border border-border/50 overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-muted/50">
                        <TableRow>
                          <TableHead className="w-[40px]">
                            <Checkbox 
                              checked={paginatedLeads.length > 0 && selectedLeads.size === paginatedLeads.length}
                              onCheckedChange={() => toggleAllLeads(paginatedLeads)}
                            />
                          </TableHead>
                          <TableHead>Nome</TableHead>
                          <TableHead>Contato</TableHead>
                          <TableHead>Status / Origem</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                  {paginatedLeads.map((lead) => (
                    <TableRow key={lead.id} className={selectedLeads.has(lead.id) ? "bg-muted/50" : ""}>
                      <TableCell className="pl-4">
                        <Checkbox 
                          checked={selectedLeads.has(lead.id)}
                          onCheckedChange={() => toggleLeadSelection(lead.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-[13px] font-semibold text-foreground leading-tight">{lead.name}</span>
                          <button
                            onClick={() => { if(lead.phone) { navigator.clipboard.writeText(lead.phone); toast.success("Telefone copiado!"); } }}
                            className="num block text-[11px] text-muted-foreground hover:text-foreground text-left mt-0.5"
                            title="Clique para copiar"
                          >
                            {lead.phone ? phoneMask(lead.phone) : 'sem telefone'}
                          </button>
                        </div>
                      </TableCell>
                      <TableCell className="text-[13px] text-muted-foreground hidden sm:table-cell">{lead.source || '—'}</TableCell>
                      <TableCell className="num hidden whitespace-nowrap text-[12px] text-muted-foreground md:table-cell">
                        {(() => {
                          if (!lead.created_at) return '—'
                          const diff = Date.now() - new Date(lead.created_at).getTime()
                          const h = Math.floor(diff / 3600000)
                          const days = Math.floor(diff / 86400000)
                          return h < 1 ? 'agora' : h < 24 ? `há ${h} h` : days === 1 ? 'ontem' : `há ${days} dias`
                        })()}
                      </TableCell>
                      <TableCell>
                        <span 
                          onClick={() => toggleLeadStatus(lead)}
                          className={`cursor-pointer inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                            lead.status === 'concluido' 
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25' 
                              : lead.status === 'teste' 
                                ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 hover:bg-blue-500/25'
                                : 'bg-orange-500/15 text-orange-600 dark:text-orange-400 hover:bg-orange-500/25'
                          }`}
                        >
                          {lead.status === 'concluido' ? 'Convertido' : lead.status === 'teste' ? 'Teste' : 'Contato'}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                    </Table>
                  </div>

                  <div className="flex items-center justify-between mt-4">
                    <div className="text-sm text-muted-foreground">
                      Mostrando {((currentPage - 1) * itemsPerPage) + 1} até {Math.min(currentPage * itemsPerPage, filteredLeads.length)} de {filteredLeads.length} leads
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 flex justify-end">
                    <AlertDialog>
                      <AlertDialogTrigger render={<Button variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" />}>
                        <Trash2 className="w-4 h-4 mr-2" />
                        Apagar Toda a Lista
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Tem absoluta certeza?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta ação não pode ser desfeita. Isso apagará permanentemente todos os leads da sua base.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={clearAll} className="bg-destructive hover:bg-destructive/90">Apagar Tudo</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        
    </div>
    
    {/* COLUNA DIREITA: Campanha em Andamento */}
    <div className="flex-1 min-w-0 w-full space-y-4 sticky top-6">
      <Card className="border-border">
        <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-[15px]">Campanha em andamento</CardTitle>
              <CardDescription className="text-xs mt-1">
                {selectedCampaignId && selectedCampaignId !== "new" ? campaignName : "Nova campanha"}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          {isSending ? (
            <>
              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px] font-medium text-muted-foreground">
                  <span>Enviadas</span>
                  <span className="num font-semibold text-foreground">{logs.filter(l => l.type==="success").length} / {selectedLeads.size || filteredLeads.length}</span>
                </div>
                <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${Math.min((logs.filter(l => l.type==="success").length / (selectedLeads.size || filteredLeads.length || 1)) * 100, 100)}%` }}></div>
                </div>
              </div>
              
              <div className="space-y-2 pt-2">
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Entregues</span>
                  <span className="text-emerald-500 font-medium num">{logs.filter(l => l.type==="success").length}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Respostas</span>
                  <span className="text-blue-500 font-medium num">0</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Falhas</span>
                  <span className="text-red-500 font-medium num">{logs.filter(l => l.type==="error").length}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Intervalo</span>
                  <span className="num font-medium">{minDelay}-{maxDelay} s</span>
                </div>
              </div>
              
              <div className="flex gap-3 pt-4 border-t border-border/50">
                 <Button variant="outline" className="flex-1 text-[11px] h-8" onClick={() => {}}>Pausar</Button>
                 <Button variant="outline" className="flex-1 text-[11px] h-8 text-danger hover:text-danger hover:bg-danger/10" onClick={() => { if(abortControllerRef.current) abortControllerRef.current.abort(); setIsSending(false) }}>Cancelar</Button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 text-center space-y-3">
              <div className="w-12 h-12 bg-secondary rounded-full flex items-center justify-center text-muted-foreground">
                <Play className="w-5 h-5 ml-1" />
              </div>
              <div>
                <p className="text-sm font-medium">Nenhuma campanha ativa</p>
                <p className="text-xs text-muted-foreground mt-1">Configure o disparo em massa para os seus leads na aba Campanha.</p>
              </div>
              <div className="flex gap-2 w-full mt-2 px-4">
                  <Button onClick={() => setActiveTab("disparo")} variant="outline" className="flex-1 text-xs">
                    Configurar
                  </Button>
                  <Button onClick={startMassMessage} className="flex-1 text-xs bg-primary text-primary-foreground" disabled={filteredLeads.length === 0 || instances.length === 0}>
                    <Play className="w-3.5 h-3.5 mr-1" /> Iniciar
                  </Button>
                </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  </div>
</TabsContent>

        <TabsContent value="disparo">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Esquerda: Configurações */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Audience Summary Card */}
              <Card className="bg-muted/20 border-border/40 shadow-none animate-in fade-in zoom-in-95">
                <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-primary/10 rounded-lg text-primary">
                      <Users className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Público-Alvo da Campanha</p>
                      <h3 className="text-xl font-bold">{filteredLeads.length} Leads</h3>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 text-xs text-muted-foreground bg-background/50 p-2.5 rounded-lg border border-border/50">
                    <div className="flex items-center gap-1.5"><strong className="text-foreground">Filtros Ativos:</strong></div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                      <span>Status: <span className="text-foreground font-medium">{filterStatus === 'all' ? 'Todos' : filterStatus === 'novo' ? 'Novos' : 'Concluídos'}</span></span>
                      <span>Período: <span className="text-foreground font-medium">{filterDate === 'all' ? 'Todos' : filterDate === 'today' ? 'Hoje' : filterDate === '7days' ? '7 dias' : '30 dias'}</span></span>
                      {filterSource !== 'all' && <span>Origem: <span className="text-foreground font-medium">{filterSource}</span></span>}
                      {filterTag !== 'all' && <span>Tag: <span className="text-foreground font-medium">{filterTag}</span></span>}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card border-primary/20">
                <CardHeader>
                  <CardTitle className="text-primary flex items-center gap-2">
                    <Settings2 className="w-5 h-5" />
                    Configurações da Campanha
                  </CardTitle>
                  <CardDescription>Configure a mensagem e as imagens para disparar aos {filteredLeads.length} leads selecionados no filtro.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  
                  {/* Gerenciador de Campanhas Salvas */}
                  <div className="p-4 bg-transparent space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div className="space-y-1">
                        <Label className="text-sm font-semibold">Campanha Ativa / Modelo</Label>
                        <p className="text-xs text-muted-foreground font-medium">Selecione ou salve um modelo de campanha.</p>
                      </div>
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <Select value={selectedCampaignId} onValueChange={(val) => setSelectedCampaignId(val || "")}>
                          <SelectTrigger className="w-full sm:w-[220px] bg-background/80 h-9">
                            <SelectValue placeholder="Nova Campanha...">
                              {selectedCampaignId === 'new' || !selectedCampaignId 
                                ? 'Nova Campanha...' 
                                : `📁 ${campaigns.find(c => c.id === selectedCampaignId)?.name || 'Campanha'}`}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="new">🆕 Nova Campanha (Criar)</SelectItem>
                            {campaigns.map(c => (
                              <SelectItem key={c.id} value={c.id}>📁 {c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                      <div className="sm:col-span-2 space-y-2">
                        <Label htmlFor="campaign-name" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nome da Campanha</Label>
                        <Input 
                          id="campaign-name" 
                          placeholder="Ex: Campanha de Vendas de Junho" 
                          value={campaignName}
                          onChange={(e) => setCampaignName(e.target.value)}
                          className="bg-background/80 h-9"
                          disabled={isSending}
                        />
                      </div>
                      <div className="flex gap-2 w-full">
                        <Button 
                          type="button" 
                          onClick={handleSaveCampaign} 
                          disabled={isSending || isSavingCampaign}
                          className="flex-1 h-9"
                          size="sm"
                        >
                          {isSavingCampaign ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar'}
                        </Button>
                        {selectedCampaignId && selectedCampaignId !== "new" && (
                          <Button 
                            type="button" 
                            variant="outline"
                            onClick={handleDeleteCampaign}
                            disabled={isSending}
                            className="h-9 border-destructive/30 hover:bg-destructive/10 text-destructive"
                            size="sm"
                          >
                            Excluir
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Instâncias */}
                  <div className="space-y-3">
                    <Label className="text-base font-semibold">Chips para Envio (Roleta)</Label>
                    <p className="text-sm text-muted-foreground font-medium">Selecione quais números serão usados na roleta. Um chip associado a outra campanha fica indisponível.</p>
                    
                    {instances.length === 0 ? (
                      <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-md flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        Nenhuma instância conectada. Conecte um chip na aba Automação.
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3 mt-2">
                        {instances.filter(i => i.is_primary && !instances.some(other => !other.is_primary && !getChipCampaignAssignment(other.instance_name))).length > 0 && (
                           <div className="p-3 bg-amber-500/10 text-amber-600 dark:text-amber-500 text-xs rounded-md flex items-start gap-2 border border-amber-500/20">
                             <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                             <p>
                               <strong>Aviso:</strong> Você só tem o seu número Principal disponível. Campanhas em massa possuem alto risco de banimento. É fortemente recomendado conectar chips extras na aba Automação para esta função.
                             </p>
                           </div>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {instances.map(inst => {
                            const assignedCampaign = getChipCampaignAssignment(inst.instance_name)
                            const hasOtherAvailableInstances = instances.some(i => !i.is_primary && !getChipCampaignAssignment(i.instance_name))
                            
                            const isUnavailable = !!assignedCampaign
                            const isBlockedPrimary = inst.is_primary && hasOtherAvailableInstances

                            return (
                              <div key={inst.id} className={`flex items-center space-x-3 border p-3 rounded-xl transition-all ${isUnavailable || isBlockedPrimary ? 'opacity-50 bg-muted/20 border-border/50' : selectedInstances.includes(inst.instance_name) ? 'bg-primary/5 border-primary/40 shadow-[0_0_15px_rgba(var(--primary),0.1)]' : 'border-border/50 hover:border-primary/30 hover:bg-muted/30 cursor-pointer'}`}>
                                <Checkbox 
                                  id={`inst-${inst.id}`} 
                                  checked={selectedInstances.includes(inst.instance_name)}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      const currentPlan = userPlan?.toLowerCase() || ''
                                      const maxAllowed = currentPlan === 'pro' ? 2 : currentPlan === 'plus' ? 3 : 999
                                      if (!isAdmin && selectedInstances.length >= maxAllowed) {
                                        toast.error(`Seu plano ${userPlan} permite selecionar no máximo ${maxAllowed} chips simultâneos para a roleta da campanha.`)
                                        return
                                      }
                                      setSelectedInstances(prev => [...prev, inst.instance_name])
                                    } else {
                                      setSelectedInstances(prev => prev.filter(name => name !== inst.instance_name))
                                    }
                                  }}
                                  disabled={isSending || isUnavailable || isBlockedPrimary}
                                  className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                />
                                <Label htmlFor={`inst-${inst.id}`} className="flex-1 cursor-pointer flex flex-col gap-0.5">
                                  <span className="flex items-center gap-1.5 font-medium text-sm">
                                    {inst.instance_name} 
                                    {inst.is_primary && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />}
                                  </span>
                                  {inst.phone_number && (
                                    <span className="text-xs text-muted-foreground font-normal mb-0.5">
                                      {phoneMask(inst.phone_number)}
                                    </span>
                                  )}
                                  {isUnavailable && (
                                    <span className="text-[10px] text-amber-500 font-medium">
                                      Em uso: {assignedCampaign}
                                    </span>
                                  )}
                                  {isBlockedPrimary && !isUnavailable && (
                                    <span className="text-[10px] text-red-500 dark:text-red-400 font-medium">
                                      Use chips secundários
                                    </span>
                                  )}
                                </Label>
                                <Badge variant="outline" className={`${isUnavailable ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : isBlockedPrimary ? 'bg-red-500/10 text-red-500 dark:text-red-400 border-red-500/20' : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'} border font-medium text-[10px] px-2 py-0.5`}>
                                  {isUnavailable ? 'Em Uso' : isBlockedPrimary ? 'Bloqueado' : 'Pronto'}
                                </Badge>
                              </div>
                            )
                        })}
                      </div>
                    </div>
                    )}
                  </div>

                  {/* Mensagem e Mídia */}
                  <div className="space-y-4">
                    <Label className="text-base font-semibold">Mensagem</Label>
                    
                    <div className="space-y-2">
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap gap-2 mb-1 justify-between items-center">
                          <div className="flex flex-wrap gap-2">
                            {messageVariants.map((_, idx) => (
                            <Button 
                              key={idx} 
                              variant={activeVariantIndex === idx ? "default" : "outline"}
                              size="sm"
                              className="h-7 text-xs relative pr-7"
                              onClick={() => setActiveVariantIndex(idx)}
                            >
                              Variante {idx + 1}
                              {messageVariants.length > 1 && (
                                <span 
                                  className="absolute right-1.5 p-1 cursor-pointer z-10 rounded-full hover:bg-destructive/10 group-hover:text-destructive"
                                  onClick={(e) => { 
                                    e.stopPropagation()
                                    e.preventDefault()
                                    if(isSending) return
                                    const newV = [...messageVariants]
                                    newV.splice(idx, 1)
                                    setMessageVariants(newV)
                                    if (activeVariantIndex >= newV.length) {
                                      setActiveVariantIndex(Math.max(0, newV.length - 1))
                                    } else if (activeVariantIndex === idx) {
                                      setActiveVariantIndex(Math.max(0, idx - 1))
                                    } else if (activeVariantIndex > idx) {
                                      setActiveVariantIndex(activeVariantIndex - 1)
                                    }
                                  }}
                                >
                                  <X className="w-3 h-3 opacity-70 hover:opacity-100 text-muted-foreground hover:text-destructive" />
                                </span>
                              )}
                            </Button>
                          ))}
                          {messageVariants.length < 5 && (
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => {
                              if(isSending) return
                              setMessageVariants(p => [...p, "Nova variação de mensagem..."])
                              setActiveVariantIndex(messageVariants.length)
                            }}>+ Variante</Button>
                          )}
                          </div>
                          <Button 
                            variant="default" 
                            size="sm" 
                            className="h-7 text-xs bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white border-0 shadow-sm"
                            onClick={() => {
                              setAiContext(campaignName || "Oferecer um desconto especial")
                              setIsAiModalOpen(true)
                            }}
                            disabled={isSending}
                          >
                            <Wand2 className="w-3 h-3 mr-1.5" />
                            Gerar com IA
                          </Button>
                        </div>
                        <Textarea 
                          placeholder="Digite sua mensagem de captação..." 
                          className="min-h-[150px] bg-background/50 resize-y"
                          value={messageVariants[activeVariantIndex] || ""}
                          onChange={(e) => {
                            const newV = [...messageVariants]
                            newV[activeVariantIndex] = e.target.value
                            setMessageVariants(newV)
                          }}
                          disabled={isSending}
                        />
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline" className="cursor-pointer hover:bg-muted" onClick={() => {
                            if(isSending) return
                            const newV = [...messageVariants]
                            newV[activeVariantIndex] += ' {{nome}}'
                            setMessageVariants(newV)
                          }}>{"{{nome}}"}</Badge>
                          <Badge variant="outline" className="cursor-pointer hover:bg-muted" onClick={() => {
                            if(isSending) return
                            const newV = [...messageVariants]
                            newV[activeVariantIndex] += ' {{nome_completo}}'
                            setMessageVariants(newV)
                          }}>{"{{nome_completo}}"}</Badge>
                          <Badge variant="outline" className="cursor-pointer hover:bg-muted" onClick={() => {
                            if(isSending) return
                            const newV = [...messageVariants]
                            newV[activeVariantIndex] += ' {{email}}'
                            setMessageVariants(newV)
                          }}>{"{{email}}"}</Badge>
                          <Badge variant="outline" className="cursor-pointer hover:bg-muted" onClick={() => {
                            if(isSending) return
                            const newV = [...messageVariants]
                            newV[activeVariantIndex] += ' {{telefone}}'
                            setMessageVariants(newV)
                          }}>{"{{telefone}}"}</Badge>
                          {availableCustomKeys.map(key => (
                            <Badge 
                              key={key}
                              variant="outline" 
                              className="cursor-pointer hover:bg-sky-500/10 border-sky-500/30 text-sky-600 dark:text-sky-400" 
                              onClick={() => {
                                if(isSending) return
                                const newV = [...messageVariants]
                                newV[activeVariantIndex] += ` {{${key}}}`
                                setMessageVariants(newV)
                              }}
                            >
                              {`{{${key}}}`}
                            </Badge>
                          ))}
                        </div>
                        <div className="flex justify-end mt-2">
                          <Button 
                            variant="secondary" 
                            size="sm" 
                            onClick={handleSaveCampaign} 
                            disabled={isSending || isSavingCampaign}
                            className="text-xs"
                          >
                            {isSavingCampaign ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <Settings2 className="w-3 h-3 mr-2" />}
                            Salvar Mensagem na Campanha
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Mídia (Foto/Banner) <span className="text-muted-foreground font-normal">- Opcional</span></Label>
                      {mediaBase64 ? (
                        <div className="relative w-fit border border-border rounded-lg overflow-hidden group">
                          {mediaMimeType?.includes('image') ? (
                            <img src={mediaBase64} alt="Upload" className="max-w-[200px] h-auto object-cover" />
                          ) : (
                            <div className="w-[200px] h-[150px] flex items-center justify-center bg-muted">Video Selecionado</div>
                          )}
                          {!isSending && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                              <Button variant="destructive" size="sm" onClick={removeMedia}>
                                <Trash2 className="w-4 h-4 mr-2" /> Remover
                              </Button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <input type="file" accept="image/*,video/*" className="hidden" ref={mediaInputRef} onChange={handleMediaUpload} />
                          <Button type="button" variant="outline" onClick={() => mediaInputRef.current?.click()} disabled={isSending}>
                            <ImageIcon className="w-4 h-4 mr-2" />
                            Anexar Foto ou Vídeo
                          </Button>
                          <span className="text-xs text-muted-foreground">Máx 5MB</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Anti Ban e Rotação */}
                  <div className="space-y-4 pt-2 border-t border-border/50">
                    <Label className="text-base font-semibold flex items-center gap-2">
                      Configurações Anti-Ban e Rotação
                      <Info className="w-4 h-4 text-muted-foreground" />
                    </Label>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                      <div className="space-y-3">
                        <Label className="text-sm">Intervalo entre Envios</Label>
                        <div className="flex items-center gap-2">
                          <Input type="number" min="1" value={minDelay} onChange={(e) => setMinDelay(Number(e.target.value))} className="w-16" disabled={isSending} />
                          <span className="text-muted-foreground text-sm">até</span>
                          <Input type="number" min="2" value={maxDelay} onChange={(e) => setMaxDelay(Number(e.target.value))} className="w-16" disabled={isSending} />
                          <span className="text-muted-foreground text-sm">seg</span>
                        </div>
                        <p className="text-xs text-muted-foreground">Tempo aleatório simulando digitação.</p>
                      </div>

                      <div className="space-y-3">
                        <Label className="text-sm">Pausa de Resfriamento</Label>
                        <div className="flex items-center gap-2">
                          <Input type="number" min="1" value={pauseDuration} onChange={(e) => setPauseDuration(Number(e.target.value))} className="w-16" disabled={isSending} />
                          <span className="text-sm">min, a cada</span>
                          <Input type="number" min="10" value={pauseCount} onChange={(e) => setPauseCount(Number(e.target.value))} className="w-16" disabled={isSending} />
                          <span className="text-sm">envios</span>
                        </div>
                        <p className="text-xs text-muted-foreground">Pausa o envio em todos os chips temporariamente.</p>
                      </div>

                      <div className="space-y-3">
                        <Label className="text-sm">Rotação da Roleta</Label>
                        <div className="flex items-center gap-2">
                          <span className="text-sm">Trocar de chip a cada</span>
                          <Input type="number" min="1" value={messagesPerInstance} onChange={(e) => setMessagesPerInstance(Number(e.target.value))} className="w-16" disabled={isSending} />
                          <span className="text-sm">envios</span>
                        </div>
                        <p className="text-xs text-muted-foreground">Número de mensagens disparadas antes de passar para o próximo chip.</p>
                      </div>
                    </div>
                  </div>

                </CardContent>
              </Card>

            </div>

            {/* Direita: Controles e Logs */}
            <div className="space-y-6">
              <Card className="glass-card shadow-lg sticky top-6">
                <CardHeader className="pb-4">
                  <CardTitle>Controle da Campanha</CardTitle>
                  <CardDescription>A campanha rodará diretamente nesta tela. Não feche a aba.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  
                  {isSending ? (
                    <Button 
                      onClick={stopMassMessage} 
                      className="w-full h-12 bg-destructive hover:bg-destructive/90 text-white shadow-[0_0_20px_rgba(239,68,68,0.3)] animate-pulse"
                    >
                      <Square className="w-5 h-5 mr-2" />
                      PARAR CAMPANHA
                    </Button>
                  ) : (
                    <Button 
                      onClick={startMassMessage} 
                      className="w-full h-12 bg-sky-500 hover:bg-sky-600 text-white shadow-[0_0_20px_rgba(14,165,233,0.3)] hover:shadow-[0_0_25px_rgba(14,165,233,0.5)] transition-all"
                      disabled={filteredLeads.length === 0 || instances.length === 0}
                    >
                      <Play className="w-5 h-5 mr-2" />
                      INICIAR CAMPANHA
                    </Button>
                  )}

                  <div className="bg-zinc-950 rounded-lg p-3 h-[400px] flex flex-col font-mono text-xs">
                    <div className="text-zinc-500 pb-2 border-b border-zinc-800 flex justify-between">
                      <span>Terminal de Logs</span>
                      {isSending && <Loader2 className="w-4 h-4 animate-spin text-sky-500" />}
                    </div>
                    <ScrollArea className="flex-1 mt-2">
                      <div className="space-y-2 pr-4">
                        {logs.length === 0 && (
                          <div className="text-zinc-600 text-center mt-10">Aguardando inicialização...</div>
                        )}
                        {logs.map((log) => (
                          <div key={log.id} className="flex gap-2">
                            <span className="text-zinc-500 shrink-0">[{log.time}]</span>
                            <span className={`break-words flex-1 ${
                              log.type === 'success' ? 'text-emerald-400' :
                              log.type === 'error' ? 'text-red-400' :
                              'text-sky-300'
                            }`}>
                              {log.message}
                            </span>
                          </div>
                        ))}
                        <div ref={logEndRef} />
                      </div>
                    </ScrollArea>
                  </div>

                </CardContent>
              </Card>
            </div>

          </div>
        </TabsContent>
      </Tabs>

      {/* Modal de Edição de Lead */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Editar Lead</DialogTitle>
            <DialogDescription>
              Faça alterações nos dados do contato.
            </DialogDescription>
          </DialogHeader>
          {editingLead && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="name" className="text-right">Nome</Label>
                <Input 
                  id="name" 
                  value={editingLead.name} 
                  onChange={(e) => setEditingLead({...editingLead, name: e.target.value})} 
                  className="col-span-3" 
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="phone" className="text-right">Telefone</Label>
                <Input 
                  id="phone" 
                  value={editingLead.phone} 
                  onChange={(e) => setEditingLead({...editingLead, phone: e.target.value})} 
                  className="col-span-3" 
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="email" className="text-right">E-mail</Label>
                <Input 
                  id="email" 
                  type="email"
                  value={editingLead.email || ''} 
                  onChange={(e) => setEditingLead({...editingLead, email: e.target.value})} 
                  className="col-span-3" 
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="status" className="text-right">Status</Label>
                <Input 
                  id="status" 
                  value={editingLead.status} 
                  onChange={(e) => setEditingLead({...editingLead, status: e.target.value})} 
                  className="col-span-3" 
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="notes" className="text-right">Notas</Label>
                <Input 
                  id="notes" 
                  value={editingLead.notes || ''} 
                  onChange={(e) => setEditingLead({...editingLead, notes: e.target.value})} 
                  className="col-span-3" 
                />
              </div>
              {/* Campos extras (custom_fields) */}
              {editingLead.custom_fields && Object.keys(editingLead.custom_fields).length > 0 && (
                <>
                  <div className="col-span-4 border-t border-border/50 pt-3">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Campos Extras</Label>
                  </div>
                  {Object.entries(editingLead.custom_fields).map(([key, val]) => (
                    <div key={key} className="grid grid-cols-4 items-center gap-4">
                      <Label className="text-right capitalize text-sm truncate" title={key}>{key}</Label>
                      <Input 
                        value={val} 
                        onChange={(e) => setEditingLead({
                          ...editingLead, 
                          custom_fields: { ...editingLead.custom_fields, [key]: e.target.value }
                        })} 
                        className="col-span-3" 
                      />
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveEdit}>Salvar Mudanças</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Ação em Lote (Adicionar Tag) */}
      <Dialog open={isBulkTagDialogOpen} onOpenChange={setIsBulkTagDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Adicionar Tag em Lote</DialogTitle>
            <DialogDescription>
              A tag será adicionada a {selectedLeads.size} leads selecionados.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="bulkTag">Nova Tag</Label>
              <Input 
                id="bulkTag" 
                placeholder="Ex: Quente, Promoção, VIP" 
                value={bulkTagInput} 
                onChange={(e) => setBulkTagInput(e.target.value)} 
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBulkTagDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleBulkAddTag} disabled={!bulkTagInput.trim()}>Adicionar Tag</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Mapeamento de Colunas CSV */}
      <Dialog open={isMappingModalOpen} onOpenChange={(open) => {
        if (!open) {
          setIsMappingModalOpen(false)
          setCsvRawData([])
          setCsvHeaders([])
          setColumnMappings([])
          setMappingWarnings([])
        }
      }}>
        <DialogContent className="sm:max-w-[750px] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Columns3 className="w-5 h-5 text-primary" />
              Mapeamento de Colunas
            </DialogTitle>
            <DialogDescription>
              Revise como as colunas da planilha serão importadas. Ajuste se necessário.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-5 py-2">
            {/* Warnings */}
            {mappingWarnings.length > 0 && (
              <div className="space-y-2">
                {mappingWarnings.map((w, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm p-2.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {w}
                  </div>
                ))}
              </div>
            )}

            {/* Mapeamento de colunas */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Colunas Detectadas ({csvHeaders.length})</Label>
              <div className="space-y-2">
                {columnMappings.map((mapping, index) => (
                  <div key={index} className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors">
                    {/* Indicador de confiança */}
                    <div className="shrink-0">
                      {mapping.confidence === 'high' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : mapping.confidence === 'medium' ? (
                        <AlertCircle className="w-4 h-4 text-amber-500" />
                      ) : (
                        <Info className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    
                    {/* Nome da coluna no CSV */}
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium truncate block" title={mapping.csvHeader}>
                        "{mapping.csvHeader}"
                      </span>
                      {/* Preview do primeiro valor */}
                      <span className="text-xs text-muted-foreground truncate block">
                        ex: {csvRawData[0]?.[mapping.csvHeader] || '(vazio)'}
                      </span>
                    </div>

                    <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />

                    {/* Select do campo de destino */}
                    <Select 
                      value={mapping.systemField} 
                      onValueChange={(val) => updateMapping(index, val as SystemField | 'custom' | 'ignore')}
                    >
                      <SelectTrigger className="w-[160px] shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="name">Nome</SelectItem>
                        <SelectItem value="phone">Telefone</SelectItem>
                        <SelectItem value="email">E-mail</SelectItem>
                        <SelectItem value="status">Status</SelectItem>
                        <SelectItem value="source">Origem</SelectItem>
                        <SelectItem value="notes">Notas</SelectItem>
                        <SelectItem value="custom">Campo Extra</SelectItem>
                        <SelectItem value="ignore">Ignorar</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            {/* Preview das primeiras linhas */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Preview ({Math.min(5, csvRawData.length)} de {csvRawData.length} linhas)</Label>
              <div className="rounded-md border border-border/50 overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      {csvHeaders.map((h, i) => (
                        <TableHead key={i} className="text-xs whitespace-nowrap">{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {csvRawData.slice(0, 5).map((row, rowIdx) => (
                      <TableRow key={rowIdx}>
                        {csvHeaders.map((h, colIdx) => (
                          <TableCell key={colIdx} className="text-xs whitespace-nowrap max-w-[200px] truncate">
                            {isScientificNotation(row[h] || '') ? (
                              <span className="text-amber-500" title={`Corrigido: ${fixScientificNotation(row[h])}` }>
                                {row[h]} → {fixScientificNotation(row[h])}
                              </span>
                            ) : (
                              row[h] || ''
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Resumo */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Mapeado automaticamente</span>
              <span className="flex items-center gap-1"><AlertCircle className="w-3 h-3 text-amber-500" /> Sugestão parcial</span>
              <span className="flex items-center gap-1"><Info className="w-3 h-3 text-muted-foreground" /> Campo extra</span>
            </div>
          </div>

          <DialogFooter className="border-t border-border/50 pt-4">
            <Button variant="outline" onClick={() => setIsMappingModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleConfirmImport} className="bg-sky-500 hover:bg-sky-600 text-white">
              <Upload className="w-4 h-4 mr-2" />
              Importar {csvRawData.length} Leads
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Inteligência Artificial */}
      <Dialog open={isAiModalOpen} onOpenChange={setIsAiModalOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-purple-500" />
              Gerador de Variantes (IA)
            </DialogTitle>
            <DialogDescription>
              A inteligência artificial vai escrever múltiplas mensagens persuasivas para o seu disparo, aplicando técnicas de Spintax automaticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="aiContext">Qual o objetivo desta campanha?</Label>
              <Textarea 
                id="aiContext" 
                placeholder="Ex: Vou oferecer 20% de desconto no plano anual para quem assinar até sexta-feira." 
                value={aiContext} 
                onChange={(e) => setAiContext(e.target.value)} 
                className="h-24 resize-none"
              />
              <p className="text-xs text-muted-foreground mt-1">
                A IA vai retornar 4 opções de mensagens altamente conversivas e substituirá as que estão atualmente no painel.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAiModalOpen(false)}>Cancelar</Button>
            <Button 
              onClick={handleGenerateAI} 
              disabled={!aiContext.trim() || isGeneratingAI}
              className="bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white"
            >
              {isGeneratingAI ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Wand2 className="w-4 h-4 mr-2" />}
              {isGeneratingAI ? 'Criando Mágica...' : 'Gerar Mensagens'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </PageShell>
  )
}
