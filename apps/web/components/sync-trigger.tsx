"use client"

import { startTransition, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { IconMusic } from "@tabler/icons-react"
import { Spinner } from "@workspace/ui/components/spinner"

import { checkAndSync } from "@/app/actions/sync"

interface NowPlaying {
  trackName: string
  artistName: string
  albumName?: string
}

export function SyncTrigger() {
  const router = useRouter()
  const hasRun = useRef(false)
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null)
  const [syncing, setSyncing] = useState(true)

  useEffect(() => {
    if (hasRun.current) return
    hasRun.current = true

    void checkAndSync()
      .then((result) => {
        setSyncing(false)
        setNowPlaying(result.nowPlaying)
        if (result.imported > 0) {
          startTransition(() => router.refresh())
        }
      })
      .catch(() => setSyncing(false))
  }, [router])

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
        Syncing your latest hums&hellip;
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
