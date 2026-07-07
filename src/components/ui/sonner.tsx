"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { Loader2Icon } from "lucide-react"

/**
 * Toast (design_handoff §7 / 7b): card hairline com ponto de status + título bold;
 * ação à direita em --interactive; erro ganha borda --danger-border.
 * Sem ícones coloridos gigantes, sem fundo colorido.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <span className="status-dot mt-0.5 bg-money" />,
        info: <span className="status-dot mt-0.5 bg-interactive" />,
        warning: <span className="status-dot mt-0.5 bg-warning" />,
        error: <span className="status-dot mt-0.5 bg-danger" />,
        loading: <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />,
      }}
      style={
        {
          "--normal-bg": "var(--card)",
          "--normal-text": "var(--card-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "8px",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast !shadow-[0_6px_20px_rgba(0,0,0,.08)]",
          title: "!font-semibold !text-[13px]",
          description: "!text-xs !text-muted-foreground",
          actionButton: "!bg-transparent !text-interactive !font-medium hover:!underline !text-xs",
          cancelButton: "!bg-transparent !text-muted-foreground !text-xs",
          error: "!border-danger-border",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
