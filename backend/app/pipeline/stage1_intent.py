"""
Stage 1: Intent Extraction
Parses raw natural language → structured Intermediate Representation (IR)
Detects: vague input, conflicting requirements, underspecified prompts
Makes: explicit assumptions when underspecified
"""
import json
import logging
from pathlib import Path
from app.core.gemini_client import get_client, GeminiCallResult

logger = logging.getLogger(__name__)

SCHEMA_PATH = Path(__file__).parent.parent / "schemas" / "intent_ir.schema.json"
INTENT_SCHEMA = json.loads(SCHEMA_PATH.read_text())

SYSTEM_PROMPT = """You are the Intent Extraction stage of an AI application compiler.
Your job is to parse a natural language app description into a structured Intermediate Representation (IR).

Rules:
1. Extract ALL entities the app manages (User, Contact, Product, Order, etc.)
2. Identify ALL distinct actors/roles who use the system
3. Categorize features into typed categories (auth, crud, analytics, billing, rbac, etc.)
4. Flag ANY ambiguity: vague descriptions, conflicting requirements, underspecified parts
5. When something is underspecified, make a REASONABLE assumption and document it in "assumptions"
6. If the input is completely unusable (empty, single word, pure gibberish), set clarification_needed=true

Output ONLY valid JSON matching this schema exactly. No explanations, no markdown, no extra text.

Schema:
{schema}
"""

USER_PROMPT_TEMPLATE = """Parse this app description into the IR:

APP DESCRIPTION:
"{prompt}"

Remember:
- Be exhaustive with entities and features
- Flag conflicts or vague parts in ambiguity_flags
- Document every assumption you make
- Return ONLY valid JSON
"""


async def run(prompt: str, temperature: float = 0.0) -> dict:
    """
    Run Stage 1: Intent Extraction.
    Returns the validated intent IR dict.
    Raises on unrecoverable failure.
    """
    client = get_client(temperature=temperature)
    
    system = SYSTEM_PROMPT.format(schema=json.dumps(INTENT_SCHEMA, indent=2))
    user = USER_PROMPT_TEMPLATE.format(prompt=prompt.strip())
    
    logger.info(f"[Stage 1] Extracting intent from: '{prompt[:80]}...'")
    
    result: GeminiCallResult = await client.call(
        system_prompt=system,
        user_prompt=user,
        max_retries=3,
    )
    
    logger.info(
        f"[Stage 1] Done | entities={len(result.content.get('entities', []))} | "
        f"features={len(result.content.get('features', []))} | "
        f"ambiguity_flags={len(result.content.get('ambiguity_flags', []))}"
    )
    
    return result.content, result.to_dict()
