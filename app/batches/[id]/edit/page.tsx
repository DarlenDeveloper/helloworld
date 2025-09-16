import { isBatchesV2Enabled } from "@/lib/featureFlags"
import { BatchFormClient } from "@/components/batches/ui"
import Link from "next/link"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Edit Batch",
}

export default function Page({ params }: { params: { id: string } }) {
  if (!isBatchesV2Enabled()) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Edit Batch</h1>
        <p className="text-sm text-muted-foreground">
          The modernized Batches UI is currently disabled. Enable it by setting
          <code className="ml-1 rounded bg-muted px-1.5 py-0.5">NEXT_PUBLIC_BATCHES_UI_V2=1</code>.
        </p>
        <Link href="/batches" className="text-primary underline">
          Back to batches
        </Link>
      </div>
    )
  }

  const id = params?.id
  if (!id) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Batch Not Found</h1>
        <p className="text-sm text-muted-foreground">No batch id provided.</p>
        <Link href="/batches" className="text-primary underline">
          Back to batches
        </Link>
      </div>
    )
  }

  return <BatchFormClient mode="edit" id={id} />
}