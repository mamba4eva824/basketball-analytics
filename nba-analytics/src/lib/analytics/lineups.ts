/** Starting-lineup usage from game logs. Spec: basketball-metrics → "Starting lineups". */

export interface StarterLog {
  gameId: string;
  playerId: string;
  started: boolean;
}

export interface GameOutcome {
  gameId: string;
  gameDate: Date;
  won: boolean;
  margin: number;
}

export interface StartingUnit {
  playerIds: string[];
  games: number;
  wins: number;
  losses: number;
  avgMargin: number;
  lastUsed: Date;
}

export function startingLineups(
  logs: StarterLog[],
  outcomes: GameOutcome[],
): { units: StartingUnit[]; gamesMissingStarterData: number } {
  const startersByGame = new Map<string, string[]>();
  for (const l of logs) {
    if (!l.started) continue;
    if (!startersByGame.has(l.gameId)) startersByGame.set(l.gameId, []);
    startersByGame.get(l.gameId)!.push(l.playerId);
  }

  const units = new Map<string, StartingUnit & { marginSum: number }>();
  let missing = 0;
  for (const o of outcomes) {
    const starters = startersByGame.get(o.gameId);
    if (!starters || starters.length !== 5) {
      missing += 1;
      continue;
    }
    const ids = [...starters].sort();
    const key = ids.join("-");
    const u = units.get(key) ?? { playerIds: ids, games: 0, wins: 0, losses: 0, avgMargin: 0, marginSum: 0, lastUsed: o.gameDate };
    u.games += 1;
    if (o.won) u.wins += 1;
    else u.losses += 1;
    u.marginSum += o.margin;
    if (o.gameDate > u.lastUsed) u.lastUsed = o.gameDate;
    units.set(key, u);
  }

  return {
    units: [...units.values()]
      .map(({ marginSum, ...u }) => ({ ...u, avgMargin: marginSum / u.games }))
      .sort((a, b) => b.games - a.games || b.lastUsed.getTime() - a.lastUsed.getTime()),
    gamesMissingStarterData: missing,
  };
}
