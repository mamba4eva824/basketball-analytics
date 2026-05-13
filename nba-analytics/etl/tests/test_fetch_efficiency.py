"""
Tests for TeamGameEfficiency and TeamEfficiencySnapshot tables.
"""

from sqlalchemy import text


class TestFetchEfficiency:
    def test_game_efficiency_exists(self, db):
        """At least 1 TeamGameEfficiency row should be present."""
        result = db.execute(text('SELECT COUNT(*) FROM "TeamGameEfficiency"'))
        count = result.scalar()
        assert count >= 1, (
            f"Expected at least 1 TeamGameEfficiency row, found {count}"
        )

    def test_efficiency_values_in_range(self, db):
        """offRating should be between 85 and 135, defRating between 85 and 135."""
        result = db.execute(
            text(
                'SELECT COUNT(*) FROM "TeamGameEfficiency" '
                'WHERE "offRating" IS NOT NULL '
                'AND ("offRating" < 85 OR "offRating" > 135)'
            )
        )
        off_outliers = result.scalar()
        assert off_outliers == 0, (
            f"Found {off_outliers} TeamGameEfficiency rows with offRating outside 85-135"
        )

        result = db.execute(
            text(
                'SELECT COUNT(*) FROM "TeamGameEfficiency" '
                'WHERE "defRating" IS NOT NULL '
                'AND ("defRating" < 85 OR "defRating" > 135)'
            )
        )
        def_outliers = result.scalar()
        assert def_outliers == 0, (
            f"Found {def_outliers} TeamGameEfficiency rows with defRating outside 85-135"
        )

    def test_snapshots_exist(self, db):
        """At least 1 TeamEfficiencySnapshot row should be present."""
        result = db.execute(text('SELECT COUNT(*) FROM "TeamEfficiencySnapshot"'))
        count = result.scalar()
        assert count >= 1, (
            f"Expected at least 1 TeamEfficiencySnapshot row, found {count}"
        )

    def test_snapshot_has_window(self, db):
        """window field should not be null (values like 'L5', 'L10', 'Season')."""
        result = db.execute(
            text(
                'SELECT COUNT(*) FROM "TeamEfficiencySnapshot" '
                'WHERE "window" IS NULL'
            )
        )
        null_count = result.scalar()
        assert null_count == 0, (
            f"Found {null_count} TeamEfficiencySnapshot rows with null window"
        )
