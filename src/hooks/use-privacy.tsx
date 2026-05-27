"use client"

import React, { createContext, useContext, useState, useEffect } from "react"

interface PrivacyContextType {
  showValues: boolean
  togglePrivacy: () => void
  displayValue: (value: string | number) => string | number
}

const PrivacyContext = createContext<PrivacyContextType | undefined>(undefined)

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const [showValues, setShowValues] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem("gestor_privacy")
    if (saved !== null) {
      setShowValues(saved === "true")
    }
  }, [])

  const togglePrivacy = () => {
    setShowValues(prev => {
      const newVal = !prev
      localStorage.setItem("gestor_privacy", String(newVal))
      return newVal
    })
  }

  const displayValue = (value: string | number) => {
    return showValues ? value : "R$ *****"
  }

  return (
    <PrivacyContext.Provider value={{ showValues, togglePrivacy, displayValue }}>
      {children}
    </PrivacyContext.Provider>
  )
}

export function usePrivacy() {
  const context = useContext(PrivacyContext)
  if (context === undefined) {
    throw new Error("usePrivacy must be used within a PrivacyProvider")
  }
  return context
}
