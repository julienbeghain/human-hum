"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { IconMusic } from "@tabler/icons-react"

import { silentSync, type SyncResult } from "@/app/actions/sync"

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

  useEffect(() => {
    if (hasRun.current) return
    hasRun.current = true

    startTransition(async () => {
      const result: SyncResult = await silentSync()
      if (result.probed) {
        setNowPlaying(result.nowPlaying ?? null)
        if (result.needsSync && result.imported > 0) {
          router.refresh()
        }
      }
    })
  }, [router, startTransition])

  if (!nowPlaying) return null

  return <NowPlayingBanner {...nowPlaying} />
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
