import { Suspense } from "react";
import { LineupLab } from "@/components/dashboard/LineupLab";
import { PageSkeleton } from "@/components/ui/LoadingSkeleton";

export default function LineupsPage() {
  // LineupLab keeps the selection in ?on= / ?off= via useSearchParams, which needs a Suspense boundary
  return (
    <Suspense fallback={<PageSkeleton />}>
      <LineupLab />
    </Suspense>
  );
}
