"use client"

import { useEffect, useRef, useTransition } from "react"
import { useRouter } from "next/navigation"

import { silentSync } from "@/app/actions/sync"

export function SyncTrigger() {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const hasRun = useRef(false)

  useEffect(() => {
    if (hasRun.current) return
    hasRun.current = true

    startTransition(async () => {
      const result = await silentSync()
      if (result.probed && result.needsSync && result.imported > 0) {
        router.refresh()
      }
    })
  }, [router, startTransition])

  return null
}
