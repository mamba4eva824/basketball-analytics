"""
Quick-shot seed script: Pull real Lakers 2024-25 data from nba_api and insert into PostgreSQL.
Maps directly to the Prisma schema tables.
"""
import os
import time
import sys
import uuid
from datetime import datetime, date, timezone

import pandas as pd

def cuid():
    return "c" + uuid.uuid4().hex[:24]
from sqlalchemy import create_engine, text

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/nba_analytics")
SEASON = "2025-26"
SEASON_START_YEAR = 2025
SEASON_END_YEAR = 2026
LAKERS_ID = "1610612747"

engine = create_engine(DATABASE_URL)

def safe_call(endpoint_class, **kwargs):
    max_retries = 3
    for attempt in range(max_retries):
        try:
            time.sleep(0.7)
            result = endpoint_class(**kwargs)
            return result.get_data_frames()
        except Exception as e:
            print(f"  Retry {attempt+1}/{max_retries}: {e}")
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)
            else:
                raise

def upsert(conn, table, data, conflict_cols):
    if not data:
        return
    cols = list(data[0].keys())
    placeholders = ", ".join([f":{c}" for c in cols])
    col_names = ", ".join([f'"{c}"' for c in cols])
    conflict = ", ".join([f'"{c}"' for c in conflict_cols])
    updates = ", ".join([f'"{c}" = EXCLUDED."{c}"' for c in cols if c not in conflict_cols and c != "createdAt"])
    sql = f'INSERT INTO "{table}" ({col_names}) VALUES ({placeholders}) ON CONFLICT ({conflict}) DO UPDATE SET {updates}'
    for row in data:
        conn.execute(text(sql), row)

# ──────────────────────────────────────────────
# NBA team metadata (all 30 — needed for standings/opponents)
# ──────────────────────────────────────────────
TEAM_CONFERENCE = {
    "ATL": "EAST", "BOS": "EAST", "BKN": "EAST", "CHA": "EAST", "CHI": "EAST",
    "CLE": "EAST", "DET": "EAST", "IND": "EAST", "MIA": "EAST", "MIL": "EAST",
    "NYK": "EAST", "ORL": "EAST", "PHI": "EAST", "TOR": "EAST", "WAS": "EAST",
    "DAL": "WEST", "DEN": "WEST", "GSW": "WEST", "HOU": "WEST", "LAC": "WEST",
    "LAL": "WEST", "MEM": "WEST", "MIN": "WEST", "NOP": "WEST", "OKC": "WEST",
    "PHX": "WEST", "POR": "WEST", "SAC": "WEST", "SAS": "WEST", "UTA": "WEST",
}
TEAM_DIVISION = {
    "ATL": "SOUTHEAST", "BOS": "ATLANTIC", "BKN": "ATLANTIC", "CHA": "SOUTHEAST", "CHI": "CENTRAL",
    "CLE": "CENTRAL", "DET": "CENTRAL", "IND": "CENTRAL", "MIA": "SOUTHEAST", "MIL": "CENTRAL",
    "NYK": "ATLANTIC", "ORL": "SOUTHEAST", "PHI": "ATLANTIC", "TOR": "ATLANTIC", "WAS": "SOUTHEAST",
    "DAL": "SOUTHWEST", "DEN": "NORTHWEST", "GSW": "PACIFIC", "HOU": "SOUTHWEST", "LAC": "PACIFIC",
    "LAL": "PACIFIC", "MEM": "SOUTHWEST", "MIN": "NORTHWEST", "NOP": "SOUTHWEST", "OKC": "NORTHWEST",
    "PHX": "PACIFIC", "POR": "NORTHWEST", "SAC": "PACIFIC", "SAS": "SOUTHWEST", "UTA": "NORTHWEST",
}

