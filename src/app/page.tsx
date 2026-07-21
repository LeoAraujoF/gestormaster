import type { Metadata } from "next"
import { LandingTwo } from "./landing-two"

export const metadata: Metadata = {
  title: "Lembrado — Sua operação no piloto inteligente",
  description:
    "Clientes, cobranças, WhatsApp, PIX, financeiro e decisões em um único fluxo. Teste a Lembrado por 7 dias, sem cartão.",
  openGraph: {
    title: "Lembrado — A operação que lembra por você",
    description:
      "Pare de administrar lembretes. Organize clientes, automatize cobranças e decida com clareza em um só lugar.",
    type: "website",
    locale: "pt_BR",
    images: [
      {
        url: "https://lembrado.com.br/og.png",
        width: 1730,
        height: 909,
        alt: "Lembrado — A operação que lembra por você",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Lembrado — A operação que lembra por você",
    description: "Clientes. Cobranças. Decisões. No mesmo ritmo.",
    images: ["https://lembrado.com.br/og.png"],
  },
}

/**
 * A primeira landing editorial permanece arquivada em landing-client.tsx,
 * landing.css e landing.html para consulta ou retomada futura.
 */
export default function LandingPage() {
  return <LandingTwo />
}
