import { LandingClient } from "./landing-client"
import "./landing.css"

export const metadata = {
  title: "Gestor Master — Cobrança automática no WhatsApp",
  description:
    "O Gestor Master lembra, cobra e confirma o pagamento dos seus clientes pelo WhatsApp — sozinho. Carteira completa com receitas, custos e lucro. 7 dias grátis, sem cartão.",
}

/**
 * Landing "livro-caixa editorial" (portada de landing.html):
 * papel + serifa Fraunces + mono contábil, hairlines de razão,
 * conversa de WhatsApp animada como herói. Estilos escopados em .lp.
 */
export default function LandingPage() {
  return <LandingClient />
}
