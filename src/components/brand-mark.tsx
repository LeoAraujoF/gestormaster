import styles from "./brand-mark.module.css"

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
      <rect data-brand-part="tile" x="9" y="9" width="114" height="114" rx="34" fill={background} />
      <path
        data-brand-part="bubble"
        d="M39 39h54a18 18 0 0 1 18 18v27a18 18 0 0 1-18 18H65L45 116l4-14H39a18 18 0 0 1-18-18V57a18 18 0 0 1 18-18Z"
        fill="#FAF8F2"
      />
      <path
        data-brand-part="check"
        d="m47 70 14 14 27-31"
        fill="none"
        stroke={background}
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle data-brand-part="activity" cx="104" cy="31" r="9" fill={accent} stroke={background} strokeWidth="5" />
    </svg>
  )
}

/** Wordmark oficial: Outfit Bold, ligeiramente ampliado, com o ponto verde da marca. */
export function BrandName({
  as: Component = "span",
  className,
  accent = "#45D49A",
}: {
  as?: "span" | "strong" | "b" | "h1"
  className?: string
  accent?: string
}) {
  return (
    <Component className={className} aria-label="Lembrado">
      <span className={styles.wordmark} aria-hidden="true">
        lembrado<span style={{ color: accent }}>.</span>
      </span>
    </Component>
  )
}
