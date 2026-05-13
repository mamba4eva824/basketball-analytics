import { ShotChartPageClient } from "./ShotChartPageClient";

export default async function ShotChartPage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await params;
  return <ShotChartPageClient playerId={playerId} />;
}
