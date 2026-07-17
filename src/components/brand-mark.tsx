/** Marca Lembrado: conversa enviada, confirmação recebida e atividade contínua. */
export function BrandMark({
  size = 24,
  background = "#176B4D",
  accent = "#45D49A",
  className,
}: {
  size?: number
  background?: string
  accent?: string
  className?: string
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 132 132" className={className} aria-hidden="true">
      <rect x="9" y="9" width="114" height="114" rx="34" fill={background} />
      <path
        d="M39 39h54a18 18 0 0 1 18 18v27a18 18 0 0 1-18 18H65L45 116l4-14H39a18 18 0 0 1-18-18V57a18 18 0 0 1 18-18Z"
        fill="#FAF8F2"
      />
      <path
        d="m47 70 14 14 27-31"
        fill="none"
        stroke={background}
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="104" cy="31" r="9" fill={accent} stroke={background} strokeWidth="5" />
    </svg>
  )
}
