import { RosterPageClient } from "../teams/[teamId]/roster/RosterPageClient";
import { FOCUS_TEAM_ID } from "@/lib/constants";

export default function RosterPage() {
  return <RosterPageClient teamId={FOCUS_TEAM_ID} />;
}
