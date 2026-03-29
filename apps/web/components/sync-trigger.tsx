"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { IconMusic } from "@tabler/icons-react"
import { Spinner } from "@workspace/ui/components/spinner"

import { probeSync, runSync, type ProbeResult } from "@/app/actions/sync"

interface NowPlaying {
  trackName: string
  artistName: string
  albumName?: string
}

export function SyncTrigger() {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const hasRun = useRef(false)
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    if (hasRun.current) return
    hasRun.current = true

    startTransition(async () => {
      const probe: ProbeResult = await probeSync()
      if (!probe.probed) return

      setNowPlaying(probe.nowPlaying ?? null)

      if (!probe.needsSync) return

      // Show syncing indicator for multi-page catch-ups
      if (probe.newTrackCount > 1) {
        setSyncing(true)
      }

      const result = await runSync()

      setSyncing(false)
      if (result.imported > 0) {
        router.refresh()
      }
    })
  }, [router, startTransition])

  return (
    <>
      {syncing && <SyncingBanner />}
      {nowPlaying && <NowPlayingBanner {...nowPlaying} />}
    </>
  )
}

function SyncingBanner() {
  return (
    <div className="bg-muted flex items-center gap-3 border-b px-4 py-2 text-sm">
      <Spinner className="size-4 shrink-0" />
      <span className="text-muted-foreground">
        Syncing your latest scrobbles&hellip;
      </span>
    </div>
  )
}

function NowPlayingBanner({
  trackName,
  artistName,
  albumName,
}: NowPlaying) {
  return (
    <div className="bg-primary/10 text-primary border-primary/20 flex items-center gap-3 border-b px-4 py-2 text-sm">
      <IconMusic className="size-4 shrink-0 animate-pulse" />
      <span className="truncate">
        <span className="font-medium">{trackName}</span>
        <span className="text-muted-foreground">
          {" "}
          by {artistName}
          {albumName && <> &middot; {albumName}</>}
        </span>
      </span>
    </div>
  )
}
