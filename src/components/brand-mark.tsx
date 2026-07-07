/**
 * Marca "G que confirma" (identidade em logo/): G geométrico cuja barra
 * é o tique de confirmação em verde-dinheiro.
 * Por padrão usa tokens do tema (foreground + money), então se adapta
 * ao dark mode sozinha; passe `g`/`check` para versões fixas (ex.: painel tinta).
 */
export function BrandMark({
  size = 24,
  g = "var(--foreground)",
  check = "var(--money)",
  className,
}: {
  size?: number
  g?: string
  check?: string
  className?: string
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" className={className} aria-hidden="true">
      <path
        d="M 66.5 24.4 A 30 30 0 1 0 77.1 55.3"
        fill="none" stroke={g} strokeWidth="12" strokeLinecap="round"
      />
      <path
        d="M 44 54 L 55 65 L 76 40"
        fill="none" stroke={check} strokeWidth="12" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  )
}
