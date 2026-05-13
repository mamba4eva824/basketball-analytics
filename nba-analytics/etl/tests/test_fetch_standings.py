"""
Tests for the Standing table.
"""

from sqlalchemy import text


class TestFetchStandings:
    def test_standings_exist(self, db):
        """At least 1 Standing row should be present."""
        result = db.execute(text('SELECT COUNT(*) FROM "Standing"'))
        count = result.scalar()
        assert count >= 1, f"Expected at least 1 Standing row, found {count}"

    def test_standings_have_record(self, db):
        """wins and losses should not be null, winPct should be between 0 and 1."""
        result = db.execute(
            text(
                'SELECT COUNT(*) FROM "Standing" '
                'WHERE "wins" IS NULL OR "losses" IS NULL'
            )
        )
        null_count = result.scalar()
        assert null_count == 0, (
            f"Found {null_count} Standing rows with null wins or losses"
        )

        result = db.execute(
            text(
                'SELECT COUNT(*) FROM "Standing" '
                'WHERE "winPct" < 0 OR "winPct" > 1'
            )
        )
        out_of_range = result.scalar()
        assert out_of_range == 0, (
            f"Found {out_of_range} Standing rows with winPct outside 0-1 range"
        )

    def test_standings_have_ranking(self, db):
        """conferenceRank should not be null."""
        result = db.execute(
            text(
                'SELECT COUNT(*) FROM "Standing" '
                'WHERE "conferenceRank" IS NULL'
            )
        )
        null_count = result.scalar()
        assert null_count == 0, (
            f"Found {null_count} Standing rows with null conferenceRank"
        )
