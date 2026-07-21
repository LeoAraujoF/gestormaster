import Link from "next/link"
import { Bricolage_Grotesque, IBM_Plex_Mono } from "next/font/google"
import {
  ArrowRight,
  BarChart3,
  BellRing,
  Bot,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  ContactRound,
  CreditCard,
  FileCheck2,
  Gauge,
  Headphones,
  HeartPulse,
  MessageCircleMore,
  MessagesSquare,
  Network,
  PackageCheck,
  QrCode,
  ReceiptText,
  RefreshCcw,
  Rocket,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  Users,
  WalletCards,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react"
import { BrandMark, BrandName } from "@/components/brand-mark"
import styles from "./landing-two.module.css"

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--landing-display",
})

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--landing-mono",
})

type Tool = {
  icon: LucideIcon
  title: string
  description: string
  accent: "green" | "orange" | "blue" | "yellow"
  tag: string
}

const tools: Tool[] = [
  {
    icon: Users,
    title: "Carteira de clientes",
    description: "Cadastro, status, vencimento, serviço e próxima ação em uma leitura só.",
    accent: "green",
    tag: "Organizar",
  },
  {
    icon: WalletCards,
    title: "Financeiro & PIX",
    description: "Entradas, pendências, custos e confirmações sem conciliação no escuro.",
    accent: "yellow",
    tag: "Receber",
  },
  {
    icon: MessageCircleMore,
    title: "WhatsApp & automação",
    description: "Lembretes, disparos, filas e logs com ritmo controlado e contexto.",
    accent: "green",
    tag: "Conversar",
  },
  {
    icon: BrainCircuit,
    title: "Cobrança inteligente",
    description: "Réguas por perfil, simulação antes de ativar e foco em quem exige atenção.",
    accent: "orange",
    tag: "Recuperar",
  },
  {
    icon: Headphones,
    title: "Portal & autoatendimento",
    description: "Segunda via, renovação, histórico e solicitações sem transformar tudo em suporte.",
    accent: "blue",
    tag: "Atender",
  },
  {
    icon: BarChart3,
    title: "Analytics & Intelligence",
    description: "Projeções, cenários, riscos e recomendações baseadas no que já aconteceu.",
    accent: "blue",
    tag: "Decidir",
  },
  {
    icon: ContactRound,
    title: "Leads & promoções",
    description: "Organize contatos, próximas ações e ofertas sem perder o histórico da conversa.",
    accent: "yellow",
    tag: "Crescer",
  },
  {
    icon: Network,
    title: "Revendas, painéis & API",
    description: "Conecte a operação, acompanhe parceiros e ganhe espaço para escalar.",
    accent: "orange",
    tag: "Expandir",
  },
]

const flow = [
  { icon: UserRoundCheck, label: "Cliente entra", detail: "cadastro e serviço" },
  { icon: Clock3, label: "Vencimento chega", detail: "regra identifica" },
  { icon: MessagesSquare, label: "Mensagem sai", detail: "no momento certo" },
  { icon: QrCode, label: "PIX é enviado", detail: "sem copiar e colar" },
  { icon: CheckCircle2, label: "Pagamento confirma", detail: "status atualizado" },
  { icon: Gauge, label: "Dado vira decisão", detail: "próxima ação clara" },
]

const prices = [
  {
    name: "Starter",
    price: "20",
    description: "Para colocar a operação em ordem.",
    limit: "Até 100 clientes",
    whatsapp: "1 WhatsApp conectado",
    features: ["Painel e carteira de clientes", "Financeiro e PIX manual", "Automação básica e promoções"],
    cta: "Começar no Starter",
  },
  {
    name: "Pro",
    price: "30",
    description: "Para automatizar o recebimento.",
    limit: "Até 500 clientes",
    whatsapp: "2 WhatsApps conectados",
    features: ["Cobrança inteligente e PIX automático", "Analytics, leads e aquecimento", "Portal do cliente e autoatendimento"],
    cta: "Testar o Pro grátis",
    featured: true,
  },
  {
    name: "Master",
    price: "40",
    description: "Para crescer com dados e estrutura.",
    limit: "Clientes ilimitados",
    whatsapp: "3 WhatsApps conectados",
    features: ["Tudo do Pro", "Lembrado Intelligence", "Revendas e API para desenvolvedores"],
    cta: "Começar no Master",
  },
]

