"""
ETL Utilities — rate limiting, retry logic, database connection helpers.
"""

import time
import uuid
import traceback
from datetime import datetime, date
from contextlib import contextmanager

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from config import DATABASE_URL


# ── Database Connection ───────────────────────────────────────────────────────

_engine = None
_SessionLocal = None


def get_engine():
    """Lazy-init and return the SQLAlchemy engine."""
    global _engine
    if _engine is None:
        _engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=5)
    return _engine


def get_session_factory():
    """Return a sessionmaker bound to our engine."""
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(bind=get_engine())
    return _SessionLocal


@contextmanager
def get_db():
    """Context manager that yields a SQLAlchemy session and auto-commits/rollbacks."""
    SessionLocal = get_session_factory()
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def execute_sql(session, sql_str, params=None):
    """Execute raw SQL via a session."""
    session.execute(text(sql_str), params or {})


# ── Rate Limiting & Retry ────────────────────────────────────────────────────

def safe_call(endpoint_class, **kwargs):
    """
    Call an nba_api endpoint with rate limiting and exponential-backoff retry.
    Returns list of DataFrames from the endpoint.
    """
    max_retries = 3
    for attempt in range(max_retries):
        try:
            time.sleep(0.6)  # NBA.com rate limit
            result = endpoint_class(**kwargs)
            return result.get_data_frames()
        except Exception as e:
            print(f"  [WARN] Attempt {attempt + 1}/{max_retries} failed for {endpoint_class.__name__}: {e}")
            if attempt < max_retries - 1:
                wait = 2 ** (attempt + 1)
                print(f"  [WAIT] Retrying in {wait}s...")
                time.sleep(wait)
            else:
                print(f"  [ERROR] All retries exhausted for {endpoint_class.__name__}")
                raise


# ── ID Helpers ────────────────────────────────────────────────────────────────

def generate_cuid():
    """Generate a cuid-like unique ID for Prisma @default(cuid()) fields."""
    return 'c' + uuid.uuid4().hex[:24]


# ── Type Conversion Helpers ──────────────────────────────────────────────────

def safe_int(val, default=None):
    """Convert a value to int safely, returning default on failure."""
    if val is None:
        return default
    try:
        import math
        if isinstance(val, float) and math.isnan(val):
            return default
        return int(val)
    except (ValueError, TypeError):
        return default


def safe_float(val, default=None):
    """Convert a value to float safely, returning default on failure."""
    if val is None:
        return default
    try:
        import math
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return default
        return f
    except (ValueError, TypeError):
        return default


def pct_to_decimal(val):
    """
    Convert a percentage to 0.0-1.0 range.
    nba_api returns some percentages already as decimals (e.g. 0.453)
    and some as whole numbers (e.g. 45.3). We detect and handle both.
    """
    f = safe_float(val)
    if f is None:
        return None
    # If value is already in 0-1 range (or 0), keep it
    if -1.0 <= f <= 1.0:
        return round(f, 4)
    # Otherwise divide by 100
    return round(f / 100.0, 4)


def parse_date(val):
    """Parse a date string from nba_api into a Python date/datetime."""
    if val is None:
        return None
    if isinstance(val, (datetime, date)):
        return val
    val_str = str(val).strip()
    # Try common formats
    for fmt in ('%Y-%m-%dT%H:%M:%S', '%Y-%m-%d', '%b %d, %Y', '%m/%d/%Y'):
        try:
            return datetime.strptime(val_str[:len(val_str)], fmt)
        except ValueError:
            continue
    # Last resort: try just the first 10 chars as a date
    try:
        return datetime.strptime(val_str[:10], '%Y-%m-%d')
    except ValueError:
        return None


def parse_minutes(min_str):
    """
    Parse minutes string like '35:30' into decimal minutes (35.5).
    Also handles already-numeric values.
    """
    if min_str is None:
        return None, None
    # If it's already a number
    try:
        f = float(min_str)
        import math
        if math.isnan(f):
            return None, None
        # Reconstruct the string
        mins = int(f)
        secs = int((f - mins) * 60)
        return round(f, 2), f"{mins}:{secs:02d}"
    except (ValueError, TypeError):
        pass
    # Parse "MM:SS" format
    s = str(min_str).strip()
    if ':' in s:
        try:
            parts = s.split(':')
            mins = int(parts[0])
            secs = int(parts[1])
            decimal = round(mins + secs / 60.0, 2)
            return decimal, s
        except (ValueError, IndexError):
            return None, None
    return None, None


# ── Upsert Helper ────────────────────────────────────────────────────────────

def build_upsert_sql(table_name, columns, conflict_columns, exclude_from_update=None):
    """
    Build an INSERT ... ON CONFLICT DO UPDATE SQL string.

    Args:
        table_name: PascalCase table name (e.g. "Team")
        columns: list of column names
        conflict_columns: list of column names for ON CONFLICT
        exclude_from_update: columns to NOT update on conflict (e.g. 'id', 'createdAt')
    """
    if exclude_from_update is None:
        exclude_from_update = {'createdAt'}

    quoted_cols = ', '.join(f'"{c}"' for c in columns)
    placeholders = ', '.join(f':{c}' for c in columns)
    conflict_cols = ', '.join(f'"{c}"' for c in conflict_columns)

    update_cols = [c for c in columns if c not in conflict_columns and c not in exclude_from_update]
    update_set = ', '.join(f'"{c}" = EXCLUDED."{c}"' for c in update_cols)

    # Always update updatedAt
    if 'updatedAt' not in update_cols:
        update_set += ', "updatedAt" = NOW()'

    sql = f"""
        INSERT INTO "{table_name}" ({quoted_cols})
        VALUES ({placeholders})
        ON CONFLICT ({conflict_cols}) DO UPDATE SET {update_set}
    """
    return sql


def upsert_rows(session, table_name, rows, columns, conflict_columns, exclude_from_update=None):
    """
    Upsert a list of row dicts into the specified table.

    Args:
        session: SQLAlchemy session
        table_name: PascalCase table name
        rows: list of dicts with column->value mappings
        columns: list of all column names
        conflict_columns: list of conflict columns
        exclude_from_update: columns to skip on update
    """
    if not rows:
        return 0

    sql = build_upsert_sql(table_name, columns, conflict_columns, exclude_from_update)

    count = 0
    for row in rows:
        # Ensure all columns have a value (None if missing)
        params = {c: row.get(c) for c in columns}
        session.execute(text(sql), params)
        count += 1

    return count


# ── Season Helper ─────────────────────────────────────────────────────────────

def ensure_seasons(session, seasons_dict):
    """
    Ensure all seasons exist in the Season table.
    seasons_dict: {season_id: {startYear, endYear, isCurrent}}
    """
    from config import season_display_name

    columns = ['id', 'startYear', 'endYear', 'displayName', 'isCurrent', 'createdAt', 'updatedAt']
    sql = build_upsert_sql('Season', columns, ['id'], exclude_from_update={'createdAt'})

    for season_id, meta in seasons_dict.items():
        params = {
            'id': season_id,
            'startYear': meta['startYear'],
            'endYear': meta['endYear'],
            'displayName': season_display_name(season_id),
            'isCurrent': meta['isCurrent'],
            'createdAt': datetime.utcnow(),
            'updatedAt': datetime.utcnow(),
        }
        session.execute(text(sql), params)
    session.commit()
    print(f"  [OK] Ensured {len(seasons_dict)} season(s) in Season table")
