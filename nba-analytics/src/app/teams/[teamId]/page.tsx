import { TeamDashboardClient } from "./TeamDashboardClient";

export default async function TeamDashboardPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  return <TeamDashboardClient teamId={teamId} />;
}
