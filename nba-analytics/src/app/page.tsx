import { TeamDashboardClient } from "./teams/[teamId]/TeamDashboardClient";

const LAKERS_ID = "1610612747";

export default function HomePage() {
  return <TeamDashboardClient teamId={LAKERS_ID} />;
}
