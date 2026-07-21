"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Fraunces, IBM_Plex_Mono } from "next/font/google"
import { BrandName } from "@/components/brand-mark"

const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--lp-serif",
})

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--lp-mono",
})

/* ─── conversa do hero (mensagem por mensagem) ─── */
type ChatMsg = {
  who: "in" | "out" | "sys"
  pix?: boolean
  t?: string
  body: React.ReactNode
}

const CHAT: ChatMsg[] = [
  { who: "out", t: "22:41", body: <>Oi, Carlos! Tudo bem? 👋 Seu plano <b>Premium</b> da Master TV vence <b>hoje</b>.</> },
  { who: "out", t: "22:41", body: <>Quer renovar agora e garantir mais 30 dias sem cortar o sinal?</> },
  { who: "in", t: "22:44", body: <>opa! quanto tá mesmo?</> },
  { who: "out", t: "22:44", body: <>R$ 35,00 — igual mês passado 😉 Segue o PIX copia e cola:</> },
  { who: "out", pix: true, t: "22:44", body: <>00020126360014BR.GOV.BCB.PIX0114+5511988001234520400005303986540535.005802BR5912LEMBRADO6009SAO PAULO62070503***6304A1B2<span className="copy-tag">TOCAR PARA COPIAR</span></> },
  { who: "in", t: "22:46", body: <>paguei ✅</> },
  { who: "out", t: "22:46", body: <>Pagamento confirmado, Carlos! 🎉 Acesso renovado até <b>05/08</b>. Qualquer coisa é só chamar!</> },
  { who: "sys", body: <>LEMBRADO · RENOVAÇÃO REGISTRADA · +R$ 35,00</> },
]

