import { BrandMark, BrandName } from "@/components/brand-mark"
import styles from "./brand-loader.module.css"

type BrandLoaderProps = {
  message?: string
  variant?: "screen" | "inline"
}

export function BrandLoader({
  message = "Preparando sua operação",
  variant = "screen",
}: BrandLoaderProps) {
  return (
    <section
      className={`${styles.loader} ${styles[variant]}`}
      aria-busy="true"
      aria-label="Carregando o Painel da Lembrado"
    >
      <span className="sr-only" role="status" aria-live="polite">
        Carregando o Painel da Lembrado.
      </span>

      <div className={styles.frame} aria-hidden="true">
        <span className={`${styles.corner} ${styles.cornerTopLeft}`} />
        <span className={`${styles.corner} ${styles.cornerTopRight}`} />
        <span className={`${styles.corner} ${styles.cornerBottomLeft}`} />
        <span className={`${styles.corner} ${styles.cornerBottomRight}`} />
      </div>

      <div className={styles.content} aria-hidden="true">
        <div className={styles.markStage}>
          <span className={`${styles.orbit} ${styles.orbitOuter}`} />
          <span className={`${styles.orbit} ${styles.orbitInner}`} />
          <BrandMark
            size={104}
            background="#176B4D"
            accent="#45D49A"
            className={styles.mark}
          />
        </div>

        <div className={styles.copy}>
          <BrandName as="strong" className={styles.wordmark} />
          <p className={styles.message}>{message}</p>
        </div>

        <div className={styles.progress}>
          <span className={styles.progressLine} />
        </div>
      </div>

      <p className={styles.signature} aria-hidden="true">
        Clientes, cobranças e operação em um só ritmo.
      </p>
    </section>
  )
}
