"""
Tests that the Team table has been populated correctly by the ETL pipeline.
"""

from sqlalchemy import text
from conftest import LAKERS_ID


class TestFetchTeams:
    def test_teams_exist(self, db):
        """At least 2 teams should be present in the database."""
        result = db.execute(text('SELECT COUNT(*) FROM "Team"'))
        count = result.scalar()
        assert count >= 2, f"Expected at least 2 teams, found {count}"

    def test_lakers_exist(self, db):
        """Lakers row with id '1610612747' should exist with abbreviation 'LAL'."""
        result = db.execute(
            text('SELECT "id", "abbreviation" FROM "Team" WHERE "id" = :team_id'),
            {"team_id": LAKERS_ID},
        )
        row = result.fetchone()
        assert row is not None, f"Lakers (id={LAKERS_ID}) not found in Team table"
        assert row[1] == "LAL", f"Expected abbreviation 'LAL', got '{row[1]}'"

    def test_no_duplicate_teams(self, db):
        """Count of teams should equal count of distinct team IDs."""
        total = db.execute(text('SELECT COUNT(*) FROM "Team"')).scalar()
        distinct = db.execute(text('SELECT COUNT(DISTINCT "id") FROM "Team"')).scalar()
        assert total == distinct, (
            f"Duplicate teams detected: {total} total vs {distinct} distinct"
        )

    def test_team_has_required_fields(self, db):
        """Lakers row should have non-null: name, city, nickname, conference, division."""
        result = db.execute(
            text(
                'SELECT "name", "city", "nickname", "conference", "division" '
                'FROM "Team" WHERE "id" = :team_id'
            ),
            {"team_id": LAKERS_ID},
        )
        row = result.fetchone()
        assert row is not None, f"Lakers (id={LAKERS_ID}) not found"

        field_names = ["name", "city", "nickname", "conference", "division"]
        for i, field in enumerate(field_names):
            assert row[i] is not None, f"Team field '{field}' is null for Lakers"
