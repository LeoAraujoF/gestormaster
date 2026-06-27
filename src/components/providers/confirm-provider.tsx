"use client"

import React, { createContext, useContext, useState, ReactNode } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { AlertTriangle, AlertCircle, Info, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"

export type ConfirmVariant = "default" | "destructive" | "warning" | "success"

interface ConfirmOptions {
  title?: string
  description: string
  confirmText?: string
  cancelText?: string
  variant?: ConfirmVariant
}

interface ConfirmContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined)

export function useConfirm() {
  const context = useContext(ConfirmContext)
  if (!context) {
    throw new Error("useConfirm must be used within a ConfirmProvider")
  }
  return context.confirm
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const [resolver, setResolver] = useState<{ resolve: (value: boolean) => void } | null>(null)

  const confirm = (options: ConfirmOptions): Promise<boolean> => {
    setOptions(options)
    setIsOpen(true)
    return new Promise((resolve) => {
      setResolver({ resolve })
    })
  }

  const handleConfirm = () => {
    if (resolver) resolver.resolve(true)
    setIsOpen(false)
  }

  const handleCancel = () => {
    if (resolver) resolver.resolve(false)
    setIsOpen(false)
  }

  const variant = options?.variant || "default"
  
  // Icon and colors mapping based on variant
  const iconMap = {
    default: <Info className="w-5 h-5 text-blue-500" />,
    destructive: <AlertCircle className="w-5 h-5 text-red-500" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-500" />,
    success: <CheckCircle2 className="w-5 h-5 text-emerald-500" />
  }

  const actionStyleMap = {
    default: "bg-primary text-primary-foreground hover:bg-primary/90",
    destructive: "bg-red-500 text-white hover:bg-red-600 focus:ring-red-500",
    warning: "bg-amber-500 text-white hover:bg-amber-600 focus:ring-amber-500",
    success: "bg-emerald-500 text-white hover:bg-emerald-600 focus:ring-emerald-500"
  }

  const bgMap = {
    default: "bg-blue-500/10",
    destructive: "bg-red-500/10",
    warning: "bg-amber-500/10",
    success: "bg-emerald-500/10"
  }

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
        <AlertDialogContent className="glass-card border-primary/20 sm:max-w-[425px]">
          <AlertDialogHeader className="flex flex-col gap-2">
            <div className="flex items-start gap-4">
              <div className={cn("p-3 rounded-full flex-shrink-0 mt-1", bgMap[variant])}>
                {iconMap[variant]}
              </div>
              <div className="flex flex-col gap-1.5 pt-1">
                <AlertDialogTitle className="text-xl">
                  {options?.title || "Atenção"}
                </AlertDialogTitle>
                <AlertDialogDescription className="text-sm">
                  {options?.description}
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 border-t pt-4">
            <AlertDialogCancel onClick={handleCancel} className="mt-0">
              {options?.cancelText || "Cancelar"}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} className={actionStyleMap[variant]}>
              {options?.confirmText || "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  )
}
