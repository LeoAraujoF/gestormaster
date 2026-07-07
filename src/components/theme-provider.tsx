"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"
import { type ThemeProviderProps } from "next-themes"

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  // Preferência "Números em fonte tabular" (Minha conta → Aparência, 11e)
  React.useEffect(() => {
    if (localStorage.getItem("gm_tabular_nums") === "off") {
      document.documentElement.setAttribute("data-tabular-nums", "off")
    }
  }, [])

  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
