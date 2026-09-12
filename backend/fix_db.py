import sys
sys.path.insert(0, ".")

from sqlalchemy import text
from database import engine

with engine.connect() as conn:
    result = conn.execute(text("SHOW COLUMNS FROM assessment_submissions LIKE 'hint_penalty'"))
    if result.fetchone():
        print("Column 'hint_penalty' already exists — nothing to do.")
    else:
        conn.execute(text("ALTER TABLE assessment_submissions ADD COLUMN hint_penalty INT DEFAULT 0"))
        conn.commit()
        print("Success: 'hint_penalty' column added to assessment_submissions.")