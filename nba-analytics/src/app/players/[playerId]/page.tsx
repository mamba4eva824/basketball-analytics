import { PlayerDashboardClient } from "./PlayerDashboardClient";

export default async function PlayerDashboardPage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await params;
  return <PlayerDashboardClient playerId={playerId} />;
}
