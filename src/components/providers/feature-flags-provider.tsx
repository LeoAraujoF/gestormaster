"use client"

import React, { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type FeatureFlagsContextType = {
  flags: Record<string, boolean>
  isLoading: boolean
}

const FeatureFlagsContext = createContext<FeatureFlagsContextType>({ flags: {}, isLoading: true })

export const useFeatureFlags = () => useContext(FeatureFlagsContext)

export function FeatureFlagsProvider({ children }: { children: React.ReactNode }) {
  const [flags, setFlags] = useState<Record<string, boolean>>({})
  const [isLoading, setIsLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const fetchFlags = async () => {
      const { data, error } = await supabase.from('system_features').select('key, is_enabled')
      if (data && !error) {
        const flagsMap: Record<string, boolean> = {}
        data.forEach((flag: any) => {
          flagsMap[flag.key] = flag.is_enabled
        })
        setFlags(flagsMap)
      }
      setIsLoading(false)
    }

    fetchFlags()

    // Real-time subscription to feature flags
    const channel = supabase.channel('system_features_changes')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'system_features' }, (payload) => {
        const { key, is_enabled } = payload.new
        setFlags((prev) => ({ ...prev, [key]: is_enabled }))
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase])

  return (
    <FeatureFlagsContext.Provider value={{ flags, isLoading }}>
      {children}
    </FeatureFlagsContext.Provider>
  )
}
