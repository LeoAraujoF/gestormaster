import Link from "next/link"
import { 
  ArrowRight, 
  Bot, 
  ShieldCheck, 
  Zap, 
  Activity, 
  CheckCircle2, 
  MessageSquare,
  TrendingUp,
  Users,
  Smartphone,
  ChevronRight,
  Sparkles,
  BarChart3,
  CalendarDays,
  CreditCard
} from "lucide-react"

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-zinc-50 font-sans selection:bg-sky-500/30 overflow-hidden">
      
      {/* ---------------- NAVBAR ---------------- */}
      <nav className="fixed top-0 w-full z-50 border-b border-white/[0.05] bg-[#0A0A0A]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
              <span className="text-xs font-black text-white tracking-tighter">GM</span>
            </div>
            <span className="font-bold text-lg tracking-tight">Gestor Master</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-zinc-400">
            <Link href="#recursos" className="hover:text-white transition-colors">Recursos</Link>
            <Link href="#solucao" className="hover:text-white transition-colors">Solução</Link>
            <Link href="#planos" className="hover:text-white transition-colors">Planos</Link>
          </div>
          <div className="flex items-center gap-4 text-sm font-medium">
            <Link href="/login" className="text-zinc-400 hover:text-white transition-colors hidden sm:block">
              Acessar Painel
            </Link>
            <Link href="/cadastro" className="group relative inline-flex items-center justify-center px-5 py-2 font-medium text-white transition-all bg-sky-500 rounded-full hover:bg-sky-400">
              <span className="relative z-10 flex items-center gap-2">
                Criar Conta
              </span>
            </Link>
          </div>
        </div>
      </nav>

      {/* ---------------- HERO SECTION ---------------- */}
      <main className="relative pt-32 pb-20 px-6 lg:pt-40 lg:pb-32 max-w-7xl mx-auto">
        {/* Efeitos de Luz de Fundo */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-[1000px] h-[500px] bg-sky-500/10 blur-[150px] rounded-[100%] pointer-events-none -z-10" />
        <div className="absolute top-40 right-0 w-[400px] h-[400px] bg-emerald-500/10 blur-[150px] rounded-full pointer-events-none -z-10" />

        <div className="grid lg:grid-cols-2 gap-16 items-center">
          
          {/* Coluna de Texto */}
          <div className="text-left relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/10 text-sm text-zinc-300 mb-8 backdrop-blur-md">
              <Sparkles className="w-4 h-4 text-sky-400" />
              <span>O fim das cobranças manuais</span>
            </div>
            
            <h1 className="text-5xl lg:text-[4rem] font-bold tracking-tight mb-6 leading-[1.1] text-white">
              Recupere caixa com <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-emerald-400">cobranças automáticas</span> no WhatsApp.
            </h1>
            
            <p className="text-lg lg:text-xl text-zinc-400 mb-10 leading-relaxed max-w-lg">
              O Gestor Master unifica seu CRM financeiro e seu disparador de mensagens. Envie lembretes, gere faturas e fidelize clientes enquanto você dorme.
            </p>
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <Link href="/cadastro" className="w-full sm:w-auto px-8 py-4 bg-white text-black rounded-full font-bold transition-all hover:bg-zinc-200 flex items-center justify-center gap-2">
                Começar Grátis <ArrowRight className="w-4 h-4" />
              </Link>
              <div className="flex items-center gap-4 text-sm text-zinc-500 ml-2">
                <div className="flex -space-x-2">
                  {[1,2,3,4].map(i => (
                    <div key={i} className={`w-8 h-8 rounded-full border-2 border-[#0A0A0A] bg-zinc-800 flex items-center justify-center opacity-${100 - (i*10)}`}>
                      <User className="w-4 h-4 text-zinc-400" />
                    </div>
                  ))}
                </div>
                <div className="flex flex-col">
                  <span className="text-zinc-300 font-medium">+500 empresas</span>
                  <span>já automatizaram</span>
                </div>
              </div>
            </div>
          </div>

          {/* Mockup Interativo / Visual da UI */}
          <div className="relative z-10 w-full aspect-square md:aspect-auto md:h-[600px] flex items-center justify-center">
            {/* O frame do Mockup */}
            <div className="relative w-full max-w-[500px] rounded-2xl bg-zinc-900 border border-white/10 shadow-2xl shadow-black overflow-hidden p-6 transform rotate-2 hover:rotate-0 transition-transform duration-500">
              
              {/* Fake Header */}
              <div className="flex justify-between items-center mb-8 border-b border-white/5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-sky-500 to-blue-600 flex items-center justify-center text-white">GM</div>
                  <div>
                    <h3 className="font-semibold text-white leading-none">Dashboard</h3>
                    <span className="text-xs text-zinc-500">Visão Geral</span>
                  </div>
                </div>
                <div className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-medium border border-emerald-500/20">
                  WhatsApp Conectado
                </div>
              </div>

              {/* Fake Metrics */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-4 rounded-xl bg-zinc-950 border border-white/5">
                  <div className="text-zinc-400 text-sm mb-2">Receita do Mês</div>
                  <div className="text-2xl font-bold text-white">R$ 14.850<span className="text-sky-500 text-sm ml-1">↑ 12%</span></div>
                </div>
                <div className="p-4 rounded-xl bg-zinc-950 border border-white/5">
                  <div className="text-zinc-400 text-sm mb-2">Mensagens Enviadas</div>
                  <div className="text-2xl font-bold text-white">4.392</div>
                </div>
              </div>

              {/* Fake Log */}
              <div className="space-y-3">
                <div className="text-sm font-medium text-zinc-400 mb-2">Últimos Disparos (Automático)</div>
                {[
                  { name: "Carlos Silva", status: "Fatura Vence Hoje", time: "Há 2 min", color: "text-amber-400", bg: "bg-amber-400/10" },
                  { name: "Mariana Souza", status: "Agradecimento", time: "Há 15 min", color: "text-sky-400", bg: "bg-sky-400/10" },
                  { name: "Tech Solutions", status: "Cobrança 3 Dias", time: "Há 1 hora", color: "text-rose-400", bg: "bg-rose-400/10" }
                ].map((log, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-zinc-950/50 border border-white/[0.02]">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center">
                        <MessageSquare className="w-4 h-4 text-zinc-400" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-zinc-200">{log.name}</div>
                        <div className={`text-xs ${log.color}`}>{log.status}</div>
                      </div>
                    </div>
                    <div className="text-xs text-zinc-500">{log.time}</div>
                  </div>
                ))}
              </div>

              {/* Elementos flutuantes (Decoração) */}
              <div className="absolute -right-12 top-20 p-4 bg-zinc-900 border border-white/10 rounded-2xl shadow-xl flex items-center gap-3 animate-[bounce_5s_ease-in-out_infinite]">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                </div>
                <div>
                  <div className="text-sm font-bold text-white">PIX Recebido</div>
                  <div className="text-xs text-zinc-400">R$ 150,00</div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </main>

      {/* ---------------- LOGOS / SOCIAL PROOF ---------------- */}
      <section className="py-10 border-y border-white/5 bg-white/[0.01]">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p className="text-sm text-zinc-500 font-medium mb-6 uppercase tracking-widest">Integrações Oficiais Prontas para Uso</p>
          <div className="flex flex-wrap justify-center gap-8 md:gap-16 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
            {/* Usando texto estilizado para simular logos devido a falta de imagens SVG prontas no projeto */}
            <div className="flex items-center gap-2 font-bold text-xl"><Zap className="text-blue-500" /> Stripe</div>
            <div className="flex items-center gap-2 font-bold text-xl"><MessageSquare className="text-green-500" /> Evolution API</div>
            <div className="flex items-center gap-2 font-bold text-xl"><CreditCard className="text-emerald-500" /> PIX (Copia e Cola)</div>
            <div className="flex items-center gap-2 font-bold text-xl"><Bot className="text-purple-500" /> BullMQ Queues</div>
          </div>
        </div>
      </section>

      {/* ---------------- BENTO GRID (RECURSOS) ---------------- */}
      <section id="recursos" className="py-32 max-w-7xl mx-auto px-6">
        <div className="mb-16">
          <h2 className="text-3xl md:text-5xl font-bold mb-6 text-white leading-tight">
            Tudo o que você precisa,<br />
            <span className="text-zinc-500">em uma única plataforma.</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Card 1 - Largo */}
          <div className="md:col-span-2 p-8 rounded-3xl bg-gradient-to-br from-zinc-900 to-zinc-950 border border-white/10 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-sky-500/10 blur-[80px] group-hover:bg-sky-500/20 transition-all" />
            <Bot className="w-12 h-12 text-sky-400 mb-6" />
            <h3 className="text-2xl font-bold text-white mb-3">Robô de Automação de Cobranças</h3>
            <p className="text-zinc-400 leading-relaxed max-w-md">
              Crie regras personalizadas. O sistema detecta quem vence hoje, amanhã ou quem está atrasado, e envia uma mensagem humanizada com o código PIX copia e cola direto no WhatsApp da pessoa.
            </p>
          </div>

          {/* Card 2 - Quadrado */}
          <div className="p-8 rounded-3xl bg-zinc-900 border border-white/10 group">
            <Zap className="w-12 h-12 text-emerald-400 mb-6" />
            <h3 className="text-xl font-bold text-white mb-3">Anti-Ban (Warmup)</h3>
            <p className="text-zinc-400 leading-relaxed text-sm">
              Proteja seu número principal. Nosso módulo de aquecimento simula conversas humanas para blindar seu chip contra bloqueios do WhatsApp.
            </p>
          </div>

          {/* Card 3 - Quadrado */}
          <div className="p-8 rounded-3xl bg-zinc-900 border border-white/10 group">
            <BarChart3 className="w-12 h-12 text-purple-400 mb-6" />
            <h3 className="text-xl font-bold text-white mb-3">CRM Financeiro Real</h3>
            <p className="text-zinc-400 leading-relaxed text-sm">
              Abandone as planilhas. Saiba a sua previsão de lucro bruto e líquido, veja quais clientes deram churn e tenha o controle do caixa do mês.
            </p>
          </div>

          {/* Card 4 - Largo */}
          <div className="md:col-span-2 p-8 rounded-3xl bg-zinc-900 border border-white/10 relative overflow-hidden flex flex-col md:flex-row gap-8 items-center justify-between">
            <div>
              <Users className="w-12 h-12 text-rose-400 mb-6" />
              <h3 className="text-2xl font-bold text-white mb-3">Gestão de Clientes e Importação (CSV)</h3>
              <p className="text-zinc-400 leading-relaxed max-w-sm">
                Cadastre clientes, atrele serviços e campanhas promocionais. Se você já tem uma base antiga, importe centenas de contatos via planilha CSV em segundos e comece a automatizar.
              </p>
            </div>
            {/* Visual Mini */}
            <div className="w-full md:w-64 h-32 bg-zinc-950 rounded-xl border border-white/5 p-4 flex flex-col justify-center gap-3">
               <div className="flex items-center gap-2 mb-2">
                 <div className="w-6 h-6 rounded bg-emerald-500/20 flex items-center justify-center text-emerald-500 text-[10px] font-bold">CSV</div>
                 <span className="text-xs text-zinc-300 font-medium">import_clientes.csv</span>
               </div>
               <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden"><div className="w-[100%] h-full bg-emerald-500 rounded-full" /></div>
               <div className="flex justify-between text-xs text-zinc-500"><span>Processando...</span><span>342 importados</span></div>
            </div>
          </div>

        </div>
      </section>

      {/* ---------------- COMPARAÇÃO ---------------- */}
      <section id="solucao" className="py-24 bg-zinc-900/50">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Pare de perder dinheiro e tempo</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* O Jeito Velho */}
            <div className="p-8 rounded-3xl bg-red-500/5 border border-red-500/10">
              <h3 className="text-xl font-semibold text-red-400 mb-6 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center text-xs">✕</span>
                O Jeito Antigo
              </h3>
              <ul className="space-y-4">
                {["Lembrar de cobrar 1 a 1", "Bloqueios frequentes de WhatsApp", "Planilhas confusas que quebram", "Inadimplência alta por esquecimento", "Trabalhar até nos finais de semana"].map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-zinc-400">
                    <span className="mt-1 w-1.5 h-1.5 rounded-full bg-red-500/50 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* O Jeito Gestor Master */}
            <div className="p-8 rounded-3xl bg-sky-500/5 border border-sky-500/20 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/10 blur-[40px]" />
              <h3 className="text-xl font-semibold text-sky-400 mb-6 flex items-center gap-2">
                <CheckCircle2 className="w-6 h-6" />
                Com o Gestor Master
              </h3>
              <ul className="space-y-4">
                {["Cobranças no Piloto Automático", "Anti-ban e Roleta de Chips nativo", "Painel Financeiro em Tempo Real", "Redução de até 80% da Inadimplência", "Mais tempo livre para focar em vender"].map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-white">
                    <CheckCircle2 className="mt-0.5 w-4 h-4 text-sky-500 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- PRICING ---------------- */}
      <section id="planos" className="py-32 relative overflow-hidden">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Um investimento que se paga sozinho</h2>
            <p className="text-zinc-400 text-lg">Sem taxas escondidas. Cancele quando quiser.</p>
          </div>
          
          <div className="p-1 lg:p-1 rounded-[2.5rem] bg-gradient-to-b from-sky-500/30 to-zinc-900 border border-white/5 max-w-md mx-auto">
            <div className="bg-[#0A0A0A] rounded-[2.4rem] p-8 lg:p-12 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-full h-1 bg-gradient-to-r from-sky-500 to-blue-500" />
              
              <div className="mb-8">
                <span className="px-4 py-1.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 text-sm font-bold mb-6 inline-flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" /> Oferta por Tempo Limitado
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-black tracking-tight text-white">R$ 20</span>
                  <span className="text-zinc-500 font-medium">/mês</span>
                </div>
              </div>

              <ul className="space-y-4 mb-10">
                {[
                  "Clientes Ilimitados",
                  "Até 3 Conexões WhatsApp",
                  "Automação Liberada",
                  "Aquecedor de Chip (Anti-Ban) e Outros"
                ].map((feature, i) => (
                  <li key={i} className="flex items-center gap-3 text-zinc-300">
                    <CheckCircle2 className="w-5 h-5 text-sky-500" /> {feature}
                  </li>
                ))}
              </ul>

              <Link href="/cadastro" className="block w-full py-4 text-center bg-white text-black font-bold rounded-2xl hover:bg-zinc-200 transition-all hover:scale-[1.02] active:scale-95">
                Começar Agora
              </Link>
              <p className="text-center text-xs text-zinc-500 mt-4">Liberação imediata após a assinatura.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- FOOTER ---------------- */}
      <footer className="py-12 border-t border-white/5 bg-[#0A0A0A]">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-sky-500 flex items-center justify-center">
              <span className="text-[10px] font-black text-white tracking-tighter">GM</span>
            </div>
            <span className="font-bold text-white">Gestor Master</span>
          </div>
          
          <div className="flex gap-6 text-sm text-zinc-500">
            <Link href="/termos" className="hover:text-white transition-colors">Termos de Uso</Link>
            <Link href="/privacidade" className="hover:text-white transition-colors">Privacidade</Link>
            <Link href="/login" className="hover:text-white transition-colors">Login Admin</Link>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-6 mt-8 text-center md:text-left text-xs text-zinc-600">
          &copy; {new Date().getFullYear()} Gestor Master Tecnologia. Todos os direitos reservados. 
          Este site não faz parte do website do Facebook ou Meta Inc.
        </div>
      </footer>
    </div>
  )
}

// Dummy icon to fill out the user profile picture list without error
function User(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}
