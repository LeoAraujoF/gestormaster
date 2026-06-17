import Link from "next/link"
import { ArrowLeft, ShieldCheck } from "lucide-react"

export default function TermosPage() {
  return (
    <div className="min-h-screen bg-background text-foreground py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <Link 
          href="/cadastro" 
          className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground mb-8 transition-colors"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar para o cadastro
        </Link>
        
        <div className="mb-10 flex items-center gap-4 border-b border-border pb-6">
          <div className="p-3 bg-primary/10 text-primary rounded-xl">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Termos de Uso</h1>
            <p className="text-muted-foreground mt-1">Última atualização: {new Date().toLocaleDateString('pt-BR')}</p>
          </div>
        </div>

        <div className="prose prose-zinc dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-xl font-semibold mb-3">1. Aceitação dos Termos</h2>
            <p className="text-muted-foreground leading-relaxed">
              Ao acessar e usar a plataforma <strong>Gestor Master</strong>, você concorda em cumprir e ser regido por estes Termos de Uso. Se você não concordar com qualquer parte destes termos, não deverá utilizar nossos serviços.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. Descrição do Serviço</h2>
            <p className="text-muted-foreground leading-relaxed">
              O Gestor Master é uma plataforma SaaS (Software as a Service) voltada para a gestão de clientes, cobranças recorrentes e automação de mensagens via integração com a API do WhatsApp.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. Uso da Integração com WhatsApp</h2>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 mb-4">
              <h3 className="font-medium text-amber-600 dark:text-amber-400 mb-2">Importante: Sobre Riscos de Banimento</h3>
              <p className="text-sm text-amber-700/80 dark:text-amber-300/80 leading-relaxed">
                Nossa plataforma atua apenas como um intermediário técnico para o envio de mensagens automatizadas. <strong>O Gestor Master não se responsabiliza pelo banimento, suspensão ou bloqueio de números de WhatsApp</strong> por parte da Meta Inc. O usuário é o único responsável por garantir que o volume, frequência e conteúdo de suas mensagens estão em conformidade com as Políticas de Comércio e Termos de Serviço do WhatsApp.
              </p>
            </div>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 mt-4 ml-2">
              <li>O usuário não deve utilizar o sistema para envio de SPAM.</li>
              <li>Recomendamos o uso de números "aquecidos" e pausas (Anti-Ban) configuradas no painel.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Assinaturas, Pagamentos e Inadimplência</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              O acesso às funcionalidades da plataforma é condicionado ao pagamento da assinatura escolhida.
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-2">
              <li>Em caso de inadimplência, o sistema suspenderá os envios automáticos e o acesso ao painel principal até a regularização.</li>
              <li>Não efetuamos reembolsos proporcionais para cancelamentos realizados no meio do ciclo de faturamento.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Privacidade e Proteção de Dados (LGPD)</h2>
            <p className="text-muted-foreground leading-relaxed">
              O Gestor Master compromete-se a proteger os dados de seus clientes, bem como os dados dos clientes de nossos clientes ("dados de terceiros"), conforme estipulado pela Lei Geral de Proteção de Dados (LGPD). Seus dados não serão vendidos ou compartilhados com terceiros para fins publicitários. Para mais detalhes, consulte nossa Política de Privacidade.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Limitação de Responsabilidade</h2>
            <p className="text-muted-foreground leading-relaxed">
              Em nenhuma circunstância o Gestor Master será responsabilizado por lucros cessantes, perda de dados ou danos indiretos decorrentes do uso ou da incapacidade de uso de nossa plataforma, mesmo que tenhamos sido avisados da possibilidade de tais danos.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Modificações dos Termos</h2>
            <p className="text-muted-foreground leading-relaxed">
              Reservamo-nos o direito de modificar estes termos a qualquer momento. Alterações significativas serão notificadas através do painel da plataforma ou por e-mail. O uso contínuo do serviço após as alterações constitui sua aceitação dos novos termos.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