const faqs = [
  {
    question: "A Lembrado serve só para IPTV?",
    answer:
      "Não. A plataforma foi pensada para operações recorrentes: assinaturas, serviços mensais, academias, consultorias, locações e negócios que acompanham clientes, vencimentos e pagamentos pelo WhatsApp.",
  },
  {
    question: "Preciso cadastrar cada cliente manualmente?",
    answer:
      "Não. Você pode importar sua base por CSV e continuar editando os dados individualmente quando precisar. A plataforma também permite exportar seus dados.",
  },
  {
    question: "A cobrança inteligente começa a enviar sozinha?",
    answer:
      "Não. Ela começa em modo de simulação. Você revisa os perfis, etapas, horários e mensagens antes de tomar uma decisão explícita de ativação.",
  },
  {
    question: "Preciso deixar o celular ligado?",
    answer:
      "Depois de conectar o número por QR Code, a operação segue pela conexão configurada na plataforma. Você acompanha o estado do número e os envios na Central de Automação.",
  },
  {
    question: "O teste de 7 dias exige cartão?",
    answer:
      "Não. Você cria a conta sem cartão, conhece a plataforma por 7 dias e depois escolhe entre Starter, Pro ou Master se quiser continuar.",
  },
]

export function LandingTwo() {
  return (
    <div className={`${styles.page} ${display.variable} ${mono.variable}`}>
      <a className={styles.skipLink} href="#conteudo">
        Ir para o conteúdo
      </a>

      <header className={styles.siteHeader}>
        <nav className={styles.nav} aria-label="Navegação principal">
          <a className={styles.brand} href="#topo" aria-label="Lembrado, voltar ao início">
            <BrandMark size={30} />
            <BrandName />
          </a>

          <div className={styles.navLinks}>
            <a href="#produto">Produto</a>
            <a href="#ferramentas">Ferramentas</a>
            <a href="#planos">Planos</a>
            <a href="#duvidas">Dúvidas</a>
          </div>

          <div className={styles.navActions}>
            <Link className={styles.loginLink} href="/login">
              Entrar
            </Link>
            <Link className={styles.headerCta} href="/cadastro">
              Testar grátis <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </nav>
      </header>

      <main id="conteudo">
        <section className={styles.hero} id="topo">
          <div className={styles.heroCopy}>
            <div className={styles.eyebrow}>
              <span className={styles.liveDot} aria-hidden="true" />
              A operação que lembra por você
            </div>
            <h1>
              Sua empresa não precisa de mais uma tela.
              <span> Precisa de uma rotina que se resolva.</span>
            </h1>
            <p className={styles.heroLead}>
              Clientes, cobranças, WhatsApp, PIX, financeiro e decisões em um só fluxo. Você vê o que importa. A Lembrado cuida do caminho até lá.
            </p>
            <div className={styles.heroActions}>
              <Link className={styles.primaryCta} href="/cadastro">
                Começar 7 dias grátis
                <ArrowRight aria-hidden="true" />
              </Link>
              <a className={styles.secondaryCta} href="#produto">
                Ver a rotina por dentro
                <ChevronRight aria-hidden="true" />
              </a>
            </div>
            <div className={styles.reassurance} aria-label="Condições do teste">
              <span><Check aria-hidden="true" /> Sem cartão</span>
              <span><Check aria-hidden="true" /> Configuração guiada</span>
              <span><Check aria-hidden="true" /> Cancele quando quiser</span>
            </div>
          </div>

          <div className={styles.heroProduct} aria-label="Exemplo ilustrativo da operação na Lembrado">
            <div className={styles.floatingNote}>
              <Zap aria-hidden="true" />
              <span><strong>12 tarefas</strong> resolvidas sem intervenção</span>
            </div>

            <div className={styles.cockpit}>
              <div className={styles.cockpitTopbar}>
                <div>
                  <span className={styles.microLabel}>Painel da operação</span>
                  <strong>Hoje</strong>
                </div>
                <span className={styles.onlineBadge}>
                  <span aria-hidden="true" /> Online
                </span>
              </div>

              <div className={styles.cockpitMetrics}>
                <article className={styles.primaryMetric}>
                  <div className={styles.metricIcon}><CircleDollarSign aria-hidden="true" /></div>
                  <span>Recebido hoje</span>
                  <strong>R$ 1.870</strong>
                  <small><ArrowRight aria-hidden="true" /> 14 confirmações</small>
                </article>
                <article className={styles.miniMetric}>
                  <span>Próximos 7 dias</span>
                  <strong>R$ 4.260</strong>
                  <div className={styles.miniBars} aria-hidden="true">
                    <i /><i /><i /><i /><i /><i />
                  </div>
                </article>
                <article className={styles.miniMetric}>
                  <span>Exigem atenção</span>
                  <strong className={styles.orangeText}>3 clientes</strong>
                  <small>priorizados na fila</small>
                </article>
              </div>

              <div className={styles.activityPanel}>
                <div className={styles.panelHeading}>
                  <div>
                    <span className={styles.microLabel}>A operação acontecendo</span>
                    <strong>Enquanto você trabalha no negócio</strong>
                  </div>
                  <span className={styles.illustrative}>Dados ilustrativos</span>
                </div>

                <div className={styles.activityList}>
                  <ActivityItem
                    time="08:00"
                    icon={SearchCheck}
                    title="Carteira revisada"
                    detail="18 vencimentos encontrados para hoje"
                    tone="blue"
                  />
                  <ActivityItem
                    time="08:07"
                    icon={MessageCircleMore}
                    title="Lembretes enviados"
                    detail="Fila concluída no WhatsApp principal"
                    tone="green"
                  />
                  <ActivityItem
                    time="10:32"
                    icon={CreditCard}
                    title="PIX confirmado"
                    detail="Cliente renovado e financeiro atualizado"
                    tone="yellow"
                  />
                  <ActivityItem
                    time="11:05"
                    icon={Bot}
                    title="Cliente atendido"
                    detail="Segunda via emitida pelo autoatendimento"
                    tone="orange"
                  />
                </div>
              </div>

              <div className={styles.cockpitFooter}>
                <span><HeartPulse aria-hidden="true" /> Operação saudável</span>
                <span>Última atualização agora</span>
              </div>
            </div>
          </div>
        </section>

        <div className={styles.signalStrip} aria-label="Áreas conectadas na Lembrado">
          <div>
            <span>Clientes</span><i aria-hidden="true" />
            <span>Cobranças</span><i aria-hidden="true" />
            <span>WhatsApp</span><i aria-hidden="true" />
            <span>PIX</span><i aria-hidden="true" />
            <span>Financeiro</span><i aria-hidden="true" />
            <span>Decisões</span>
          </div>
        </div>

        <section className={styles.problemSection}>
          <div className={styles.sectionIntro}>
            <span className={styles.sectionNumber}>01 / A dor real</span>
            <h2>O problema não é esquecer uma cobrança.</h2>
            <p>É a empresa inteira depender da sua memória para continuar girando.</p>
          </div>

          <div className={styles.beforeAfter}>
            <article className={styles.beforeCard}>
              <div className={styles.cardTopline}>
                <span>Sem Lembrado</span>
                <span className={styles.statusDanger}>Tudo depende de você</span>
              </div>
              <h3>Seu dia vira uma lista que nunca termina.</h3>
              <ul className={styles.taskList}>
                <li><span>01</span><p>Conferir quem vence hoje</p><em>pendente</em></li>
                <li><span>02</span><p>Copiar mensagem no WhatsApp</p><em>pendente</em></li>
                <li><span>03</span><p>Gerar e mandar o PIX</p><em>pendente</em></li>
                <li><span>04</span><p>Descobrir quem pagou</p><em>pendente</em></li>
                <li><span>05</span><p>Atualizar planilha e acesso</p><em>pendente</em></li>
                <li><span>06</span><p>Responder “quanto eu devo?”</p><em>de novo</em></li>
              </ul>
            </article>

            <div className={styles.switchBadge} aria-hidden="true">
              <RefreshCcw />
            </div>

            <article className={styles.afterCard}>
              <div className={styles.cardTopline}>
                <span>Com Lembrado</span>
                <span className={styles.statusSuccess}>Fluxo conectado</span>
              </div>
              <h3>Você começa o dia pela decisão, não pela tarefa.</h3>
              <div className={styles.priorityCard}>
                <span className={styles.priorityIcon}><BellRing aria-hidden="true" /></span>
                <div>
                  <small>Prioridade de agora</small>
                  <strong>3 clientes exigem atenção</strong>
                  <p>O restante da carteira já está seguindo a régua configurada.</p>
                </div>
                <ArrowRight aria-hidden="true" />
              </div>
              <div className={styles.resolvedGrid}>
                <div><CheckCircle2 aria-hidden="true" /><strong>Cobranças</strong><span>enviadas</span></div>
                <div><CheckCircle2 aria-hidden="true" /><strong>Pagamentos</strong><span>registrados</span></div>
                <div><CheckCircle2 aria-hidden="true" /><strong>Renovações</strong><span>atualizadas</span></div>
                <div><CheckCircle2 aria-hidden="true" /><strong>Clientes</strong><span>orientados</span></div>
              </div>
            </article>
          </div>
        </section>

        <section className={styles.flowSection} id="produto">
          <div className={styles.sectionIntroLight}>
            <span className={styles.sectionNumber}>02 / Um fluxo, não oito abas</span>
            <h2>Uma ferramenta ajuda. Um sistema que passa o bastão sozinho muda o jogo.</h2>
            <p>Cada etapa alimenta a próxima. Sem redigitar, reconciliar ou tentar lembrar onde a informação ficou.</p>
          </div>

          <div className={styles.flowRail}>
            {flow.map((item, index) => {
              const Icon = item.icon
              return (
                <div className={styles.flowItem} key={item.label}>
                  <span className={styles.flowIndex}>{String(index + 1).padStart(2, "0")}</span>
                  <span className={styles.flowIcon}><Icon aria-hidden="true" /></span>
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                  {index < flow.length - 1 && <ArrowRight className={styles.flowArrow} aria-hidden="true" />}
                </div>
              )
            })}
          </div>

          <div className={styles.flowOutcome}>
            <div>
              <Sparkles aria-hidden="true" />
              <span>O resultado</span>
            </div>
            <p>Menos tarefas repetidas. Menos cliente esquecido. Mais clareza para decidir onde agir.</p>
          </div>
        </section>

        <section className={styles.toolsSection} id="ferramentas">
          <div className={styles.toolsHeading}>
            <div className={styles.sectionIntro}>
              <span className={styles.sectionNumber}>03 / A caixa de ferramentas</span>
              <h2>Tudo que a rotina pede. No mesmo lugar.</h2>
            </div>
            <p className={styles.toolsLead}>
              Comece pelo essencial e ative novas camadas conforme a operação cresce. Sem trocar de sistema no meio do caminho.
            </p>
          </div>

          <div className={styles.toolGrid}>
            {tools.map((tool, index) => {
              const Icon = tool.icon
              return (
                <article className={`${styles.toolCard} ${styles[tool.accent]}`} key={tool.title}>
                  <div className={styles.toolCardTop}>
                    <span className={styles.toolIcon}><Icon aria-hidden="true" /></span>
                    <span className={styles.toolNumber}>{String(index + 1).padStart(2, "0")}</span>
                  </div>
                  <span className={styles.toolTag}>{tool.tag}</span>
                  <h3>{tool.title}</h3>
                  <p>{tool.description}</p>
                </article>
              )
            })}
          </div>
        </section>

        <section className={styles.showcaseSection}>
          <div className={styles.sectionIntro}>
            <span className={styles.sectionNumber}>04 / Feita para trabalhar de verdade</span>
            <h2>Automação sem caixa-preta. Inteligência sem chute.</h2>
            <p>Você mantém o controle das decisões; a plataforma assume o trabalho repetitivo ao redor delas.</p>
          </div>

          <div className={styles.showcaseGrid}>
            <article className={`${styles.showcaseCard} ${styles.showcaseWide}`}>
              <div className={styles.showcaseCopy}>
                <span className={styles.featureKicker}><ShieldCheck aria-hidden="true" /> Antes de enviar</span>
                <h3>Simule, revise e só então ative.</h3>
                <p>A cobrança inteligente mostra clientes elegíveis, perfis e etapas antes de qualquer decisão de envio.</p>
              </div>
              <div className={styles.simulationMock} aria-label="Exemplo de uma simulação de cobrança">
                <div className={styles.simHeader}>
                  <div><small>Simulação segura</small><strong>Prévia da régua</strong></div>
                  <span>nenhuma mensagem enviada</span>
                </div>
                <div className={styles.simStats}>
                  <div><span>Elegíveis</span><strong>46</strong></div>
                  <div><span>Em revisão</span><strong>3</strong></div>
                  <div><span>Protegidos</span><strong>7</strong></div>
                </div>
                <div className={styles.simRow}><span className={styles.avatar}>AM</span><p><strong>Ana Martins</strong><small>Perfil pontual · D-1</small></p><span className={styles.ready}>Pronto</span></div>
                <div className={styles.simRow}><span className={styles.avatar}>CS</span><p><strong>Caio Souza</strong><small>Revisar telefone</small></p><span className={styles.review}>Revisar</span></div>
              </div>
            </article>

            <article className={styles.showcaseCard}>
              <div className={styles.showcaseCopy}>
                <span className={styles.featureKicker}><FileCheck2 aria-hidden="true" /> Sem trabalho duplicado</span>
                <h3>O pagamento atualiza o restante.</h3>
                <p>Confirmação, histórico, status financeiro e próxima renovação seguem juntos.</p>
              </div>
              <div className={styles.paymentRoute}>
                <span><QrCode aria-hidden="true" /><small>PIX</small></span>
                <i aria-hidden="true" />
                <span><CheckCircle2 aria-hidden="true" /><small>Pago</small></span>
                <i aria-hidden="true" />
                <span><RefreshCcw aria-hidden="true" /><small>Renovado</small></span>
              </div>
            </article>

            <article className={styles.showcaseCard}>
              <div className={styles.showcaseCopy}>
                <span className={styles.featureKicker}><BrainCircuit aria-hidden="true" /> Decisão com evidência</span>
                <h3>Veja primeiro o que muda o resultado.</h3>
                <p>O Painel, o Analytics e a Intelligence organizam riscos e oportunidades em próximas ações.</p>
              </div>
              <div className={styles.insightCard}>
                <div><span className={styles.insightPulse} aria-hidden="true" /><small>Prioridade detectada</small></div>
                <strong>5 clientes concentram o risco desta semana</strong>
                <p>Revise a fila antes do próximo ciclo de cobrança.</p>
                <span className={styles.insightAction}>Abrir área relacionada <ArrowRight aria-hidden="true" /></span>
              </div>
            </article>
          </div>
        </section>

        <section className={styles.rolesSection}>
          <div className={styles.rolesCopy}>
            <span className={styles.sectionNumber}>05 / Uma operação completa</span>
            <h2>Quatro funções da rotina. Trabalhando como uma só.</h2>
            <p>
              A Lembrado não tenta substituir sua decisão. Ela prepara o terreno para que você decida menos vezes — e melhor.
            </p>
            <Link className={styles.darkCta} href="/cadastro">
              Colocar minha operação em movimento <ArrowRight aria-hidden="true" />
            </Link>
          </div>

          <div className={styles.rolesStack}>
            <RoleCard icon={MessageCircleMore} number="01" title="Assistente de cobrança" text="Lembra, envia e acompanha a régua configurada." />
            <RoleCard icon={ReceiptText} number="02" title="Operador financeiro" text="Organiza confirmações, pendências e histórico." />
            <RoleCard icon={BarChart3} number="03" title="Analista da operação" text="Mostra movimento, risco, projeção e contexto." />
            <RoleCard icon={Wrench} number="04" title="Monitor operacional" text="Expõe filas, conexões e pontos que pedem ação." />
          </div>
        </section>

        <section className={styles.pricingSection} id="planos">
          <div className={styles.pricingHeading}>
            <div className={styles.sectionIntro}>
              <span className={styles.sectionNumber}>06 / Comece no seu tamanho</span>
              <h2>O preço é simples. A rotina que você recupera, não.</h2>
            </div>
            <div className={styles.trialStamp}>
              <span>7</span>
              <p>dias grátis<br /><strong>sem cartão</strong></p>
            </div>
          </div>

          <div className={styles.priceGrid}>
            {prices.map((plan) => (
              <article className={`${styles.priceCard}${plan.featured ? ` ${styles.featuredPrice}` : ""}`} key={plan.name}>
                {plan.featured && <span className={styles.planFlag}>Para automatizar o fluxo</span>}
                <div className={styles.priceTop}>
                  <div><span>Plano</span><h3>{plan.name}</h3></div>
                  <p>{plan.description}</p>
                </div>
                <div className={styles.priceValue}>
                  <span>R$</span><strong>{plan.price}</strong><small>/mês</small>
                </div>
                <div className={styles.planLimits}>
                  <span><Users aria-hidden="true" /> {plan.limit}</span>
                  <span><MessageCircleMore aria-hidden="true" /> {plan.whatsapp}</span>
                </div>
                <ul>
                  {plan.features.map((feature) => <li key={feature}><Check aria-hidden="true" /> {feature}</li>)}
                </ul>
                <Link className={plan.featured ? styles.priceCtaFeatured : styles.priceCta} href="/cadastro">
                  {plan.cta} <ArrowRight aria-hidden="true" />
                </Link>
              </article>
            ))}
          </div>
          <p className={styles.pricingNote}>Todos os valores são mensais. Você escolhe o plano após conhecer a plataforma.</p>
        </section>

        <section className={styles.faqSection} id="duvidas">
          <div className={styles.faqHeading}>
            <span className={styles.sectionNumber}>07 / Antes de começar</span>
            <h2>Perguntas honestas. Respostas diretas.</h2>
            <p>Ainda ficou algo? Crie sua conta e conheça a plataforma sem informar cartão.</p>
          </div>
          <div className={styles.faqList}>
            {faqs.map((faq, index) => (
              <details className={styles.faqItem} key={faq.question}>
                <summary>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  {faq.question}
                  <span className={styles.faqPlus} aria-hidden="true">+</span>
                </summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className={styles.finalCta}>
          <div className={styles.finalMark} aria-hidden="true">
            <BrandMark size={82} background="#f7f4ea" accent="#44d59a" />
          </div>
          <span className={styles.finalEyebrow}>A próxima cobrança já tem data.</span>
          <h2>Ela não precisa ocupar a sua cabeça.</h2>
          <p>Abra a Lembrado, conecte sua rotina e veja o que muda quando cada tarefa sabe qual é o próximo passo.</p>
          <div className={styles.finalActions}>
            <Link className={styles.finalButton} href="/cadastro">
              Começar meus 7 dias grátis <ArrowRight aria-hidden="true" />
            </Link>
            <Link className={styles.finalLogin} href="/login">Já tenho uma conta</Link>
          </div>
          <div className={styles.finalTrust}>
            <span><ShieldCheck aria-hidden="true" /> Sem cartão</span>
            <span><PackageCheck aria-hidden="true" /> Dados exportáveis</span>
            <span><Rocket aria-hidden="true" /> Pronto para crescer</span>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerMain}>
          <div>
            <a className={styles.footerBrand} href="#topo">
              <BrandMark size={32} />
              <BrandName />
            </a>
            <p>Clientes, cobranças e decisões<br />no mesmo ritmo.</p>
          </div>
          <div className={styles.footerLinks}>
            <div><strong>Produto</strong><a href="#produto">Como funciona</a><a href="#ferramentas">Ferramentas</a><a href="#planos">Planos</a></div>
            <div><strong>Acesso</strong><Link href="/cadastro">Criar conta</Link><Link href="/login">Entrar</Link></div>
            <div><strong>Legal</strong><Link href="/termos">Termos de uso</Link><Link href="/privacidade">Privacidade</Link></div>
          </div>
        </div>
        <div className={styles.footerBottom}>
          <span>© 2026 Lembrado</span>
          <span>Feito para operações recorrentes no Brasil.</span>
        </div>
      </footer>
    </div>
  )
}

function ActivityItem({
  time,
  icon: Icon,
  title,
  detail,
  tone,
}: {
  time: string
  icon: LucideIcon
  title: string
  detail: string
  tone: "green" | "orange" | "blue" | "yellow"
}) {
  return (
    <div className={styles.activityItem}>
      <time>{time}</time>
      <span className={`${styles.activityIcon} ${styles[tone]}`}><Icon aria-hidden="true" /></span>
      <p><strong>{title}</strong><small>{detail}</small></p>
      <CheckCircle2 className={styles.activityCheck} aria-hidden="true" />
    </div>
  )
}

function RoleCard({ icon: Icon, number, title, text }: { icon: LucideIcon; number: string; title: string; text: string }) {
  return (
    <article className={styles.roleCard}>
      <span className={styles.roleNumber}>{number}</span>
      <span className={styles.roleIcon}><Icon aria-hidden="true" /></span>
      <div><h3>{title}</h3><p>{text}</p></div>
      <CheckCircle2 aria-hidden="true" />
    </article>
  )
}
