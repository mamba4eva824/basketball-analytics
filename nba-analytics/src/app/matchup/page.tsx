import { Suspense } from "react";
import { MatchupDashboard } from "@/components/dashboard/MatchupDashboard";
import { PageSkeleton } from "@/components/ui/LoadingSkeleton";

export default function MatchupPage() {
  // MatchupDashboard reads ?opponent= via useSearchParams, which needs a Suspense boundary
  return (
    <Suspense fallback={<PageSkeleton />}>
      <MatchupDashboard />
    </Suspense>
  );
}
