"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"

type OrganizationContextType = {
  organizationId: string | null
  role: string | null
  isLoading: boolean
}

const OrganizationContext = createContext<OrganizationContextType>({
  organizationId: null,
  role: null,
  isLoading: true,
})

export function OrganizationProvider({ children }: { children: React.ReactNode }) {
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function loadOrganization() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setIsLoading(false)
          return
        }

        const { data, error } = await supabase
          .from('organization_members')
          .select('organization_id, role')
          .eq('user_id', user.id)
          .single()

        if (!error && data) {
          setOrganizationId(data.organization_id)
          setRole(data.role)
        }
      } catch (err) {
        console.error("Error loading organization", err)
      } finally {
        setIsLoading(false)
      }
    }

    loadOrganization()
  }, [])

  return (
    <OrganizationContext.Provider value={{ organizationId, role, isLoading }}>
      {children}
    </OrganizationContext.Provider>
  )
}

export const useOrganization = () => useContext(OrganizationContext)
