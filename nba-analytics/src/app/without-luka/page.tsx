import { Suspense } from "react";
import { WithoutStar } from "@/components/dashboard/WithoutStar";
import { PageSkeleton } from "@/components/ui/LoadingSkeleton";

export default function WithoutLukaPage() {
  // WithoutStar keeps the picked player in ?player= via useSearchParams, which needs a Suspense boundary
  return (
    <Suspense fallback={<PageSkeleton />}>
      <WithoutStar />
    </Suspense>
  );
}
