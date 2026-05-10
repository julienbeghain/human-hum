"use client"

import { startTransition, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { IconMusic } from "@tabler/icons-react"
import { Spinner } from "@workspace/ui/components/spinner"

import { checkAndSync, type CheckAndSyncResult } from "@/app/actions/sync"

interface NowPlaying {
  trackName: string
  artistName: string
  albumName?: string
}

export function SyncTrigger() {
  const router = useRouter()
  const hasRun = useRef<true | null>(null)
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null)
  const [syncing, setSyncing] = useState(false)

  if (hasRun.current == null) {
    hasRun.current = true
    startTransition(async () => {
      setSyncing(true)
      const result: CheckAndSyncResult = await checkAndSync()
      setSyncing(false)

      if (!result.ok) return

      setNowPlaying(result.nowPlaying)
      if (result.imported > 0) {
        router.refresh()
      }
    })
  }

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
