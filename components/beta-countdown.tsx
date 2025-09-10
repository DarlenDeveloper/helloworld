"use client"

import React, { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

type TimeLeft = {
  totalMs: number
  days: number
  hours: number
  minutes: number
  seconds: number
}

function computeTimeLeft(target: Date): TimeLeft {
  const now = new Date().getTime()
  const totalMs = Math.max(0, target.getTime() - now)

  const days = Math.floor(totalMs / (1000 * 60 * 60 * 24))
  const hours = Math.floor((totalMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((totalMs % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((totalMs % (1000 * 60)) / 1000)

  return { totalMs, days, hours, minutes, seconds }
}

function pad(n: number) {
  return n.toString().padStart(2, "0")
}

export function BetaCountdownModal({
  feature = "This feature",
  target = "2025-10-05T00:00:00Z", // 5th October 2025 (UTC)
  title = "Under Development",
  subtitle = "We’re actively building this experience. Thanks for your patience!",
}: {
  feature?: string
  target?: string | Date
  title?: string
  subtitle?: string
}) {
  const targetDate = useMemo(() => {
    if (target instanceof Date) return target
    const d = new Date(target)
    return isNaN(d.getTime()) ? new Date("2025-10-05T00:00:00Z") : d
  }, [target])

  const [open, setOpen] = useState(true)
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(() => computeTimeLeft(targetDate))

  useEffect(() => {
    setOpen(true) // open on mount/navigation
  }, [])

  useEffect(() => {
    const id = setInterval(() => {
      setTimeLeft(computeTimeLeft(targetDate))
    }, 1000)
    return () => clearInterval(id)
  }, [targetDate])

  const reached = timeLeft.totalMs === 0

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {feature} is currently in BETA. {subtitle}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 rounded-md border bg-muted/30 p-4">
          <div className="text-xs text-muted-foreground mb-2">
            Target: {targetDate.toLocaleString()}
          </div>

          {reached ? (
            <div className="text-center py-4">
              <div className="text-2xl font-semibold text-green-600">Launch window reached</div>
              <div className="text-sm text-muted-foreground mt-1">You may start exploring!</div>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-3 text-center">
              <div className="rounded-md bg-background border p-3">
                <div className="text-3xl font-bold text-black">{pad(timeLeft.days)}</div>
                <div className="text-xs text-muted-foreground">Days</div>
              </div>
              <div className="rounded-md bg-background border p-3">
                <div className="text-3xl font-bold text-black">{pad(timeLeft.hours)}</div>
                <div className="text-xs text-muted-foreground">Hours</div>
              </div>
              <div className="rounded-md bg-background border p-3">
                <div className="text-3xl font-bold text-black">{pad(timeLeft.minutes)}</div>
                <div className="text-xs text-muted-foreground">Minutes</div>
              </div>
              <div className="rounded-md bg-background border p-3">
                <div className="text-3xl font-bold text-black">{pad(timeLeft.seconds)}</div>
                <div className="text-xs text-muted-foreground">Seconds</div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
          <Button className="bg-teal-500 hover:bg-teal-600" onClick={() => setOpen(false)}>Continue</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}