export function LandingClient() {
  const rootRef = useRef<HTMLDivElement>(null)
  const phoneRef = useRef<HTMLDivElement>(null)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const [scrolled, setScrolled] = useState(false)
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [chatCount, setChatCount] = useState(0)
  const [typing, setTyping] = useState(false)

  /* nav: hairline ao rolar */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  /* reveals + contadores + mockups + botões magnéticos */
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const cleanups: (() => void)[] = []

    // reveal por scroll
    const rio = new IntersectionObserver(
      (es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("on"); rio.unobserve(e.target) } }),
      { threshold: 0.15, rootMargin: "0px 0px -40px" }
    )
    root.querySelectorAll(".rv").forEach((el) => rio.observe(el))
    cleanups.push(() => rio.disconnect())

    // contadores animados
    const fmtBR = (n: number) => n.toLocaleString("pt-BR")
    const cio = new IntersectionObserver(
      (es) => es.forEach((e) => {
        if (!e.isIntersecting) return
        cio.unobserve(e.target)
        const el = e.target as HTMLElement
        const target = parseFloat(el.dataset.count || "0")
        const dec = +(el.dataset.dec || 0)
        const t0 = performance.now()
        const dur = 1400
        const tick = (t: number) => {
          const p = Math.min((t - t0) / dur, 1)
          const v = target * (1 - Math.pow(1 - p, 3))
          el.textContent = dec ? v.toFixed(dec).replace(".", ",") : fmtBR(Math.round(v))
          if (p < 1) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }),
      { threshold: 0.6 }
    )
    root.querySelectorAll("[data-count]").forEach((el) => cio.observe(el))
    cleanups.push(() => cio.disconnect())

    // mockups: dispara animações quando visíveis
    const mio = new IntersectionObserver(
      (es) => es.forEach((e) => {
        if (!e.isIntersecting) return
        mio.unobserve(e.target)
        const el = e.target as HTMLElement
        el.classList.add("on")
        if (el.dataset.mock === "queue") {
          el.querySelectorAll(".q-row").forEach((r, i) =>
            setTimeout(() => { if (i < 2) r.classList.add("paid") }, 600 + i * 450))
        }
        if (el.dataset.mock === "ruler") {
          el.querySelectorAll(".r-step").forEach((s, i) =>
            setTimeout(() => s.classList.add("hit"), 450 + i * 550))
        }
      }),
      { threshold: 0.4 }
    )
    root.querySelectorAll(".mock").forEach((el) => mio.observe(el))
    cleanups.push(() => mio.disconnect())

    // botões magnéticos (só pointer fino)
    if (window.matchMedia("(pointer:fine)").matches) {
      root.querySelectorAll<HTMLElement>(".magnetic").forEach((btn) => {
        const move = (e: MouseEvent) => {
          const r = btn.getBoundingClientRect()
          const x = (e.clientX - r.left - r.width / 2) * 0.18
          const y = (e.clientY - r.top - r.height / 2) * 0.3
          btn.style.transform = `translate(${x}px,${y}px)`
        }
        const leave = () => { btn.style.transform = "" }
        btn.addEventListener("mousemove", move)
        btn.addEventListener("mouseleave", leave)
        cleanups.push(() => { btn.removeEventListener("mousemove", move); btn.removeEventListener("mouseleave", leave) })
      })
    }

    return () => cleanups.forEach((fn) => fn())
  }, [])

  /* conversa do WhatsApp: inicia ao entrar na tela, roda em loop */
  useEffect(() => {
    const phone = phoneRef.current
    if (!phone) return
    const timers = timersRef.current
    const later = (fn: () => void, ms: number) => { timers.push(setTimeout(fn, ms)) }

    const play = (i: number) => {
      if (i >= CHAT.length) {
        later(() => { setChatCount(0); play(0) }, 6000)
        return
      }
      const m = CHAT[i]
      const delay = m.who === "in" ? 1500 : m.pix ? 900 : 1100
      if (m.who === "out") {
        setTyping(true)
        later(() => { setTyping(false); setChatCount(i + 1); play(i + 1) }, delay)
      } else {
        later(() => { setChatCount(i + 1); play(i + 1) }, delay)
      }
    }

    const io = new IntersectionObserver((es, obs) => {
      if (es[0].isIntersecting) { obs.disconnect(); later(() => play(0), 600) }
    }, { threshold: 0.35 })
    io.observe(phone)

    return () => { io.disconnect(); timers.forEach(clearTimeout); timers.length = 0 }
  }, [])

  return (
    <div ref={rootRef} className={`lp ${fraunces.variable} ${plexMono.variable}`}>
      <div className="grain" aria-hidden="true" />

      {/* símbolo da marca: conversa enviada e confirmação recebida */}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <defs>
          <symbol id="lembrado-mark" viewBox="0 0 132 132">
            <rect x="9" y="9" width="114" height="114" rx="34" fill="#176B4D" />
            <path d="M39 39h54a18 18 0 0 1 18 18v27a18 18 0 0 1-18 18H65L45 116l4-14H39a18 18 0 0 1-18-18V57a18 18 0 0 1 18-18Z" fill="#FAF8F2" />
            <path d="m47 70 14 14 27-31" fill="none" stroke="#176B4D" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="104" cy="31" r="9" fill="#45D49A" stroke="#176B4D" strokeWidth="5" />
          </symbol>
        </defs>
      </svg>

      {/* ═══ NAV ═══ */}
      <nav className={scrolled ? "scrolled" : undefined}>
        <div className="wrap nav-in">
          <a className="logo" href="#topo" aria-label="Lembrado — início">
            <svg width="26" height="26" viewBox="0 0 132 132" aria-hidden="true"><use href="#lembrado-mark" /></svg>
            <BrandName as="b" />
          </a>
          <div className="nav-links">
            <a href="#como-funciona">Como funciona</a>
            <a href="#recursos">Recursos</a>
            <a href="#preco">Preço</a>
          </div>
          <div className="nav-right">
            <Link href="/login" className="nav-entrar">Entrar</Link>
            <Link className="btn sm magnetic" href="/cadastro">Testar grátis</Link>
          </div>
        </div>
      </nav>

      {/* ═══ HERO ═══ */}
      <header className="hero" id="topo">
        <div className="wrap hero-grid">
          <div>
            <span className="pill rv"><span className="dot" />Cobrança automática no WhatsApp</span>
            <h1 className="rv d1">Avisar tarde é o jeito mais caro de <em>perder um cliente.</em></h1>
            <p className="sub rv d2">A Lembrado avisa, cobra e confirma o pagamento pelo WhatsApp — <b>sozinha</b>. Sua carteira registra cada centavo que entra e sai. Você só vê o PIX cair.</p>
            <div className="hero-cta rv d3">
              <Link className="btn magnetic" href="/cadastro">Testar grátis por 7 dias <span className="arr">→</span></Link>
              <span className="cta-note">sem cartão · cancele quando quiser</span>
            </div>
            <div className="hero-ledger rv d3">
              <div className="hl-item">
                <span className="microlabel">Vendas recuperadas</span>
                <span className="num g">R$ <span data-count="4.2" data-dec="1" /> mi</span>
              </div>
              <div className="hl-item">
                <span className="microlabel">Cobranças / dia</span>
                <span className="num"><span data-count="12480" /></span>
              </div>
              <div className="hl-item">
                <span className="microlabel">Taxa de entrega</span>
                <span className="num"><span data-count="98.3" data-dec="1" />%</span>
              </div>
            </div>
          </div>

          <div className="phone-col rv d2">
            <div>
              <div className="phone" ref={phoneRef}>
                <div className="screen">
                  <div className="wa-head">
                    <div className="wa-ava">CA</div>
                    <div>
                      <div className="wa-name">Carlos Andrade</div>
                      <div className="wa-status">online</div>
                    </div>
                  </div>
                  <div className="wa-body">
                    <span className="chip-date">Hoje</span>
                    {CHAT.slice(0, chatCount).map((m, i) =>
                      m.who === "sys" ? (
                        <div key={i} className="sys-chip">{m.body}</div>
                      ) : (
                        <div key={i} className={`msg ${m.who}${m.pix ? " pix-block" : ""}`}>
                          {m.body}
                          <span className="t">{m.t}{m.who === "out" && <> <span className="tick">✓✓</span></>}</span>
                        </div>
                      )
                    )}
                    {typing && <div className="typing"><i /><i /><i /></div>}
                  </div>
                </div>
              </div>
              <p className="phone-cap">Conversa real da automação · <b>venda fechada em 1min 12s</b></p>
            </div>
          </div>
        </div>
      </header>

      {/* ═══ PROVA SOCIAL ═══ */}
      <div className="proof">
        <div className="wrap">
          <span className="microlabel">Quem já cobra no automático</span>
          <div className="marquee" aria-hidden="true">
            {[0, 1].map((k) => (
              <div className="mq-track" key={k}>
                <span className="mq-logo lg-1">PlayNet Brasil</span>
                <span className="mq-logo lg-2">Conecta·TV</span>
                <span className="mq-logo lg-3"><span className="sq" />SinalForte</span>
                <span className="mq-logo lg-4">MegaPlay Recife</span>
                <span className="mq-logo lg-5">TopStream</span>
              </div>
            ))}
          </div>
          <p className="proof-stat"><span className="num">R$ 4,2 milhões</span> em vendas recuperadas para gestores de assinatura em todo o Brasil.</p>
        </div>
      </div>

      {/* ═══ 01 · PROBLEMA ═══ */}
      <section id="problema">
        <div className="wrap">
          <div className="sec-head rv">
            <span className="sec-idx">01</span>
            <h2>Onde o seu faturamento <em>vaza</em></h2>
            <p className="sec-sub">Três buracos no caixa que toda operação de assinatura conhece de cor.</p>
          </div>
          <div className="dores">
            <article className="dor rv">
              <span className="microlabel">Débito nº 1</span>
              <h3>A planilha sabe o vencimento. O cliente, não.</h3>
              <p>Sem aviso, a fatura vira surpresa — e surpresa vira cancelamento. O cliente não abandona você: ele só esquece.</p>
              <span className="ledger-line" />
            </article>
            <article className="dor rv d1">
              <span className="microlabel">Débito nº 2</span>
              <h3>Cobrar um por um não escala.</h3>
              <p>Com 80 clientes, são horas por dia copiando mensagem, colando chave PIX e torcendo para não pular ninguém.</p>
              <span className="ledger-line" />
            </article>
            <article className="dor rv d2">
              <span className="microlabel">Débito nº 3</span>
              <h3>Cobrança manual constrange.</h3>
              <p>Você adia a mensagem para não parecer insistente. O atraso cresce, a conversa esfria e o cliente some.</p>
              <span className="ledger-line" />
            </article>
          </div>
        </div>
      </section>

      {/* ═══ 02 · COMO FUNCIONA ═══ */}
      <section id="como-funciona" style={{ background: "var(--paper-2)" }}>
        <div className="wrap">
          <div className="sec-head rv" style={{ borderColor: "var(--line-2)" }}>
            <span className="sec-idx">02</span>
            <h2>Do zero ao <em>automático</em> em 10 minutos</h2>
            <p className="sec-sub">Sem instalação, sem API complicada, sem deixar o celular ligado.</p>
          </div>
          <div className="steps">
            <div className="step rv">
              <div className="step-n">01</div>
              <h3>Conecte o WhatsApp</h3>
              <p>Escaneie um QR code uma única vez, como no WhatsApp Web. A conexão fica na nuvem, funcionando 24h.</p>
              <span className="tag">~ 2 minutos</span>
            </div>
            <div className="step rv d1">
              <div className="step-n">02</div>
              <h3>Importe seus clientes</h3>
              <p>Suba sua planilha CSV ou cadastre na mão: nome, plano, valor e vencimento. Pronto, a carteira está viva.</p>
              <span className="tag">~ 5 minutos</span>
            </div>
            <div className="step rv d2">
              <div className="step-n">03</div>
              <h3>Deixe a régua cobrar</h3>
              <p>Cinco dias antes ela lembra. Na véspera, reforça. No dia, envia o PIX. Pagou? Confirma e já agenda o próximo mês.</p>
              <span className="tag">no piloto automático</span>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 03 · RECURSOS ═══ */}
      <section id="recursos">
        <div className="wrap">
          <div className="sec-head rv">
            <span className="sec-idx">03</span>
            <h2>A máquina por dentro</h2>
            <p className="sec-sub">Três recursos que transformam cobrança em rotina invisível.</p>
          </div>

          {/* F1: fila de cobrança */}
          <div className="feat alt">
            <div className="feat-txt rv">
              <span className="microlabel">Cobrança automática</span>
              <h3>Uma fila que trabalha <em>de madrugada</em></h3>
              <p>Todo dia, a Lembrado varre sua carteira, monta a fila de quem vence e dispara as mensagens no horário certo — com intervalos humanos para proteger seu número.</p>
              <ul>
                <li>Régua D-5, D-1 e dia do vencimento, no tom da sua marca</li>
                <li>PIX copia-e-cola dentro da própria conversa</li>
                <li>Anti-ban: aquecimento e ritmo de envio inteligente</li>
              </ul>
            </div>
            <div className="mock rv d1" data-mock="queue">
              <div className="mock-bar"><i /><i /><i /><span>Fila de cobrança · hoje</span></div>
              <div className="q-row"><span className="q-dot" /><span><span className="q-name">Carlos Andrade</span><br /><span className="q-plan">Premium · vence hoje</span></span><span className="q-val">R$ 35,00</span><span className="q-st">Cobrado</span></div>
              <div className="q-row"><span className="q-dot" /><span><span className="q-name">Ana Beatriz</span><br /><span className="q-plan">Completo · vence hoje</span></span><span className="q-val">R$ 49,90</span><span className="q-st">Cobrado</span></div>
              <div className="q-row"><span className="q-dot" /><span><span className="q-name">João Pedro</span><br /><span className="q-plan">Básico · vence amanhã</span></span><span className="q-val">R$ 25,00</span><span className="q-st">Agendado</span></div>
              <div className="q-row"><span className="q-dot" /><span><span className="q-name">Marcos Vale</span><br /><span className="q-plan">Premium · vence em 5 dias</span></span><span className="q-val">R$ 35,00</span><span className="q-st">Agendado</span></div>
            </div>
          </div>

          {/* F2: carteira */}
          <div className="feat">
            <div className="feat-txt rv">
              <span className="microlabel">Carteira completa</span>
              <h3>Quanto entrou, quanto sai, <em>quanto sobra</em></h3>
              <p>Cada pagamento confirmado cai direto no seu livro-caixa: receita, custo do painel, lucro líquido. Chega de descobrir o resultado do mês na conta bancária.</p>
              <ul>
                <li>Receita e lucro por dia, mês e ano</li>
                <li>Custos fixos e por cliente descontados sozinhos</li>
                <li>Inadimplência e previsão dos próximos 7 dias</li>
              </ul>
            </div>
            <div className="mock rv d1" data-mock="wallet">
              <div className="mock-bar"><i /><i /><i /><span>Carteira · julho</span></div>
              <div className="w-top">
                <span className="microlabel">Lucro líquido do mês</span>
                <span className="w-saldo">R$ <span data-count="8420" /></span>
              </div>
              <div className="w-chart">
                <div className="w-bar" style={{ height: "34%" }} />
                <div className="w-bar" style={{ height: "52%" }} />
                <div className="w-bar" style={{ height: "41%" }} />
                <div className="w-bar g" style={{ height: "78%" }} />
                <div className="w-bar" style={{ height: "57%" }} />
                <div className="w-bar g" style={{ height: "92%" }} />
                <div className="w-bar" style={{ height: "63%" }} />
              </div>
              <div className="w-foot"><span>01 jul</span><span>15 jul</span><span>30 jul</span></div>
              <div className="w-split">
                <div className="w-cell"><span className="microlabel">Recebido</span><span className="num" style={{ color: "var(--green)" }}>R$ 11.240</span></div>
                <div className="w-cell"><span className="microlabel">Custos</span><span className="num">R$ 2.820</span></div>
                <div className="w-cell"><span className="microlabel">A receber 7d</span><span className="num">R$ 1.615</span></div>
              </div>
            </div>
          </div>

          {/* F3: régua + confirmação */}
          <div className="feat alt">
            <div className="feat-txt rv">
              <span className="microlabel">Confirmação automática</span>
              <h3>O PIX caiu? A Lembrado <em>já sabe</em></h3>
              <p>Integrado ao seu gateway, ele reconhece o pagamento em segundos, agradece o cliente, renova o acesso e registra tudo na carteira. Zero conferência manual.</p>
              <ul>
                <li>Baixa automática e recibo na conversa</li>
                <li>Renovação agendada para o próximo ciclo</li>
                <li>Quem não pagou entra na régua de reforço</li>
              </ul>
            </div>
            <div className="mock rv d1" data-mock="ruler">
              <div className="mock-bar"><i /><i /><i /><span>Régua · Carlos Andrade</span></div>
              <div className="r-line">
                <div className="r-step"><span className="r-d">D-5</span><span className="r-msg"><b>Lembrete:</b> &ldquo;Oi Carlos! Seu plano renova dia 05. Já deixa o PIX engatilhado 😉&rdquo;</span></div>
                <div className="r-step"><span className="r-d">D-1</span><span className="r-msg"><b>Reforço:</b> &ldquo;Amanhã vence! Renovando hoje você não perde o acesso.&rdquo;</span></div>
                <div className="r-step"><span className="r-d">D0</span><span className="r-msg"><b>Cobrança:</b> &ldquo;Chegou o dia — R$ 35,00 no PIX abaixo 👇&rdquo;</span></div>
              </div>
              <div className="r-toast">✓ PIX recebido · +R$ 35,00 na carteira</div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 04 · DEPOIMENTOS ═══ */}
      <section id="depoimentos" style={{ background: "var(--paper-2)" }}>
        <div className="wrap">
          <div className="sec-head rv" style={{ borderColor: "var(--line-2)" }}>
            <span className="sec-idx">04</span>
            <h2>Assinado por quem <em>recebe em dia</em></h2>
            <p className="sec-sub">Resultados reais de operações de assinatura pelo Brasil.</p>
          </div>
          <div className="dep-grid">
            <article className="dep rv">
              <q>Eu levava duas horas por noite cobrando cliente. Hoje acordo com os PIX confirmados e a planilha aposentada.</q>
              <span className="dep-res">+R$ 3.400 recuperados no 1º mês</span>
              <div className="dep-who">
                <span className="dep-ava">RM</span>
                <div><b>Rafael Menezes</b><span>Revenda IPTV · Belo Horizonte, MG</span></div>
              </div>
            </article>
            <article className="dep rv d1">
              <q>Minha inadimplência caiu de 22% para 6% em dois meses. A régua cobra no tom certo — o cliente até agradece o lembrete.</q>
              <span className="dep-res">Inadimplência de 22% → 6%</span>
              <div className="dep-who">
                <span className="dep-ava">JC</span>
                <div><b>Juliana Castro</b><span>Streaming e recargas · Recife, PE</span></div>
              </div>
            </article>
            <article className="dep rv d2">
              <q>Fui de R$ 8 mil para R$ 11,2 mil por mês sem cadastrar um cliente novo. Era dinheiro meu que ficava na mesa.</q>
              <span className="dep-res">Faturamento +40% em 60 dias</span>
              <div className="dep-who">
                <span className="dep-ava">DF</span>
                <div><b>Diego Ferraz</b><span>Assinaturas digitais · Curitiba, PR</span></div>
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* ═══ 05 · PREÇO ═══ */}
      <section id="preco">
        <div className="wrap">
          <div className="sec-head rv">
            <span className="sec-idx">05</span>
            <h2>Um plano para <em>cada estágio.</em></h2>
            <p className="sec-sub">Comece com o essencial, automatize no Pro e leve inteligência para a operação no Master.</p>
          </div>

          <div className="price-grid">
            <div className="price-card rv">
              <div className="pc-name">Starter</div>
              <p className="pc-desc">Organização essencial para começar.</p>
              <div className="pc-price"><span className="pc-cur">R$</span><span className="pc-val num">20</span><span className="pc-per">/mês</span></div>
              <ul className="pc-feats"><li>Até <b>100 clientes</b></li><li><b>1</b> WhatsApp conectado</li><li>Painel e financeiro básico</li><li>Automação básica</li><li>Promoções <b className="g">Incluso</b></li></ul>
              <Link href="/cadastro" className="btn pc-cta magnetic">Criar conta <span className="arr">→</span></Link>
            </div>
            <div className="price-card featured rv d1">
              <span className="pc-badge">Mais escolhido</span>
              <div className="pc-name">Pro</div>
              <p className="pc-desc">Automação e crescimento para operações em escala.</p>
              <div className="pc-price"><span className="pc-cur">R$</span><span className="pc-val num">30</span><span className="pc-per">/mês</span></div>
              <ul className="pc-feats"><li>Até <b>500 clientes</b></li><li><b>2</b> WhatsApps conectados</li><li>Cobrança Inteligente e Analytics</li><li>Portal do Cliente</li><li>Promoções <b className="g">Incluso</b></li></ul>
              <Link href="/cadastro" className="btn pc-cta magnetic">Testar grátis por 7 dias <span className="arr">→</span></Link>
            </div>
            <div className="price-card rv d2">
              <div className="pc-name">Master</div>
              <p className="pc-desc">Inteligência e recursos para alto volume.</p>
              <div className="pc-price"><span className="pc-cur">R$</span><span className="pc-val num">40</span><span className="pc-per">/mês</span></div>
              <ul className="pc-feats"><li>Clientes <b>Ilimitados</b></li><li><b>3</b> WhatsApps conectados</li><li>Todos os recursos do Pro</li><li>Intelligence, Revendas e API</li><li>Promoções <b className="g">Incluso</b></li></ul>
              <Link href="/cadastro" className="btn pc-cta magnetic">Criar conta <span className="arr">→</span></Link>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 06 · FAQ ═══ */}
      <section id="faq-sec" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="sec-head rv">
            <span className="sec-idx">06</span>
            <h2>Perguntas de quem está <em>quase dentro</em></h2>
          </div>
          <div className="faq">
            {FAQS.map((f, i) => (
              <div className={`qa rv${openFaq === i ? " open" : ""}`} key={i}>
                <button type="button" aria-expanded={openFaq === i} onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                  {f.q}<span className="plus">+</span>
                </button>
                <div className="qa-a"><div><p>{f.a}</p></div></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CTA FINAL ═══ */}
      <section className="final" id="cta-final">
        <div className="wrap">
          <span className="microlabel">Última linha do balanço</span>
          <h2 className="rv">Seu próximo vencimento pode <em>se pagar sozinho.</em></h2>
          <p className="sub rv d1">Planos a partir de <b>R$ 20/mês</b>, com 7 dias grátis para começar sem cartão e escolher o nível certo para sua operação.</p>
          <div className="final-cta rv d2">
            <Link className="btn paper magnetic" href="/cadastro">Testar grátis por 7 dias <span className="arr">→</span></Link>
            <span className="cta-note">sem cartão · configuração em 10 minutos</span>
          </div>
          <div className="final-ledger rv d3">
            <span><b>✓</b> 7 dias grátis, recursos completos</span>
            <span><b>✓</b> cancele em 2 cliques, sem multa</span>
            <span><b>✓</b> seus dados exportáveis a qualquer momento</span>
          </div>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer>
        <div className="wrap">
          <div className="ft">
            <div>
              <a className="logo" href="#topo">
                <svg width="26" height="26" viewBox="0 0 132 132" aria-hidden="true"><use href="#lembrado-mark" /></svg>
                <BrandName as="b" />
              </a>
              <p style={{ font: "400 12px var(--mono)", marginTop: 12, maxWidth: 230 }}>Cobrança automática no WhatsApp e carteira para negócios de assinatura.</p>
            </div>
            <div className="ft-col">
              <span className="microlabel">Produto</span>
              <a href="#como-funciona">Como funciona</a>
              <a href="#recursos">Recursos</a>
              <a href="#preco">Preço</a>
              <a href="#faq-sec">Perguntas frequentes</a>
            </div>
            <div className="ft-col">
              <span className="microlabel">Empresa</span>
              <Link href="/termos">Termos de uso</Link>
              <Link href="/privacidade">Privacidade</Link>
              <Link href="/login">Entrar na conta</Link>
            </div>
          </div>
          <div className="ft-legal">
            <span>© 2026 Lembrado · todos os direitos reservados</span>
            <span>feito no Brasil</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

const FAQS = [
  {
    q: "Preciso deixar meu celular ligado o dia todo?",
    a: "Não. Você escaneia o QR code uma única vez e a conexão fica hospedada na nossa nuvem, enviando mensagens 24h por dia — mesmo com seu celular desligado ou sem internet.",
  },
  {
    q: "Meu número corre risco de ser banido?",
    a: "A Lembrado envia com intervalos humanos, limite diário progressivo e aquecimento automático de chip — o mesmo protocolo usado por operações com milhares de clientes. Cobrança para a sua própria base tem risco muito menor que disparo frio, e nosso anti-ban cuida do resto.",
  },
  {
    q: "Funciona para o meu tipo de negócio?",
    a: "Se você cobra mensalidade, sim: IPTV e streaming, recargas, academias e personal trainers, mensalistas de serviços, aluguéis de equipamentos, clubes de assinatura. Se tem vencimento e WhatsApp, a Lembrado cobra.",
  },
  {
    q: "Como funciona o teste grátis de 7 dias?",
    a: "Você cria a conta sem informar cartão e testa a plataforma por 7 dias. Ao final, escolhe entre Starter por R$ 20/mês, Pro por R$ 30/mês ou Master por R$ 40/mês. Se não quiser continuar, não paga nada.",
  },
  {
    q: "Consigo importar meus clientes da planilha?",
    a: "Sim. Suba um CSV com nome, telefone, valor e vencimento e a carteira inteira entra em minutos. Exportar de volta também é um clique — os dados são seus, sempre.",
  },
]
