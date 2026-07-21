"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { LegalToc } from "@/components/legal-toc"
import { BrandMark, BrandName } from "@/components/brand-mark"

const TOC = [
  { id: "p1", label: "Quem somos" },
  { id: "p2", label: "Dados que coletamos" },
  { id: "p3", label: "Como usamos os dados" },
  { id: "p4", label: "Integração com WhatsApp" },
  { id: "p5", label: "Base legal" },
  { id: "p6", label: "Compartilhamento de dados" },
  { id: "p7", label: "Retenção" },
  { id: "p8", label: "Segurança" },
  { id: "p9", label: "Seus direitos" },
  { id: "p10", label: "Cookies" },
  { id: "p11", label: "Alterações nesta política" },
]

export default function PrivacidadePage() {
  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30">
      {/* Navbar Minimalista */}
      <nav className="border-b border-border/50 bg-background/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-xl tracking-tight">
            <BrandMark size={32} />
            <BrandName />
          </div>
          <Link 
            href="/login" 
            className="text-sm font-medium text-muted-foreground hover:text-primary flex items-center gap-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar ao Login
          </Link>
        </div>
      </nav>

      {/* Conteúdo da Política */}
      <main className="mx-auto grid max-w-4xl grid-cols-1 gap-10 px-6 py-12 lg:grid-cols-[210px_1fr]">
        <aside>
          <LegalToc items={TOC} crossLink={{ href: "/termos", label: "Termos de Uso" }} />
        </aside>

        <div className="max-w-[62ch]">
        <div className="mb-10">
          <h1 className="text-[20px] font-semibold tracking-[-0.02em]">
            Política de Privacidade
          </h1>
          <p className="microlabel mt-1.5">Atualizado em 27/05/2026</p>
        </div>

        <div className="max-w-none pb-20 text-[13px]">
          
          <h2 id="p1" className="scroll-mt-24 text-[14.5px] font-semibold mt-10 mb-2 text-foreground">Quem somos</h2>
          <p className="text-muted-foreground leading-relaxed mb-6">
            A <strong>Lembrado</strong> é um sistema de gestão e notificações via WhatsApp que auxilia empresas a automatizar comunicações com seus clientes, incluindo lembretes de cobrança, confirmações e avisos operacionais.
          </p>

          <h2 id="p2" className="scroll-mt-24 text-[14.5px] font-semibold mt-10 mb-2 text-foreground">Dados que coletamos</h2>
          <ul className="list-disc list-inside space-y-2 text-muted-foreground mb-6">
            <li><strong>Dados de conta:</strong> nome de usuário, nome, e-mail e telefone.</li>
            <li><strong>Dados operacionais do gestor:</strong> cadastros de clientes, números de telefone, histórico de envios, status, planos e métricas de uso.</li>
            <li><strong>Preferências e configurações:</strong> templates de mensagens, configurações de fuso horário, integrações financeiras e dados de recebimento (PIX).</li>
            <li><strong>Registros técnicos:</strong> logs de acesso, endereço IP, dispositivo, data e hora.</li>
            <li><strong>Cookies:</strong> cookies essenciais para autenticação e manutenção de sessão.</li>
          </ul>

          <h2 id="p3" className="scroll-mt-24 text-[14.5px] font-semibold mt-10 mb-2 text-foreground">Como usamos os dados</h2>
          <ul className="list-disc list-inside space-y-2 text-muted-foreground mb-6">
            <li>Operar a Lembrado, autenticar usuários e manter o funcionamento seguro.</li>
            <li>Enviar notificações automatizadas via WhatsApp conforme as regras configuradas pelo usuário.</li>
            <li>Gerar relatórios e estatísticas internas para melhoria do serviço.</li>
            <li>Prestar suporte, comunicação administrativa e processamento de assinaturas.</li>
          </ul>

          <h2 id="p4" className="scroll-mt-24 text-[14.5px] font-semibold mt-10 mb-2 text-foreground">Integração com WhatsApp</h2>
          <p className="text-muted-foreground leading-relaxed mb-6">
            O envio de mensagens ocorre a partir do número (instância) autorizado e conectado pelo próprio usuário via QR Code. O sistema não lê o conteúdo das conversas pessoais do seu aparelho e utiliza a conexão estritamente para disparar os alertas e mensagens automatizadas configuradas no painel.
          </p>

          <h2 id="p5" className="scroll-mt-24 text-[14.5px] font-semibold mt-10 mb-2 text-foreground">Base legal</h2>
          <ul className="list-disc list-inside space-y-2 text-muted-foreground mb-6">
            <li>Execução de contrato ao fornecer o serviço da Lembrado.</li>
            <li>Consentimento para integrações e comunicações específicas.</li>
            <li>Interesse legítimo para segurança, prevenção a fraudes e melhoria contínua.</li>
          </ul>

          <h2 id="p6" className="scroll-mt-24 text-[14.5px] font-semibold mt-10 mb-2 text-foreground">Compartilhamento de dados</h2>
          <p className="text-muted-foreground leading-relaxed mb-6">
            Podemos compartilhar dados com prestadores de serviço estritamente necessários à operação (por exemplo, provedores de infraestrutura na nuvem e gateways de pagamento). Em integrações, dados mínimos são enviados às APIs escolhidas pelo usuário (como a Evolution API para WhatsApp). Nós <strong>nunca</strong> vendemos seus dados ou os dados dos seus clientes.
          </p>

          <h2 id="p7" className="scroll-mt-24 text-[14.5px] font-semibold mt-10 mb-2 text-foreground">Retenção</h2>
          <p className="text-muted-foreground leading-relaxed mb-6">
            Os dados são mantidos enquanto sua conta estiver ativa e conforme obrigações legais. Mediante solicitação, podemos excluir dados observando restrições técnicas e legais.
          </p>

          <h2 id="p8" className="scroll-mt-24 text-[14.5px] font-semibold mt-10 mb-2 text-foreground">Segurança</h2>
          <p className="text-muted-foreground leading-relaxed mb-6">
            Aplicamos rigorosas práticas de segurança, criptografia de senhas e proteção de rotas para proteger informações contra acesso não autorizado. Recomendamos o uso de senhas fortes e PIN de segurança no sistema. Nenhuma tecnologia é 100% infalível, mas garantimos os melhores esforços do mercado.
          </p>

          <h2 id="p9" className="scroll-mt-24 text-[14.5px] font-semibold mt-10 mb-2 text-foreground">Seus direitos</h2>
          <ul className="list-disc list-inside space-y-2 text-muted-foreground mb-6">
            <li>Acessar, corrigir e atualizar seus dados diretamente no painel "Minha Conta".</li>
            <li>Solicitar exclusão, portabilidade e informações sobre tratamento.</li>
            <li>Revogar consentimentos e desconectar integrações a qualquer momento.</li>
          </ul>

          <h2 id="p10" className="scroll-mt-24 text-[14.5px] font-semibold mt-10 mb-2 text-foreground">Cookies</h2>
          <p className="text-muted-foreground leading-relaxed mb-6">
            Usamos cookies estritamente necessários para o login e controle de sessão. Você pode bloquear cookies no navegador, porém isso impossibilitará o acesso seguro ao painel.
          </p>

          <h2 id="p11" className="scroll-mt-24 text-[14.5px] font-semibold mt-10 mb-2 text-foreground">Alterações nesta política</h2>
          <p className="text-muted-foreground leading-relaxed mb-6">
            Esta política pode ser atualizada periodicamente para refletir novas funcionalidades ou leis. A versão vigente estará sempre disponível neste endereço.
          </p>

          <div className="mt-10 border-t border-border pt-5 text-xs text-muted-foreground">
            Veja também os <a href="/termos" className="font-medium text-interactive hover:underline">Termos de Uso</a>.
          </div>
        </div>
        </div>
      </main>

      {/* Footer simples */}
      <footer className="border-t border-border/50 py-8 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} Lembrado. Todos os direitos reservados.</p>
      </footer>
    </div>
  )
}
