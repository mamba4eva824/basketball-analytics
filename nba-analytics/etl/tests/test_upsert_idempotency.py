"""
Tests that running queries twice doesn't create duplicates (upsert idempotency).
"""

from sqlalchemy import text


class TestUpsertIdempotency:
    def test_team_count_stable(self, db):
        """Count of teams should equal count of distinct team IDs."""
        total = db.execute(text('SELECT COUNT(*) FROM "Team"')).scalar()
        distinct = db.execute(
            text('SELECT COUNT(DISTINCT "id") FROM "Team"')
        ).scalar()
        assert total == distinct, (
            f"Team table has duplicates: {total} total rows vs {distinct} distinct IDs"
        )

    def test_player_count_stable(self, db):
        """Count of players should equal count of distinct player IDs."""
        total = db.execute(text('SELECT COUNT(*) FROM "Player"')).scalar()
        distinct = db.execute(
            text('SELECT COUNT(DISTINCT "id") FROM "Player"')
        ).scalar()
        assert total == distinct, (
            f"Player table has duplicates: {total} total rows vs {distinct} distinct IDs"
        )

    def test_game_log_count_stable(self, db):
        """No duplicate (playerId, gameId, teamId) combos should exist in PlayerGameLog."""
        result = db.execute(
            text(
                'SELECT COUNT(*) FROM ('
                '  SELECT "playerId", "gameId", "teamId" '
                '  FROM "PlayerGameLog" '
                '  GROUP BY "playerId", "gameId", "teamId" '
                '  HAVING COUNT(*) > 1'
                ') AS dupes'
            )
        )
        dupe_count = result.scalar()
        assert dupe_count == 0, (
            f"PlayerGameLog has {dupe_count} duplicate (playerId, gameId, teamId) "
            "combinations — upsert is not idempotent"
        )
