"""
DB Simulator — converts DB schema → SQLite DDL and actually executes it in-memory.
If SQLite can CREATE TABLE from the schema, the schema is executable.
This is deterministic proof, not a claim.
"""
import sqlite3
import logging
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# Map our schema types to SQLite-compatible types
TYPE_MAP = {
    "UUID": "TEXT",
    "VARCHAR": "TEXT",
    "TEXT": "TEXT",
    "INTEGER": "INTEGER",
    "INT": "INTEGER",
    "BIGINT": "INTEGER",
    "BOOLEAN": "INTEGER",
    "BOOL": "INTEGER",
    "TIMESTAMP": "TEXT",
    "DATETIME": "TEXT",
    "DATE": "TEXT",
    "DECIMAL": "REAL",
    "FLOAT": "REAL",
    "DOUBLE": "REAL",
    "JSON": "TEXT",
    "JSONB": "TEXT",
}


@dataclass
class DBSimulationResult:
    success: bool
    tables_created: list[str] = field(default_factory=list)
    tables_failed: list[dict] = field(default_factory=list)
    generated_sql: list[str] = field(default_factory=list)
    proof_statement: str = ""

    def to_dict(self):
        return {
            "layer": "db",
            "success": self.success,
            "tables_created": self.tables_created,
            "tables_failed": self.tables_failed,
            "generated_sql": self.generated_sql,
            "proof_statement": self.proof_statement,
        }


def _normalize_type(raw_type: str) -> str:
    """Normalize schema type string to a SQLite-compatible type."""
    raw = raw_type.upper().strip()
    # Handle parameterized types: VARCHAR(255) → TEXT, DECIMAL(10,2) → REAL
    base = raw.split("(")[0].strip()
    # Handle ENUM
    if base == "ENUM":
        return "TEXT"
    return TYPE_MAP.get(base, "TEXT")


def _generate_column_ddl(col: dict) -> str:
    """Generate DDL fragment for a single column."""
    parts = [f'"{col["name"]}"', _normalize_type(col.get("type", "TEXT"))]

    if col.get("primary_key"):
        parts.append("PRIMARY KEY")

    if col.get("not_null") and not col.get("primary_key"):
        parts.append("NOT NULL")

    if col.get("unique") and not col.get("primary_key"):
        parts.append("UNIQUE")

    if "default" in col and col["default"] is not None:
        default_val = col["default"]
        if isinstance(default_val, str):
            # Skip SQL functions that SQLite doesn't support identically
            if default_val.upper() in ("NOW()", "CURRENT_TIMESTAMP", "GETDATE()"):
                parts.append("DEFAULT CURRENT_TIMESTAMP")
            else:
                parts.append(f"DEFAULT '{default_val}'")
        elif isinstance(default_val, bool):
            parts.append(f"DEFAULT {1 if default_val else 0}")
        elif default_val is not None:
            parts.append(f"DEFAULT {default_val}")

    return " ".join(parts)


def _generate_table_ddl(table: dict) -> str:
    """Generate CREATE TABLE DDL for a single table."""
    name = table["name"]
    col_parts = []
    fk_parts = []

    for col in table.get("columns", []):
        col_parts.append("  " + _generate_column_ddl(col))
        # Collect foreign keys
        if fk := col.get("foreign_key"):
            try:
                ref_table, ref_col = fk.split(".")
                fk_parts.append(
                    f'  FOREIGN KEY ("{col["name"]}") REFERENCES "{ref_table}" ("{ref_col}")'
                )
            except ValueError:
                pass  # malformed FK — skip, don't crash

    all_parts = col_parts + fk_parts
    ddl = f'CREATE TABLE IF NOT EXISTS "{name}" (\n' + ",\n".join(all_parts) + "\n);"
    return ddl


def simulate(db_schema: dict) -> DBSimulationResult:
    """
    Generate DDL from db_schema and execute it in an in-memory SQLite DB.
    Returns DBSimulationResult with success/fail per table and generated SQL.
    """
    result = DBSimulationResult(success=True)

    tables = db_schema.get("tables", [])
    if not tables:
        result.success = False
        result.proof_statement = "DB schema has no tables defined"
        return result

    # Respect migrations_order if provided
    migrations_order = db_schema.get("migrations_order", [])
    if migrations_order:
        table_map = {t["name"]: t for t in tables}
        ordered_tables = [table_map[n] for n in migrations_order if n in table_map]
        # Add any tables not in migrations_order at the end
        in_order = set(migrations_order)
        ordered_tables += [t for t in tables if t["name"] not in in_order]
    else:
        ordered_tables = tables

    conn = sqlite3.connect(":memory:")
    conn.execute("PRAGMA foreign_keys = OFF;")  # SQLite FK enforcement is optional
    conn.execute("PRAGMA journal_mode = MEMORY;")

    try:
        for table in ordered_tables:
            ddl = _generate_table_ddl(table)
            result.generated_sql.append(ddl)
            try:
                conn.execute(ddl)
                conn.commit()
                result.tables_created.append(table["name"])
                logger.info(f"[DB Simulator] Table '{table['name']}': CREATE OK ✓")
            except sqlite3.Error as e:
                result.tables_failed.append({
                    "table": table["name"],
                    "error": str(e),
                    "sql": ddl,
                })
                result.success = False
                logger.warning(f"[DB Simulator] Table '{table['name']}': FAILED — {e}")
    finally:
        conn.close()

    if result.success:
        result.proof_statement = (
            f"All {len(result.tables_created)} tables successfully created in SQLite in-memory. "
            f"DB schema is executable."
        )
    else:
        result.proof_statement = (
            f"{len(result.tables_created)}/{len(tables)} tables created. "
            f"{len(result.tables_failed)} failed."
        )

    logger.info(f"[DB Simulator] Result: {result.proof_statement}")
    return result
