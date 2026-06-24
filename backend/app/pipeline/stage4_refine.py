"""
Stage 4: Refinement Layer
Runs a cross-layer consistency pass and resolves any remaining inconsistencies.
This is a targeted LLM refinement of specific slices — not a full regeneration.
"""
import json
import logging
from app.core.gemini_client import get_client

logger = logging.getLogger(__name__)

REFINEMENT_SYSTEM = """You are the Refinement stage of an AI application compiler.
You receive all 4 generated schemas and must fix any remaining cross-layer inconsistencies
that were not caught by the automated validator.

Your job:
1. Ensure UI data_source endpoints exist in the API schema
2. Ensure API db_table values exist in the DB schema tables
3. Ensure auth roles are consistent across all layers
4. Ensure entity field names are consistent between API request_body and DB columns
5. Add any missing CRUD endpoints that entities require but API schema lacks
6. Fix any field name inconsistencies between layers

Return the refined versions of ALL 4 schemas as a JSON object with keys: ui, api, db, auth
Make minimal changes — only fix what's broken. Output ONLY valid JSON.
"""

REFINEMENT_USER = """Review and refine these 4 schemas for cross-layer consistency:

UI SCHEMA:
{ui}

API SCHEMA:
{api}

DB SCHEMA:
{db}

AUTH SCHEMA:
{auth}

SYSTEM DESIGN (ground truth):
{design}

Fix any inconsistencies. Return corrected versions of all 4 schemas.
Output format: {{"ui": {{...}}, "api": {{...}}, "db": {{...}}, "auth": {{...}}}}
"""


async def run(
    schemas: dict,
    design: dict,
    temperature: float = 0.0,
) -> dict:
    """
    Run Stage 4: LLM-assisted cross-layer refinement.
    Returns refined schemas dict.
    """
    client = get_client(temperature=temperature)

    user = REFINEMENT_USER.format(
        ui=json.dumps(schemas.get("ui", {}), indent=2),
        api=json.dumps(schemas.get("api", {}), indent=2),
        db=json.dumps(schemas.get("db", {}), indent=2),
        auth=json.dumps(schemas.get("auth", {}), indent=2),
        design=json.dumps(design, indent=2),
    )

    logger.info("[Stage 4] Running cross-layer refinement pass...")

    result = await client.call(
        system_prompt=REFINEMENT_SYSTEM,
        user_prompt=user,
        max_retries=3,
    )

    refined = result.content
    
    # Merge back — only update keys that exist in refined output
    for key in ["ui", "api", "db", "auth"]:
        if key in refined and refined[key]:
            schemas[key] = refined[key]

    logger.info("[Stage 4] Refinement pass complete")
    return schemas, result.to_dict()
