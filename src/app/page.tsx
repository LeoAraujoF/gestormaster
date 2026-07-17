import { LandingClient } from "./landing-client"
import "./landing.css"

export const metadata = {
  title: "Lembrado — Cobrança automática no WhatsApp",
  description:
    "A Lembrado avisa, cobra e confirma o pagamento dos seus clientes pelo WhatsApp — sozinha. Carteira completa com receitas, custos e lucro. 7 dias grátis, sem cartão.",
}

/**
 * Landing "livro-caixa editorial" da Lembrado (portada de landing.html):
 * papel + serifa Fraunces + mono contábil, hairlines de razão,
 * conversa de WhatsApp animada como herói. Estilos escopados em .lp.
 */
export default function LandingPage() {
  return <LandingClient />
}
