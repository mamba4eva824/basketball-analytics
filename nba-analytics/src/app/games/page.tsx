import { GamesPageClient } from "../teams/[teamId]/games/GamesPageClient";
import { FOCUS_TEAM_ID } from "@/lib/constants";

export default function GamesPage() {
  return <GamesPageClient teamId={FOCUS_TEAM_ID} />;
}
