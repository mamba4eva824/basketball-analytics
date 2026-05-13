import { RosterPageClient } from "./RosterPageClient";
export default async function RosterPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  return <RosterPageClient teamId={teamId} />;
}