def seed_all():
    from nba_api.stats.static import teams as static_teams, players as static_players
    from nba_api.stats.endpoints import (
        CommonTeamRoster, PlayerGameLog, TeamGameLog,
        LeagueGameFinder, ShotChartDetail, LeagueStandings,
        LeagueDashTeamStats, LeagueDashPlayerStats,
    )

    with engine.begin() as conn:
        # Clear existing data (order matters for FK constraints)
        print("Clearing existing data...")
        for table in ["ShotChart", "TeamGameEfficiency", "TeamEfficiencySnapshot",
                       "PlayerGameLog", "PlayerSeasonStats", "LineupStats",
                       "GameBoxScore", "Standing", "TeamSeasonStats",
                       "Player", "Team", "Season"]:
            conn.execute(text(f'DELETE FROM "{table}"'))

        now = datetime.now(timezone.utc).isoformat()

        # ── Season ──
        print("Seeding Season...")
        conn.execute(text(
            'INSERT INTO "Season" (id, "startYear", "endYear", "displayName", "isCurrent", "createdAt", "updatedAt") '
            "VALUES (:id, :startYear, :endYear, :displayName, :isCurrent, :createdAt, :updatedAt) "
            "ON CONFLICT (id) DO UPDATE SET \"isCurrent\" = EXCLUDED.\"isCurrent\", \"updatedAt\" = EXCLUDED.\"updatedAt\""
        ), {"id": SEASON, "startYear": SEASON_START_YEAR, "endYear": SEASON_END_YEAR,
            "displayName": f"{SEASON} Season", "isCurrent": True, "createdAt": now, "updatedAt": now})

        # ── All 30 Teams ──
        print("Seeding all 30 teams...")
        all_nba_teams = static_teams.get_teams()
        team_rows = []
        for t in all_nba_teams:
            abbr = t["abbreviation"]
            team_rows.append({
                "id": str(t["id"]),
                "abbreviation": abbr,
                "name": t["full_name"],
                "city": t["city"],
                "nickname": t["nickname"],
                "conference": TEAM_CONFERENCE.get(abbr, "WEST"),
                "division": TEAM_DIVISION.get(abbr, "PACIFIC"),
                "logoUrl": None,
                "primaryColor": "#552583" if abbr == "LAL" else None,
                "secondaryColor": "#FDB927" if abbr == "LAL" else None,
                "createdAt": now,
                "updatedAt": now,
            })
        upsert(conn, "Team", team_rows, ["id"])
        print(f"  {len(team_rows)} teams inserted")

        # ── Lakers Roster → Players ──
        print("Fetching Lakers roster...")
        roster_frames = safe_call(CommonTeamRoster, team_id=LAKERS_ID, season=SEASON)
        roster_df = roster_frames[0]
        player_rows = []
        for _, r in roster_df.iterrows():
            pid = str(r["PLAYER_ID"])
            name_parts = r["PLAYER"].split(" ", 1)
            player_rows.append({
                "id": pid,
                "firstName": name_parts[0],
                "lastName": name_parts[1] if len(name_parts) > 1 else "",
                "fullName": r["PLAYER"],
                "birthDate": None,
                "height": r.get("HEIGHT"),
                "weight": int(r["WEIGHT"]) if pd.notna(r.get("WEIGHT")) else None,
                "position": r.get("POSITION"),
                "jersey": r.get("NUM"),
                "isActive": True,
                "fromYear": None, "toYear": None,
                "draftYear": None, "draftRound": None, "draftPick": None,
                "country": None,
                "school": r.get("SCHOOL"),
                "headshotUrl": None,
                "teamId": LAKERS_ID,
                "createdAt": now, "updatedAt": now,
            })
        upsert(conn, "Player", player_rows, ["id"])
        print(f"  {len(player_rows)} players inserted")

        # ── Team Game Log → GameBoxScore + TeamGameEfficiency ──
        print("Fetching Lakers team game log...")
        tgl_frames = safe_call(TeamGameLog, team_id=LAKERS_ID, season=SEASON)
        tgl_df = tgl_frames[0]

        # Also get plus/minus from LeagueGameFinder
        print("Fetching game finder for plus/minus...")
        lgf_frames = safe_call(LeagueGameFinder, team_id_nullable=LAKERS_ID, season_nullable=SEASON)
        lgf_df = lgf_frames[0]
        pm_map = {}
        for _, row in lgf_df.iterrows():
            pm_map[row["GAME_ID"]] = float(row["PLUS_MINUS"])

        box_rows = []
        eff_rows = []
        for _, g in tgl_df.iterrows():
            gid = g["Game_ID"]
            gdate = datetime.strptime(g["GAME_DATE"], "%b %d, %Y").isoformat()
            matchup = g["MATCHUP"]
            is_home = "vs." in matchup
            pts = int(g["PTS"])
            pm = pm_map.get(gid, 0)
            opp_pts = int(pts - pm)

            # Parse opponent from matchup
            opp_abbr = matchup.split(" ")[-1]
            opp_team = None
            for t in all_nba_teams:
                if t["abbreviation"] == opp_abbr:
                    opp_team = str(t["id"])
                    break
            if not opp_team:
                opp_team = LAKERS_ID  # fallback

            home_id = LAKERS_ID if is_home else opp_team
            away_id = opp_team if is_home else LAKERS_ID

            # Team box score
            fgm, fga = int(g["FGM"]), int(g["FGA"])
            fg3m, fg3a = int(g["FG3M"]), int(g["FG3A"])
            ftm, fta = int(g["FTM"]), int(g["FTA"])
            oreb, dreb, reb = int(g["OREB"]), int(g["DREB"]), int(g["REB"])
            ast, stl, blk, tov, pf = int(g["AST"]), int(g["STL"]), int(g["BLK"]), int(g["TOV"]), int(g["PF"])

            box_rows.append({
                "id": cuid(),
                "gameId": gid, "gameDate": gdate, "season": SEASON, "seasonId": SEASON,
                "homeTeamId": home_id, "awayTeamId": away_id,
                "homePoints": pts if is_home else opp_pts,
                "homeFieldGoals": fgm if is_home else 0, "homeFieldGoalAtt": fga if is_home else 0,
                "homeFieldGoalPct": float(g["FG_PCT"]) if is_home else None,
                "homeThreePointers": fg3m if is_home else 0, "homeThreePointAtt": fg3a if is_home else 0,
                "homeThreePointPct": float(g["FG3_PCT"]) if is_home else None,
                "homeFreeThrows": ftm if is_home else 0, "homeFreeThrowAtt": fta if is_home else 0,
                "homeFreeThrowPct": float(g["FT_PCT"]) if is_home else None,
                "homeReboundsOff": oreb if is_home else None,
                "homeReboundsDef": dreb if is_home else None,
                "homeReboundsTotal": reb if is_home else 0,
                "homeAssists": ast if is_home else 0, "homeSteals": stl if is_home else 0,
                "homeBlocks": blk if is_home else 0, "homeTurnovers": tov if is_home else 0,
                "homePersonalFouls": pf if is_home else None,
                "homeFastBreakPts": None, "homePtsInPaint": None,
                "homePtsOffTurnovers": None, "homeSecondChancePts": None,
                "awayPoints": opp_pts if is_home else pts,
                "awayFieldGoals": 0 if is_home else fgm, "awayFieldGoalAtt": 0 if is_home else fga,
                "awayFieldGoalPct": None if is_home else float(g["FG_PCT"]),
                "awayThreePointers": 0 if is_home else fg3m, "awayThreePointAtt": 0 if is_home else fg3a,
                "awayThreePointPct": None if is_home else float(g["FG3_PCT"]),
                "awayFreeThrows": 0 if is_home else ftm, "awayFreeThrowAtt": 0 if is_home else fta,
                "awayFreeThrowPct": None if is_home else float(g["FT_PCT"]),
                "awayReboundsOff": None if is_home else oreb,
                "awayReboundsDef": None if is_home else dreb,
                "awayReboundsTotal": 0 if is_home else reb,
                "awayAssists": 0 if is_home else ast, "awaySteals": 0 if is_home else stl,
                "awayBlocks": 0 if is_home else blk, "awayTurnovers": 0 if is_home else tov,
                "awayPersonalFouls": None if is_home else pf,
                "awayFastBreakPts": None, "awayPtsInPaint": None,
                "awayPtsOffTurnovers": None, "awaySecondChancePts": None,
                "arena": None, "attendance": None, "isPlayoff": False, "seriesId": None,
                "createdAt": now, "updatedAt": now,
            })

            # Efficiency estimate
            poss = fga - oreb + tov + (0.44 * fta)
            if poss > 0:
                eff_rows.append({
                    "id": cuid(),
                    "teamId": LAKERS_ID, "gameId": gid, "season": SEASON, "seasonId": SEASON,
                    "gameDate": gdate,
                    "offRating": round((pts / poss) * 100, 1),
                    "defRating": round((opp_pts / poss) * 100, 1),
                    "netRating": round(((pts - opp_pts) / poss) * 100, 1),
                    "pace": round(poss, 1),
                    "possessions": round(poss, 1),
                    "result": g["WL"], "homeAway": "HOME" if is_home else "AWAY",
                    "createdAt": now, "updatedAt": now,
                })

        upsert(conn, "GameBoxScore", box_rows, ["gameId"])
        print(f"  {len(box_rows)} game box scores inserted")
        upsert(conn, "TeamGameEfficiency", eff_rows, ["teamId", "gameId"])
        print(f"  {len(eff_rows)} team game efficiency rows inserted")

        # ── Player Game Logs ──
        print("Fetching player game logs (this takes a minute)...")
        player_ids = [r["id"] for r in player_rows]
        pgl_rows = []
        for i, pid in enumerate(player_ids):
            sys.stdout.write(f"\r  Player {i+1}/{len(player_ids)}: {pid}")
            sys.stdout.flush()
            try:
                frames = safe_call(PlayerGameLog, player_id=pid, season=SEASON)
                df = frames[0]
                for _, p in df.iterrows():
                    gid = p["Game_ID"]
                    # Check if game exists in our box scores
                    if gid not in [b["gameId"] for b in box_rows]:
                        continue
                    matchup = p["MATCHUP"]
                    is_home = "vs." in matchup
                    pgl_rows.append({
                        "id": cuid(),
                        "playerId": pid, "teamId": LAKERS_ID, "gameId": gid,
                        "season": SEASON, "seasonId": SEASON,
                        "gameDate": datetime.strptime(p["GAME_DATE"], "%b %d, %Y").isoformat(),
                        "homeAway": "HOME" if is_home else "AWAY",
                        "result": p["WL"],
                        "minutes": float(p["MIN"]) if pd.notna(p["MIN"]) else None,
                        "minutesStr": str(int(p["MIN"])) + ":00" if pd.notna(p["MIN"]) else None,
                        "points": int(p["PTS"]) if pd.notna(p["PTS"]) else 0,
                        "fieldGoals": int(p["FGM"]) if pd.notna(p["FGM"]) else 0,
                        "fieldGoalAtt": int(p["FGA"]) if pd.notna(p["FGA"]) else 0,
                        "fieldGoalPct": float(p["FG_PCT"]) if pd.notna(p["FG_PCT"]) else None,
                        "threePointers": int(p["FG3M"]) if pd.notna(p["FG3M"]) else 0,
                        "threePointAtt": int(p["FG3A"]) if pd.notna(p["FG3A"]) else 0,
                        "threePointPct": float(p["FG3_PCT"]) if pd.notna(p["FG3_PCT"]) else None,
                        "freeThrows": int(p["FTM"]) if pd.notna(p["FTM"]) else 0,
                        "freeThrowAtt": int(p["FTA"]) if pd.notna(p["FTA"]) else 0,
                        "freeThrowPct": float(p["FT_PCT"]) if pd.notna(p["FT_PCT"]) else None,
                        "reboundsOff": int(p["OREB"]) if pd.notna(p["OREB"]) else 0,
                        "reboundsDef": int(p["DREB"]) if pd.notna(p["DREB"]) else 0,
                        "reboundsTotal": int(p["REB"]) if pd.notna(p["REB"]) else 0,
                        "assists": int(p["AST"]) if pd.notna(p["AST"]) else 0,
                        "steals": int(p["STL"]) if pd.notna(p["STL"]) else 0,
                        "blocks": int(p["BLK"]) if pd.notna(p["BLK"]) else 0,
                        "turnovers": int(p["TOV"]) if pd.notna(p["TOV"]) else 0,
                        "personalFouls": int(p["PF"]) if pd.notna(p["PF"]) else 0,
                        "plusMinus": float(p["PLUS_MINUS"]) if pd.notna(p["PLUS_MINUS"]) else None,
                        "offRating": None, "defRating": None, "netRating": None,
                        "assistPct": None, "reboundPct": None, "trueShootingPct": None,
                        "effectiveFgPct": None, "usageRate": None, "pace": None, "pir": None,
                        "started": False, "dnp": False, "dnpReason": None,
                        "createdAt": now, "updatedAt": now,
                    })
            except Exception as e:
                print(f"\n  Warning: Could not fetch game log for {pid}: {e}")
        print(f"\n  {len(pgl_rows)} player game log rows inserted")
        upsert(conn, "PlayerGameLog", pgl_rows, ["playerId", "gameId", "teamId"])

        # ── Player Season Stats (aggregate from game logs) ──
        print("Computing player season stats...")
        pss_rows = []
        for pid in player_ids:
            player_games = [r for r in pgl_rows if r["playerId"] == pid]
            gp = len(player_games)
            if gp == 0:
                continue
            pss_rows.append({
                "id": cuid(),
                "playerId": pid, "teamId": LAKERS_ID, "season": SEASON, "seasonId": SEASON,
                "gamesPlayed": gp, "gamesStarted": 0,
                "minutesPerGame": round(sum(g["minutes"] or 0 for g in player_games) / gp, 1),
                "pointsPerGame": round(sum(g["points"] for g in player_games) / gp, 1),
                "fieldGoalsPerGame": round(sum(g["fieldGoals"] for g in player_games) / gp, 1),
                "fieldGoalAttPerGame": round(sum(g["fieldGoalAtt"] for g in player_games) / gp, 1),
                "fieldGoalPct": round(sum(g["fieldGoals"] for g in player_games) / max(sum(g["fieldGoalAtt"] for g in player_games), 1), 3),
                "threePointersPerGame": round(sum(g["threePointers"] for g in player_games) / gp, 1),
                "threePointAttPerGame": round(sum(g["threePointAtt"] for g in player_games) / gp, 1),
                "threePointPct": round(sum(g["threePointers"] for g in player_games) / max(sum(g["threePointAtt"] for g in player_games), 1), 3),
                "freeThrowsPerGame": round(sum(g["freeThrows"] for g in player_games) / gp, 1),
                "freeThrowAttPerGame": round(sum(g["freeThrowAtt"] for g in player_games) / gp, 1),
                "freeThrowPct": round(sum(g["freeThrows"] for g in player_games) / max(sum(g["freeThrowAtt"] for g in player_games), 1), 3),
                "reboundsOffPerGame": round(sum(g["reboundsOff"] for g in player_games) / gp, 1),
                "reboundsDefPerGame": round(sum(g["reboundsDef"] for g in player_games) / gp, 1),
                "reboundsPerGame": round(sum(g["reboundsTotal"] for g in player_games) / gp, 1),
                "assistsPerGame": round(sum(g["assists"] for g in player_games) / gp, 1),
                "stealsPerGame": round(sum(g["steals"] for g in player_games) / gp, 1),
                "blocksPerGame": round(sum(g["blocks"] for g in player_games) / gp, 1),
                "turnoversPerGame": round(sum(g["turnovers"] for g in player_games) / gp, 1),
                "foulsPerGame": round(sum(g["personalFouls"] for g in player_games) / gp, 1),
                "plusMinusPerGame": round(sum(g["plusMinus"] or 0 for g in player_games) / gp, 1),
                "totalPoints": sum(g["points"] for g in player_games),
                "totalRebounds": sum(g["reboundsTotal"] for g in player_games),
                "totalAssists": sum(g["assists"] for g in player_games),
                "totalSteals": sum(g["steals"] for g in player_games),
                "totalBlocks": sum(g["blocks"] for g in player_games),
                "totalTurnovers": sum(g["turnovers"] for g in player_games),
                "trueShootingPct": None, "effectiveFgPct": None, "usageRate": None,
                "assistPct": None, "reboundPct": None, "offRating": None, "defRating": None,
                "netRating": None, "per": None, "winShares": None, "boxPlusMinus": None, "vorp": None,
                "createdAt": now, "updatedAt": now,
            })
        upsert(conn, "PlayerSeasonStats", pss_rows, ["playerId", "teamId", "season"])
        print(f"  {len(pss_rows)} player season stats inserted")

        # ── Advanced Player Stats (TS%, eFG%, USG%, ratings) ──
        print("Fetching advanced player stats...")
        try:
            adv_player_frames = safe_call(LeagueDashPlayerStats,
                measure_type_detailed_defense="Advanced", season=SEASON)
            adv_player_df = adv_player_frames[0]
            lakers_player_ids_set = set(player_ids)
            updated_count = 0
            for _, ap in adv_player_df.iterrows():
                ap_id = str(ap["PLAYER_ID"])
                if ap_id not in lakers_player_ids_set:
                    continue
                update_vals = {
                    "pid": ap_id,
                    "tid": LAKERS_ID,
                    "ssn": SEASON,
                    "ts_pct": float(ap["TS_PCT"]) if pd.notna(ap.get("TS_PCT")) else None,
                    "efg_pct": float(ap["EFG_PCT"]) if "EFG_PCT" in ap.index and pd.notna(ap.get("EFG_PCT")) else None,
                    "usg_pct": float(ap["USG_PCT"]) if pd.notna(ap.get("USG_PCT")) else None,
                    "off_rtg": float(ap["OFF_RATING"]) if pd.notna(ap.get("OFF_RATING")) else None,
                    "def_rtg": float(ap["DEF_RATING"]) if pd.notna(ap.get("DEF_RATING")) else None,
                    "net_rtg": float(ap["NET_RATING"]) if pd.notna(ap.get("NET_RATING")) else None,
                }
                conn.execute(text(
                    'UPDATE "PlayerSeasonStats" SET '
                    '"trueShootingPct" = :ts_pct, '
                    '"effectiveFgPct" = :efg_pct, '
                    '"usageRate" = :usg_pct, '
                    '"offRating" = :off_rtg, '
                    '"defRating" = :def_rtg, '
                    '"netRating" = :net_rtg '
                    'WHERE "playerId" = :pid AND "teamId" = :tid AND "season" = :ssn'
                ), update_vals)
                updated_count += 1
            print(f"  {updated_count} player season stats updated with advanced metrics")
        except Exception as e:
            print(f"  Warning: Could not fetch advanced player stats: {e}")

        # ── Team Season Stats ──
        print("Fetching team season stats (advanced)...")
        adv_frames = safe_call(LeagueDashTeamStats, season=SEASON, measure_type_detailed_defense="Advanced")
        adv_df = adv_frames[0]
        lakers_adv = adv_df[adv_df["TEAM_ID"] == int(LAKERS_ID)]

        # Fetch Base per-game stats for the 9 fields not available in Advanced
        base_fg_pct = None
        base_fg3_pct = None
        base_ft_pct = None
        base_reb = None
        base_ast = None
        base_stl = None
        base_blk = None
        base_tov = None
        base_ft_rate = None
        try:
            print("Fetching team season stats (base per-game)...")
            base_frames = safe_call(LeagueDashTeamStats, season=SEASON, per_mode_detailed="PerGame")
            base_df = base_frames[0]
            lakers_base = base_df[base_df["TEAM_ID"] == int(LAKERS_ID)]
            if len(lakers_base) > 0:
                lb = lakers_base.iloc[0]
                base_fg_pct = float(lb["FG_PCT"])
                base_fg3_pct = float(lb["FG3_PCT"])
                base_ft_pct = float(lb["FT_PCT"])
                base_reb = float(lb["REB"])
                base_ast = float(lb["AST"])
                base_stl = float(lb["STL"])
                base_blk = float(lb["BLK"])
                base_tov = float(lb["TOV"])
                fga = float(lb["FGA"])
                fta = float(lb["FTA"])
                base_ft_rate = round(fta / fga, 4) if fga > 0 else None
                print("  Base per-game stats fetched successfully")
        except Exception as e:
            print(f"  Warning: Could not fetch base team stats: {e}")

        if len(lakers_adv) > 0:
            la = lakers_adv.iloc[0]
            tss_row = {
                "id": cuid(),
                "teamId": LAKERS_ID, "season": SEASON, "seasonId": SEASON,
                "gamesPlayed": int(la["GP"]), "wins": int(la["W"]), "losses": int(la["L"]),
                "winPct": float(la["W_PCT"]),
                "pointsPerGame": round(sum(b["homePoints"] if b["homeTeamId"] == LAKERS_ID else b["awayPoints"] for b in box_rows) / max(len(box_rows), 1), 1),
                "oppPointsPerGame": round(sum(b["awayPoints"] if b["homeTeamId"] == LAKERS_ID else b["homePoints"] for b in box_rows) / max(len(box_rows), 1), 1),
                "fieldGoalPct": base_fg_pct, "threePointPct": base_fg3_pct, "freeThrowPct": base_ft_pct,
                "reboundsPerGame": base_reb, "assistsPerGame": base_ast, "stealsPerGame": base_stl,
                "blocksPerGame": base_blk, "turnoversPerGame": base_tov,
                "offRating": float(la["OFF_RATING"]), "defRating": float(la["DEF_RATING"]),
                "netRating": float(la["NET_RATING"]), "pace": float(la["PACE"]),
                "effectiveFgPct": float(la["EFG_PCT"]), "trueShootingPct": float(la["TS_PCT"]),
                "turnoverPct": float(la["TM_TOV_PCT"]), "offReboundPct": float(la["OREB_PCT"]),
                "freeThrowRate": base_ft_rate,
                "oppEffectiveFgPct": None, "oppTurnoverPct": None, "oppFreeThrowRate": None,
                "fastBreakPtsPerGame": None, "ptsInPaintPerGame": None,
                "ptsOffTurnoversPerGame": None, "secondChancePtsPerGame": None,
                "createdAt": now, "updatedAt": now,
            }
            upsert(conn, "TeamSeasonStats", [tss_row], ["teamId", "season"])
            print("  Lakers team season stats inserted")

        # ── Shot Chart (LeBron + top players) ──
        print("Fetching shot chart data...")
        top_players = player_ids  # all roster players
        shot_rows = []
        for pid in top_players:
            sys.stdout.write(f"\r  Shots for player {pid}...")
            sys.stdout.flush()
            try:
                frames = safe_call(ShotChartDetail,
                    team_id=LAKERS_ID, player_id=pid,
                    season_nullable=SEASON, context_measure_simple="FGA")
                df = frames[0]
                for _, s in df.iterrows():
                    gid = s["GAME_ID"]
                    if gid not in [b["gameId"] for b in box_rows]:
                        continue
                    shot_type_val = "THREE_POINTER" if "3PT" in str(s.get("SHOT_TYPE", "")) else "TWO_POINTER"
                    shot_result_val = "MADE" if s["SHOT_MADE_FLAG"] == 1 else "MISSED"
                    period = int(s["PERIOD"]) if pd.notna(s.get("PERIOD")) else None
                    mins_rem = int(s["MINUTES_REMAINING"]) if pd.notna(s.get("MINUTES_REMAINING")) else None
                    secs_rem = int(s["SECONDS_REMAINING"]) if pd.notna(s.get("SECONDS_REMAINING")) else None
                    game_clock = f"{mins_rem}:{secs_rem:02d}" if mins_rem is not None and secs_rem is not None else None

                    shot_rows.append({
                        "id": cuid(),
                        "playerId": pid, "teamId": LAKERS_ID, "gameId": gid,
                        "season": SEASON, "seasonId": SEASON,
                        "locX": float(s["LOC_X"]), "locY": float(s["LOC_Y"]),
                        "shotZone": s.get("SHOT_ZONE_BASIC"),
                        "shotZoneArea": s.get("SHOT_ZONE_AREA"),
                        "shotZoneRange": s.get("SHOT_ZONE_RANGE"),
                        "shotDistance": int(s["SHOT_DISTANCE"]) if pd.notna(s.get("SHOT_DISTANCE")) else None,
                        "shotType": shot_type_val,
                        "shotResult": shot_result_val,
                        "actionType": s.get("ACTION_TYPE"),
                        "period": period,
                        "gameClock": game_clock,
                        "shotValue": 3 if shot_type_val == "THREE_POINTER" else 2,
                        "createdAt": now, "updatedAt": now,
                    })
            except Exception as e:
                print(f"\n  Warning: Could not fetch shots for {pid}: {e}")

        print(f"\n  {len(shot_rows)} shot chart rows to insert...")
        # Batch insert shots (no natural unique key, use raw insert)
        if shot_rows:
            cols = list(shot_rows[0].keys())
            col_names = ", ".join([f'"{c}"' for c in cols])
            placeholders = ", ".join([f":{c}" for c in cols])
            sql = f'INSERT INTO "ShotChart" ({col_names}) VALUES ({placeholders})'
            for row in shot_rows:
                conn.execute(text(sql), row)
        print(f"  {len(shot_rows)} shot chart rows inserted")

        # ── Standings ──
        print("Fetching standings...")
        standings_frames = safe_call(LeagueStandings, season=SEASON)
        standings_df = standings_frames[0]
        standing_rows = []
        today = date.today().isoformat()
        for _, s in standings_df.iterrows():
            tid = str(s["TeamID"])
            conf = "WEST" if s["Conference"] == "West" else "EAST"
            record = s.get("Record", "0-0")
            parts = str(record).split("-")
            wins = int(parts[0]) if len(parts) == 2 else 0
            losses = int(parts[1]) if len(parts) == 2 else 0

            standing_rows.append({
                "id": cuid(),
                "teamId": tid, "season": SEASON, "seasonId": SEASON,
                "asOfDate": today,
                "wins": wins, "losses": losses,
                "winPct": float(s.get("WinPCT", 0)),
                "gamesBehind": float(s.get("ConferenceGamesBack", 0)) if pd.notna(s.get("ConferenceGamesBack")) else 0,
                "streak": s.get("strCurrentStreak"),
                "lastTenWins": None, "lastTenLosses": None,
                "conferenceRank": int(s.get("PlayoffRank", 0)) if pd.notna(s.get("PlayoffRank")) else None,
                "divisionRank": int(s.get("DivisionRank", 0)) if pd.notna(s.get("DivisionRank")) else None,
                "leagueRank": int(s.get("LeagueRank", 0)) if pd.notna(s.get("LeagueRank")) else None,
                "playoffSeed": int(s.get("PlayoffRank", 0)) if pd.notna(s.get("PlayoffRank")) else None,
                "homeWins": None, "homeLosses": None,
                "awayWins": None, "awayLosses": None,
                "confWins": None, "confLosses": None,
                "divWins": None, "divLosses": None,
                "clinchStatus": s.get("ClinchIndicator"),
                "pointsFor": float(s.get("PointsPG", 0)) if pd.notna(s.get("PointsPG")) else None,
                "pointsAgainst": float(s.get("OppPointsPG", 0)) if pd.notna(s.get("OppPointsPG")) else None,
                "pointDiff": float(s.get("DiffPointsPG", 0)) if pd.notna(s.get("DiffPointsPG")) else None,
                "createdAt": now, "updatedAt": now,
            })
        upsert(conn, "Standing", standing_rows, ["teamId", "season", "asOfDate"])
        print(f"  {len(standing_rows)} standings rows inserted")

        # ── Efficiency Snapshots ──
        print("Fetching efficiency snapshots...")
        snapshot_date = date.today().isoformat()
        snap_rows = []
        for window_n, window_label in [(0, "Season"), (5, "L5"), (10, "L10"), (20, "L20")]:
            kwargs = {"season": SEASON, "measure_type_detailed_defense": "Advanced"}
            if window_n > 0:
                kwargs["last_n_games"] = window_n
            try:
                frames = safe_call(LeagueDashTeamStats, **kwargs)
                df = frames[0]
                lr = df[df["TEAM_ID"] == int(LAKERS_ID)]
                if len(lr) > 0:
                    r = lr.iloc[0]
                    snap_rows.append({
                        "id": cuid(),
                        "teamId": LAKERS_ID, "season": SEASON, "seasonId": SEASON,
                        "window": window_label, "snapshotDate": snapshot_date,
                        "offRating": float(r["OFF_RATING"]), "defRating": float(r["DEF_RATING"]),
                        "netRating": float(r["NET_RATING"]), "pace": float(r["PACE"]),
                        "wins": int(r["W"]), "losses": int(r["L"]),
                        "winPct": float(r["W_PCT"]),
                        "effectiveFgPct": float(r["EFG_PCT"]), "turnoverPct": float(r["TM_TOV_PCT"]),
                        "offReboundPct": float(r["OREB_PCT"]), "freeThrowRate": None,
                        "oppEffectiveFgPct": None, "oppTurnoverPct": None,
                        "oppOffReboundPct": None, "oppFreeThrowRate": None,
                        "createdAt": now, "updatedAt": now,
                    })
            except Exception as e:
                print(f"  Warning: Snapshot {window_label} failed: {e}")
        upsert(conn, "TeamEfficiencySnapshot", snap_rows, ["teamId", "season", "window", "snapshotDate"])
        print(f"  {len(snap_rows)} efficiency snapshots inserted")

    print("\n✅ Seed complete!")

if __name__ == "__main__":
    seed_all()
