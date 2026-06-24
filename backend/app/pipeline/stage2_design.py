"""
Stage 2: System Design Layer
Converts Intent IR → full app architecture.
Produces: pages, roles, permission matrix, entity relationships, business rules.
This is the "architect" that defines canonical names everything else must reference.
"""
import json
import logging
from pathlib import Path
from app.core.gemini_client import get_client, GeminiCallResult

logger = logging.getLogger(__name__)

SCHEMA_PATH = Path(__file__).parent.parent / "schemas" / "design.schema.json"
DESIGN_SCHEMA = json.loads(SCHEMA_PATH.read_text())

SYSTEM_PROMPT = """You are the System Design stage of an AI application compiler.
Your input is a structured Intent IR. Your job is to design the complete app architecture.

Rules:
1. Create a page for every major feature/entity (list view, detail view, dashboard, etc.)
2. Define canonical entity names in snake_case (these will be used as DB table names)
3. Build a complete role-permission matrix — every role, every resource, every action
4. connected_endpoints must use the format "METHOD /api/path" (e.g. "GET /api/contacts")
5. business_rules must be concrete and machine-enforceable, not vague statements
6. Every page's access must use roles defined in the "roles" array
7. Be exhaustive — missing a page here causes cascading inconsistencies downstream

Output ONLY valid JSON matching this schema exactly.

Schema:
{schema}
"""

USER_PROMPT_TEMPLATE = """Design the complete app architecture from this Intent IR:

INTENT IR:
{intent_ir}

Requirements:
- Create all necessary pages (auth pages, CRUD pages, dashboard, admin pages, etc.)
- Define canonical_entity_names in snake_case (these become DB table names)
- The role_permission_matrix must cover ALL combinations of roles × resources × actions
- connected_endpoints on each page must match real API paths we'll generate next
- Return ONLY valid JSON
"""


async def run(intent_ir: dict, temperature: float = 0.0) -> dict:
    """
    Run Stage 2: System Design Layer.
    Returns architecture dict + metadata.
    """
    client = get_client(temperature=temperature)
    
    system = SYSTEM_PROMPT.format(schema=json.dumps(DESIGN_SCHEMA, indent=2))
    user = USER_PROMPT_TEMPLATE.format(intent_ir=json.dumps(intent_ir, indent=2))
    
    logger.info(f"[Stage 2] Designing architecture for: {intent_ir.get('app_name', 'unnamed app')}")
    
    result: GeminiCallResult = await client.call(
        system_prompt=system,
        user_prompt=user,
        max_retries=3,
    )
    
    logger.info(
        f"[Stage 2] Done | pages={len(result.content.get('pages', []))} | "
        f"roles={result.content.get('roles', [])} | "
        f"entities={len(result.content.get('canonical_entity_names', []))}"
    )
    
    return result.content, result.to_dict()
