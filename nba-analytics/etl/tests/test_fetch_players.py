"""
Tests that the Player table is populated correctly by the ETL pipeline.
"""

from sqlalchemy import text
from conftest import LEBRON_ID


class TestFetchPlayers:
    def test_players_exist(self, db):
        """At least 2 players should exist in the database."""
        result = db.execute(text('SELECT COUNT(*) FROM "Player"'))
        count = result.scalar()
        assert count >= 2, f"Expected at least 2 players, found {count}"

    def test_lebron_exists(self, db):
        """LeBron row should exist with correct name fields."""
        result = db.execute(
            text(
                'SELECT "id", "firstName", "lastName", "fullName" '
                'FROM "Player" WHERE "id" = :player_id'
            ),
            {"player_id": LEBRON_ID},
        )
        row = result.fetchone()
        assert row is not None, f"LeBron (id={LEBRON_ID}) not found in Player table"
        assert row[1] == "LeBron", f"Expected firstName 'LeBron', got '{row[1]}'"
        assert row[2] == "James", f"Expected lastName 'James', got '{row[2]}'"
        assert row[3] is not None, "fullName should not be null"

    def test_players_have_team(self, db):
        """At least some players should have a non-null teamId."""
        result = db.execute(
            text('SELECT COUNT(*) FROM "Player" WHERE "teamId" IS NOT NULL')
        )
        count = result.scalar()
        assert count > 0, "Expected at least some players with a non-null teamId"

    def test_no_duplicate_players(self, db):
        """Distinct player count should match total player count."""
        total = db.execute(text('SELECT COUNT(*) FROM "Player"')).scalar()
        distinct = db.execute(
            text('SELECT COUNT(DISTINCT "id") FROM "Player"')
        ).scalar()
        assert total == distinct, (
            f"Duplicate players detected: {total} total vs {distinct} distinct"
        )
