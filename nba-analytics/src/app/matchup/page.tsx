import { Suspense } from "react";
import { MatchupView } from "@/components/dashboard/MatchupView";
import { PageSkeleton } from "@/components/ui/LoadingSkeleton";

export default function MatchupPage() {
  // MatchupView reads ?view= and MatchupDashboard ?opponent= via useSearchParams, which needs a Suspense boundary
  return (
    <Suspense fallback={<PageSkeleton />}>
      <MatchupView />
    </Suspense>
  );
}
