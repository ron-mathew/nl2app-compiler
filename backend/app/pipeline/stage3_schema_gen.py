"""
Stage 3: Schema Generation — 4 separate constrained LLM calls
Each sub-generator is given:
  1. The System Design output as ground truth
  2. Its own strict JSON Schema contract
  3. Explicit instruction to NOT hallucinate beyond what Design defines

Sub-generators run in parallel for speed.
"""
import json
import logging
import asyncio
from pathlib import Path
from app.core.gemini_client import get_client, GeminiCallResult

logger = logging.getLogger(__name__)

SCHEMAS_DIR = Path(__file__).parent.parent / "schemas"

# Load all 4 schema contracts
UI_SCHEMA = json.loads((SCHEMAS_DIR / "ui_schema.schema.json").read_text())
API_SCHEMA = json.loads((SCHEMAS_DIR / "api_schema.schema.json").read_text())
DB_SCHEMA = json.loads((SCHEMAS_DIR / "db_schema.schema.json").read_text())
AUTH_SCHEMA = json.loads((SCHEMAS_DIR / "auth_schema.schema.json").read_text())


# ──────────────────────────────────────────────
# UI Schema Generator
# ──────────────────────────────────────────────
UI_SYSTEM = """You are the UI Schema Generator in an AI application compiler.
You receive the system architecture and produce a complete UI configuration.

Critical rules:
1. Create a page entry for EVERY page listed in the design
2. data_source fields MUST be in format "METHOD /api/path" (e.g. "GET /api/contacts")
3. submit_action fields MUST be in format "METHOD /api/path"
4. access_roles MUST only use roles defined in the design
5. Every form field name must correspond to a real entity attribute
6. Use only allowed component types from the schema enum
7. Do NOT invent pages or endpoints not present in the design

Output ONLY valid JSON. No explanations.

Schema: {schema}"""

UI_USER = """Generate the complete UI schema from this design:

SYSTEM DESIGN:
{design}

INTENT IR (for entity attributes):
{intent_ir}
"""


# ──────────────────────────────────────────────
# API Schema Generator
# ──────────────────────────────────────────────
API_SYSTEM = """You are the API Schema Generator in an AI application compiler.
You receive the system architecture and produce a complete REST API configuration.

Critical rules:
1. Generate CRUD endpoints for every entity in canonical_entity_names
2. Generate auth endpoints: POST /api/auth/login, POST /api/auth/logout, POST /api/auth/register
3. db_table MUST exactly match a table that will be in the DB schema (use canonical_entity_names)
4. required_roles MUST only use roles from the design
5. paths MUST start with /api/
6. Generate realistic request_body and response shapes based on entity attributes
7. Do NOT hallucinate entities or tables not present in the design

Output ONLY valid JSON. No explanations.

Schema: {schema}"""

API_USER = """Generate the complete API schema from this design:

SYSTEM DESIGN:
{design}

INTENT IR (for entity attributes and feature details):
{intent_ir}
"""


# ──────────────────────────────────────────────
# DB Schema Generator
# ──────────────────────────────────────────────
DB_SYSTEM = """You are the DB Schema Generator in an AI application compiler.
You receive the system architecture and produce a complete database schema.

Critical rules:
1. Create a table for EVERY entity in canonical_entity_names
2. Table names MUST exactly match canonical_entity_names (snake_case)
3. Every table MUST have an id column (UUID or INTEGER primary key)
4. Every table MUST have created_at and updated_at TIMESTAMP columns
5. Foreign key format: "referenced_table.column" (e.g. "users.id")
6. migrations_order must list tables in dependency order (referenced tables first)
7. Use standard SQL types: UUID, VARCHAR(n), TEXT, INTEGER, BOOLEAN, TIMESTAMP, DECIMAL(p,s), ENUM

Output ONLY valid JSON. No explanations.

Schema: {schema}"""

DB_USER = """Generate the complete DB schema from this design:

SYSTEM DESIGN:
{design}

INTENT IR (for entity attributes):
{intent_ir}
"""


# ──────────────────────────────────────────────
# Auth Schema Generator
# ──────────────────────────────────────────────
AUTH_SYSTEM = """You are the Auth Schema Generator in an AI application compiler.
You receive the system architecture and produce a complete auth/authorization configuration.

Critical rules:
1. roles list MUST exactly match roles from the design's role_permission_matrix keys
2. route_guards must cover every protected route from the design
3. permission_matrix structure: resource -> action -> [roles_allowed]
4. Resources in permission_matrix must correspond to canonical_entity_names
5. default_role must be one of the roles in the roles array

Output ONLY valid JSON. No explanations.

Schema: {schema}"""

AUTH_USER = """Generate the complete Auth schema from this design:

SYSTEM DESIGN:
{design}
"""


async def _generate_one(
    label: str,
    system: str,
    user: str,
    temperature: float,
) -> tuple[str, dict, dict]:
    """Run a single schema sub-generator."""
    client = get_client(temperature=temperature)
    logger.info(f"[Stage 3] Generating {label} schema...")
    result: GeminiCallResult = await client.call(
        system_prompt=system,
        user_prompt=user,
        max_retries=3,
    )
    logger.info(f"[Stage 3] {label} schema done | tokens={result.input_tokens}+{result.output_tokens}")
    return label, result.content, result.to_dict()


async def run(
    intent_ir: dict,
    design: dict,
    temperature: float = 0.0,
) -> dict:
    """
    Run all 4 schema sub-generators in parallel.
    Returns dict with keys: ui, api, db, auth, metadata.
    """
    design_str = json.dumps(design, indent=2)
    intent_str = json.dumps(intent_ir, indent=2)

    tasks = [
        _generate_one(
            "ui",
            UI_SYSTEM.format(schema=json.dumps(UI_SCHEMA, indent=2)),
            UI_USER.format(design=design_str, intent_ir=intent_str),
            temperature,
        ),
        _generate_one(
            "api",
            API_SYSTEM.format(schema=json.dumps(API_SCHEMA, indent=2)),
            API_USER.format(design=design_str, intent_ir=intent_str),
            temperature,
        ),
        _generate_one(
            "db",
            DB_SYSTEM.format(schema=json.dumps(DB_SCHEMA, indent=2)),
            DB_USER.format(design=design_str, intent_ir=intent_str),
            temperature,
        ),
        _generate_one(
            "auth",
            AUTH_SYSTEM.format(schema=json.dumps(AUTH_SCHEMA, indent=2)),
            AUTH_USER.format(design=design_str),
            temperature,
        ),
    ]

    results = await asyncio.gather(*tasks)

    schemas = {}
    metadata = {}
    for label, content, meta in results:
        schemas[label] = content
        metadata[label] = meta

    logger.info(f"[Stage 3] All 4 schemas generated")
    return schemas, metadata
