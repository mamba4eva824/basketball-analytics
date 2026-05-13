import os
import pytest
from sqlalchemy import create_engine, text

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/nba_analytics_test"
)

@pytest.fixture(scope="session")
def db_engine():
    engine = create_engine(DATABASE_URL)
    yield engine
    engine.dispose()

@pytest.fixture(scope="session")
def db(db_engine):
    """Returns a connection that can execute queries."""
    with db_engine.connect() as conn:
        yield conn

# Constants
LAKERS_ID = "1610612747"
CELTICS_ID = "1610612738"
LEBRON_ID = "2544"
SEASON = "2025-26"
