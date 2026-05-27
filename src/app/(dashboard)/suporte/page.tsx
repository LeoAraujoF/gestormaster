"use client"

import { useState } from "react"
import { 
  LifeBuoy, 
  MessageCircle, 
  Mail, 
  BookOpen, 
  ChevronDown, 
  ChevronUp, 
  ExternalLink,
  Zap,
  Shield,
  Smartphone
} from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

const faqs = [
  {
    question: "Como faço para conectar meu WhatsApp?",
    answer: "Vá até a aba 'Configurações' no menu lateral. Clique em 'Nova Conexão', dê um nome para a sua instância (ex: Meu Celular) e escaneie o QR Code que aparecerá na tela utilizando o WhatsApp do seu celular (Menu > Aparelhos Conectados)."
  },
  {
    question: "Como funcionam as mensagens automáticas?",
    answer: "Na aba 'Automações', você pode criar regras. O sistema possui um robô que roda diariamente na nuvem. Ele verifica a data de vencimento dos seus clientes e os coloca em uma fila de envio para disparar a mensagem exatamente no horário que você configurou, de forma automática e segura para não bloquear seu número."
  },
  {
    question: "Quais são as variáveis que posso usar nas mensagens?",
    answer: "Você pode usar: {{primeiro_nome}}, {{client_name}}, {{plan_value}} e {{due_date}}. Além disso, se configurar a aba 'Perfil da Empresa' na página 'Minha Conta', você também poderá usar: {{empresa}}, {{telefone_suporte}}, {{pix}} e {{titular_pix}}."
  },
  {
    question: "Posso enviar mensagens em massa manualmente?",
    answer: "Sim! Na aba 'Leads e Clientes', clique no ícone de megafone no topo da tela. Escolha para qual grupo deseja enviar (Ativos, Inativos, etc.), digite sua mensagem e clique em Enviar. O sistema fará o envio gradativo."
  },
  {
    question: "O meu fuso horário importa?",
    answer: "Sim. O sistema utiliza o fuso horário configurado na sua 'Minha Conta' para entender quando é 'hoje' ou 'amanhã' e enviar as mensagens de vencimento corretamente no seu horário local."
  }
]

export default function SuportePage() {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0)

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
      
      {/* Header Premium */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500/10 via-background to-background border border-border/50 p-8 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl -z-10" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-sky-500/5 rounded-full blur-3xl -z-10" />
        
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 z-10 relative">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-indigo-500 to-sky-500 p-1">
            <div className="w-full h-full bg-background rounded-xl flex items-center justify-center">
              <LifeBuoy className="w-10 h-10 text-indigo-500" />
            </div>
          </div>

          <div className="text-center sm:text-left space-y-2">
            <div className="flex items-center justify-center sm:justify-start gap-3">
              <h1 className="text-3xl font-heading font-bold tracking-tight text-foreground">
                Central de Suporte
              </h1>
              <Badge className="bg-indigo-500/10 text-indigo-500 border-indigo-500/20 shadow-none">Ajuda</Badge>
            </div>
            <p className="text-muted-foreground max-w-2xl">
              Estamos aqui para ajudar você a extrair o máximo do Gestor. Encontre respostas rápidas ou fale diretamente com nossa equipe.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-700 delay-100">
        
        {/* Left Column: FAQs */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="glass-card border-indigo-500/20 relative overflow-hidden">
            <CardHeader>
              <CardTitle className="text-2xl flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-500" />
                Perguntas Frequentes
              </CardTitle>
              <CardDescription>As dúvidas mais comuns resolvidas em segundos.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {faqs.map((faq, index) => (
                <div 
                  key={index} 
                  className={`border border-border/50 rounded-xl transition-all duration-300 overflow-hidden ${openFaqIndex === index ? 'bg-background shadow-md border-indigo-500/30' : 'bg-background/50 hover:bg-background'}`}
                >
                  <button
                    onClick={() => setOpenFaqIndex(openFaqIndex === index ? null : index)}
                    className="w-full flex items-center justify-between p-4 text-left font-medium"
                  >
                    <span className={openFaqIndex === index ? 'text-indigo-500' : 'text-foreground'}>
                      {faq.question}
                    </span>
                    {openFaqIndex === index ? (
                      <ChevronUp className="w-5 h-5 text-indigo-500 shrink-0" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />
                    )}
                  </button>
                  
                  <div 
                    className={`px-4 pb-4 text-muted-foreground text-sm leading-relaxed transition-all duration-300 ${openFaqIndex === index ? 'opacity-100 max-h-96' : 'opacity-0 max-h-0 hidden'}`}
                  >
                    {faq.answer}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Contact Channels */}
        <div className="space-y-6">
          <Card className="glass-card border-emerald-500/20 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl -z-10 translate-x-1/2 -translate-y-1/2" />
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-emerald-500" />
                Fale Conosco
              </CardTitle>
              <CardDescription>Atendimento humanizado</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Precisa de ajuda com uma configuração avançada ou encontrou algum problema? Chame nosso suporte!
              </p>
              <Button 
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 h-11"
                onClick={() => window.open('https://wa.me/5511999999999?text=Olá,%20preciso%20de%20ajuda%20com%20o%20sistema%20Gestor', '_blank')}
              >
                <MessageCircle className="w-4 h-4 mr-2" />
                Chamar no WhatsApp
              </Button>
            </CardContent>
          </Card>

          <Card className="glass-card bg-background/30">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Mail className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm">Suporte por E-mail</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Para questões comerciais ou administrativas.
                  </p>
                  <a href="mailto:suporte@gestor.com.br" className="text-sm text-primary hover:underline mt-2 inline-block">
                    suporte@gestor.com.br
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card bg-background/30">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                  <Zap className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm">Sugestões de Melhoria</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Tem uma ideia genial para o sistema? Nós adoramos ouvir! Mande sua sugestão no WhatsApp.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  )
}
