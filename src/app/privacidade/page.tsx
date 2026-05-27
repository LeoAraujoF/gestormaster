"use client"

import Link from "next/link"
import { Shield, ArrowLeft } from "lucide-react"

export default function PrivacidadePage() {
  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30">
      {/* Navbar Minimalista */}
      <nav className="border-b border-border/50 bg-background/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-xl tracking-tight">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary-foreground" />
            </div>
            Gestor
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
      <main className="max-w-4xl mx-auto px-6 py-12 md:py-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="space-y-4 mb-12">
          <h1 className="text-4xl md:text-5xl font-bold font-heading tracking-tight">
            Política de Privacidade
          </h1>
          <p className="text-muted-foreground text-lg">
            Última atualização: 27/05/2026
          </p>
        </div>

        <div className="max-w-none pb-20">
          
          <h2 className="text-2xl font-bold mt-12 mb-4 text-foreground font-heading">Quem somos</h2>
          <p className="text-muted-foreground leading-relaxed mb-6">
            O <strong>Gestor</strong> é um sistema de gestão e notificações via WhatsApp que auxilia empresas a automatizar comunicações com seus clientes, incluindo lembretes de cobrança, confirmações e avisos operacionais.
          </p>

          <h2 className="text-2xl font-bold mt-12 mb-4 text-foreground font-heading">Dados que coletamos</h2>
          <ul className="list-disc list-inside space-y-2 text-muted-foreground mb-6">
            <li><strong>Dados de conta:</strong> nome de usuário, nome, e-mail e telefone.</li>
            <li><strong>Dados operacionais do gestor:</strong> cadastros de clientes, números de telefone, histórico de envios, status, planos e métricas de uso.</li>
            <li><strong>Preferências e configurações:</strong> templates de mensagens, configurações de fuso horário, integrações financeiras e dados de recebimento (PIX).</li>
            <li><strong>Registros técnicos:</strong> logs de acesso, endereço IP, dispositivo, data e hora.</li>
            <li><strong>Cookies:</strong> cookies essenciais para autenticação e manutenção de sessão.</li>
          </ul>

          <h2 className="text-2xl font-bold mt-12 mb-4 text-foreground font-heading">Como usamos os dados</h2>
          <ul className="list-disc list-inside space-y-2 text-muted-foreground mb-6">
            <li>Operar o Gestor, autenticar usuários e manter o funcionamento seguro.</li>
            <li>Enviar notificações automatizadas via WhatsApp conforme as regras configuradas pelo usuário.</li>
            <li>Gerar relatórios e estatísticas internas para melhoria do serviço.</li>
            <li>Prestar suporte, comunicação administrativa e processamento de assinaturas.</li>
          </ul>

          <h2 className="text-2xl font-bold mt-12 mb-4 text-foreground font-heading">Integração com WhatsApp</h2>
          <p className="text-muted-foreground leading-relaxed mb-6">
            O envio de mensagens ocorre a partir do número (instância) autorizado e conectado pelo próprio usuário via QR Code. O sistema não lê o conteúdo das conversas pessoais do seu aparelho e utiliza a conexão estritamente para disparar os alertas e mensagens automatizadas configuradas no painel.
          </p>

          <h2 className="text-2xl font-bold mt-12 mb-4 text-foreground font-heading">Base legal</h2>
          <ul className="list-disc list-inside space-y-2 text-muted-foreground mb-6">
            <li>Execução de contrato ao fornecer o serviço do Gestor.</li>
            <li>Consentimento para integrações e comunicações específicas.</li>
            <li>Interesse legítimo para segurança, prevenção a fraudes e melhoria contínua.</li>
          </ul>

          <h2 className="text-2xl font-bold mt-12 mb-4 text-foreground font-heading">Compartilhamento de dados</h2>
          <p className="text-muted-foreground leading-relaxed mb-6">
            Podemos compartilhar dados com prestadores de serviço estritamente necessários à operação (por exemplo, provedores de infraestrutura na nuvem e gateways de pagamento). Em integrações, dados mínimos são enviados às APIs escolhidas pelo usuário (como a Evolution API para WhatsApp). Nós <strong>nunca</strong> vendemos seus dados ou os dados dos seus clientes.
          </p>

          <h2 className="text-2xl font-bold mt-12 mb-4 text-foreground font-heading">Retenção</h2>
          <p className="text-muted-foreground leading-relaxed mb-6">
            Os dados são mantidos enquanto sua conta estiver ativa e conforme obrigações legais. Mediante solicitação, podemos excluir dados observando restrições técnicas e legais.
          </p>

          <h2 className="text-2xl font-bold mt-12 mb-4 text-foreground font-heading">Segurança</h2>
          <p className="text-muted-foreground leading-relaxed mb-6">
            Aplicamos rigorosas práticas de segurança, criptografia de senhas e proteção de rotas para proteger informações contra acesso não autorizado. Recomendamos o uso de senhas fortes e PIN de segurança no sistema. Nenhuma tecnologia é 100% infalível, mas garantimos os melhores esforços do mercado.
          </p>

          <h2 className="text-2xl font-bold mt-12 mb-4 text-foreground font-heading">Seus direitos</h2>
          <ul className="list-disc list-inside space-y-2 text-muted-foreground mb-6">
            <li>Acessar, corrigir e atualizar seus dados diretamente no painel "Minha Conta".</li>
            <li>Solicitar exclusão, portabilidade e informações sobre tratamento.</li>
            <li>Revogar consentimentos e desconectar integrações a qualquer momento.</li>
          </ul>

          <h2 className="text-2xl font-bold mt-12 mb-4 text-foreground font-heading">Cookies</h2>
          <p className="text-muted-foreground leading-relaxed mb-6">
            Usamos cookies estritamente necessários para o login e controle de sessão. Você pode bloquear cookies no navegador, porém isso impossibilitará o acesso seguro ao painel.
          </p>

          <h2 className="text-2xl font-bold mt-12 mb-4 text-foreground font-heading">Alterações nesta política</h2>
          <p className="text-muted-foreground leading-relaxed mb-6">
            Esta política pode ser atualizada periodicamente para refletir novas funcionalidades ou leis. A versão vigente estará sempre disponível neste endereço.
          </p>
        </div>
      </main>

      {/* Footer simples */}
      <footer className="border-t border-border/50 py-8 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} Gestor. Todos os direitos reservados.</p>
      </footer>
    </div>
  )
}
