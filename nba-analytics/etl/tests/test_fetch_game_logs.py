"""
Tests that GameBoxScore and PlayerGameLog tables are populated correctly.
"""

from sqlalchemy import text


class TestFetchGameLogs:
    def test_game_box_scores_exist(self, db):
        """At least 1 GameBoxScore row should be present."""
        result = db.execute(text('SELECT COUNT(*) FROM "GameBoxScore"'))
        count = result.scalar()
        assert count >= 1, f"Expected at least 1 GameBoxScore row, found {count}"

    def test_player_game_logs_exist(self, db):
        """At least 1 PlayerGameLog row should be present."""
        result = db.execute(text('SELECT COUNT(*) FROM "PlayerGameLog"'))
        count = result.scalar()
        assert count >= 1, f"Expected at least 1 PlayerGameLog row, found {count}"

    def test_game_log_required_fields(self, db):
        """PlayerGameLog rows should have non-null: playerId, teamId, gameId, gameDate, points."""
        result = db.execute(
            text(
                'SELECT COUNT(*) FROM "PlayerGameLog" '
                'WHERE "playerId" IS NULL '
                'OR "teamId" IS NULL '
                'OR "gameId" IS NULL '
                'OR "gameDate" IS NULL '
                'OR "points" IS NULL'
            )
        )
        null_count = result.scalar()
        assert null_count == 0, (
            f"Found {null_count} PlayerGameLog rows with null required fields "
            "(playerId, teamId, gameId, gameDate, or points)"
        )

    def test_no_duplicate_game_logs(self, db):
        """No duplicate (playerId, gameId, teamId) combos in PlayerGameLog."""
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
            f"Found {dupe_count} duplicate (playerId, gameId, teamId) combinations "
            "in PlayerGameLog"
        )
