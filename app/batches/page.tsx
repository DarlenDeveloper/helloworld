export const dynamic = "force-dynamic";
import Link from "next/link"
import { isBatchesV2Enabled } from "@/lib/featureFlags"
import { BatchesListClient } from "@/components/batches/ui"

export const metadata = {
  title: "Batches",
}

export default function Page() {
  if (!isBatchesV2Enabled()) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Batches</h1>
        <p className="text-sm text-muted-foreground">
          The modernized Batches UI is currently disabled. Enable it by setting
          <code className="ml-1 rounded bg-muted px-1.5 py-0.5">NEXT_PUBLIC_BATCHES_UI_V2=1</code>.
        </p>
        <Link href="/dashboard" className="text-primary underline">
          Back to dashboard
        </Link>
      </div>
    )
  }

  return <BatchesListClient />
}