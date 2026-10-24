"""
Unit tests for pure ETL transforms — no network, no database.
Adds etl/ to sys.path so fetch modules import the same way the scripts do.
"""

import os
import sys

ETL_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if ETL_DIR not in sys.path:
    sys.path.insert(0, ETL_DIR)

LAKERS_ID = '1610612747'
CELTICS_ID = '1610612738'
WARRIORS_ID = '1610612744'
CLIPPERS_ID = '1610612746'
