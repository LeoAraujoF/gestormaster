import type { Metadata, Viewport } from "next";
import { Inter, Outfit } from "next/font/google";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { FeatureFlagsProvider } from "@/components/providers/feature-flags-provider";
import { ConfirmProvider } from "@/components/providers/confirm-provider";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const outfit = Outfit({
  variable: "--font-heading",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lembrado - Gestão de clientes e cobranças",
  description: "Gestão inteligente de clientes com automação",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${inter.variable} ${outfit.variable} ${GeistMono.variable} antialiased min-h-screen bg-background font-sans selection:bg-primary/30`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <FeatureFlagsProvider>
            <ConfirmProvider>
              <TooltipProvider>
                {children}
              </TooltipProvider>
            </ConfirmProvider>
            <Toaster position="top-right" richColors />
          </FeatureFlagsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
