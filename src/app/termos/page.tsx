import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { LegalToc } from "@/components/legal-toc"

const TOC = [
  { id: "t1", label: "Aceitação dos termos" },
  { id: "t2", label: "Descrição do serviço" },
  { id: "t3", label: "Integração com WhatsApp" },
  { id: "t4", label: "Assinaturas e pagamentos" },
  { id: "t5", label: "Privacidade (LGPD)" },
  { id: "t6", label: "Limitação de responsabilidade" },
  { id: "t7", label: "Modificações dos termos" },
]

export default function TermosPage() {
  return (
    <div className="min-h-screen bg-background text-foreground py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-4xl grid-cols-1 gap-10 lg:grid-cols-[210px_1fr]">
        <aside>
          <Link
            href="/cadastro"
            className="mb-6 inline-flex items-center text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Voltar para o cadastro
          </Link>
          <LegalToc items={TOC} crossLink={{ href: "/privacidade", label: "Política de Privacidade" }} />
        </aside>

        <div className="max-w-[62ch]">
        <div className="mb-10 border-b border-border pb-5">
          <h1 className="text-[20px] font-semibold tracking-[-0.02em]">Termos de Uso</h1>
          <p className="microlabel mt-1.5">Atualizado em {new Date().toLocaleDateString('pt-BR')}</p>
        </div>

        <div className="space-y-7 text-[13px] leading-relaxed">
          <section>
            <h2 id="t1" className="scroll-mt-24 text-[14.5px] font-semibold mb-2 text-foreground">1. Aceitação dos Termos</h2>
            <p className="text-muted-foreground leading-relaxed">
              Ao acessar e usar a plataforma <strong>Gestor Master</strong>, você concorda em cumprir e ser regido por estes Termos de Uso. Se você não concordar com qualquer parte destes termos, não deverá utilizar nossos serviços.
            </p>
          </section>

          <section>
            <h2 id="t2" className="scroll-mt-24 text-[14.5px] font-semibold mb-2 text-foreground">2. Descrição do Serviço</h2>
            <p className="text-muted-foreground leading-relaxed">
              O Gestor Master é uma plataforma SaaS (Software as a Service) voltada para a gestão de clientes, cobranças recorrentes e automação de mensagens via integração com a API do WhatsApp.
            </p>
          </section>

          <section>
            <h2 id="t3" className="scroll-mt-24 text-[14.5px] font-semibold mb-2 text-foreground">3. Uso da Integração com WhatsApp</h2>
            <div className="bg-warning-bg border border-warning-border rounded-md p-4 mb-4">
              <h3 className="font-medium text-warning-fg mb-2">Importante: Sobre Riscos de Banimento</h3>
              <p className="text-sm text-warning-fg leading-relaxed">
                Nossa plataforma atua apenas como um intermediário técnico para o envio de mensagens automatizadas. <strong>O Gestor Master não se responsabiliza pelo banimento, suspensão ou bloqueio de números de WhatsApp</strong> por parte da Meta Inc. O usuário é o único responsável por garantir que o volume, frequência e conteúdo de suas mensagens estão em conformidade com as Políticas de Comércio e Termos de Serviço do WhatsApp.
              </p>
            </div>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 mt-4 ml-2">
              <li>O usuário não deve utilizar o sistema para envio de SPAM.</li>
              <li>Recomendamos o uso de números "aquecidos" e pausas (Anti-Ban) configuradas no painel.</li>
            </ul>
          </section>

          <section>
            <h2 id="t4" className="scroll-mt-24 text-[14.5px] font-semibold mb-2 text-foreground">4. Assinaturas, Pagamentos e Inadimplência</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              O acesso às funcionalidades da plataforma é condicionado ao pagamento da assinatura escolhida.
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-2">
              <li>Em caso de inadimplência, o sistema suspenderá os envios automáticos e o acesso ao painel principal até a regularização.</li>
              <li>Não efetuamos reembolsos proporcionais para cancelamentos realizados no meio do ciclo de faturamento.</li>
            </ul>
          </section>

          <section>
            <h2 id="t5" className="scroll-mt-24 text-[14.5px] font-semibold mb-2 text-foreground">5. Privacidade e Proteção de Dados (LGPD)</h2>
            <p className="text-muted-foreground leading-relaxed">
              O Gestor Master compromete-se a proteger os dados de seus clientes, bem como os dados dos clientes de nossos clientes ("dados de terceiros"), conforme estipulado pela Lei Geral de Proteção de Dados (LGPD). Seus dados não serão vendidos ou compartilhados com terceiros para fins publicitários. Para mais detalhes, consulte nossa Política de Privacidade.
            </p>
          </section>

          <section>
            <h2 id="t6" className="scroll-mt-24 text-[14.5px] font-semibold mb-2 text-foreground">6. Limitação de Responsabilidade</h2>
            <p className="text-muted-foreground leading-relaxed">
              Em nenhuma circunstância o Gestor Master será responsabilizado por lucros cessantes, perda de dados ou danos indiretos decorrentes do uso ou da incapacidade de uso de nossa plataforma, mesmo que tenhamos sido avisados da possibilidade de tais danos.
            </p>
          </section>

          <section>
            <h2 id="t7" className="scroll-mt-24 text-[14.5px] font-semibold mb-2 text-foreground">7. Modificações dos Termos</h2>
            <p className="text-muted-foreground leading-relaxed">
              Reservamo-nos o direito de modificar estes termos a qualquer momento. Alterações significativas serão notificadas através do painel da plataforma ou por e-mail. O uso contínuo do serviço após as alterações constitui sua aceitação dos novos termos.
            </p>
          </section>
          <div className="mt-10 border-t border-border pt-5 text-xs text-muted-foreground">
            Veja também a <a href="/privacidade" className="font-medium text-interactive hover:underline">Política de Privacidade</a>.
          </div>
        </div>
        </div>
      </div>
    </div>
  )
}
