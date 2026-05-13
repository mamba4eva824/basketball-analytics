import { GamesPageClient } from "./GamesPageClient";
export default async function GamesPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  return <GamesPageClient teamId={teamId} />;
}
