"""
Tests that ShotChart has ALL required fields (critical for frontend).
"""

from sqlalchemy import text


class TestFetchShots:
    def test_shots_exist(self, db):
        """At least 1 ShotChart row should be present."""
        result = db.execute(text('SELECT COUNT(*) FROM "ShotChart"'))
        count = result.scalar()
        assert count >= 1, f"Expected at least 1 ShotChart row, found {count}"

    def test_shot_has_coordinates(self, db):
        """locX and locY should not be null for any shot."""
        result = db.execute(
            text(
                'SELECT COUNT(*) FROM "ShotChart" '
                'WHERE "locX" IS NULL OR "locY" IS NULL'
            )
        )
        null_count = result.scalar()
        assert null_count == 0, (
            f"Found {null_count} ShotChart rows with null locX or locY"
        )

    def test_shot_has_zone_fields(self, db):
        """shotZone, shotZoneArea, shotZoneRange should not be null."""
        result = db.execute(
            text(
                'SELECT COUNT(*) FROM "ShotChart" '
                'WHERE "shotZone" IS NULL '
                'OR "shotZoneArea" IS NULL '
                'OR "shotZoneRange" IS NULL'
            )
        )
        null_count = result.scalar()
        assert null_count == 0, (
            f"Found {null_count} ShotChart rows with null zone fields "
            "(shotZone, shotZoneArea, or shotZoneRange)"
        )

    def test_shot_has_metadata(self, db):
        """shotDistance, shotType, shotResult, actionType should be populated."""
        result = db.execute(
            text(
                'SELECT COUNT(*) FROM "ShotChart" '
                'WHERE "shotDistance" IS NULL '
                'OR "shotType" IS NULL '
                'OR "shotResult" IS NULL '
                'OR "actionType" IS NULL'
            )
        )
        null_count = result.scalar()
        assert null_count == 0, (
            f"Found {null_count} ShotChart rows with null metadata fields "
            "(shotDistance, shotType, shotResult, or actionType)"
        )

    def test_shot_has_game_context(self, db):
        """period and gameId should be populated."""
        result = db.execute(
            text(
                'SELECT COUNT(*) FROM "ShotChart" '
                'WHERE "period" IS NULL OR "gameId" IS NULL'
            )
        )
        null_count = result.scalar()
        assert null_count == 0, (
            f"Found {null_count} ShotChart rows with null period or gameId"
        )

    def test_shot_types_valid(self, db):
        """shotType should only be 'TWO_POINTER' or 'THREE_POINTER'."""
        result = db.execute(
            text(
                'SELECT DISTINCT "shotType" FROM "ShotChart"'
            )
        )
        shot_types = {row[0] for row in result.fetchall()}
        valid_types = {"TWO_POINTER", "THREE_POINTER"}
        invalid = shot_types - valid_types
        assert len(invalid) == 0, (
            f"Found invalid shotType values: {invalid}. "
            f"Expected only {valid_types}"
        )

    def test_shot_results_valid(self, db):
        """shotResult should only be 'MADE' or 'MISSED'."""
        result = db.execute(
            text(
                'SELECT DISTINCT "shotResult" FROM "ShotChart"'
            )
        )
        shot_results = {row[0] for row in result.fetchall()}
        valid_results = {"MADE", "MISSED"}
        invalid = shot_results - valid_results
        assert len(invalid) == 0, (
            f"Found invalid shotResult values: {invalid}. "
            f"Expected only {valid_results}"
        )
