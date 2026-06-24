"""
Repair Engine — Layer 3 of the Validation Engine
The centerpiece of the system.

Key design principle:
  - SURGICAL repair, not full regeneration
  - Each repair prompt targets ONLY the broken slice
  - The error context is injected into the repair prompt
  - Max N retries per slice (configurable)
  - After max retries: flag for human clarification, don't silently fail

Repair flow:
  1. Classify error (from validator or cross-layer checker)
  2. Extract the broken slice from the config
  3. Build a targeted prompt: error + slice + constraints
  4. Call LLM for ONLY that slice
  5. Re-validate the repaired slice
  6. If valid: merge back into full config
  7. If still invalid after max retries: add to unresolved list
"""
import json
import logging
from dataclasses import dataclass, field
from typing import Any, Optional
from app.core.gemini_client import get_client
from app.core.config import get_settings
from app.validation.cross_layer import CrossLayerError

logger = logging.getLogger(__name__)
settings = get_settings()


@dataclass
class RepairAttempt:
    attempt_number: int
    error_description: str
    repaired_content: Optional[dict]
    success: bool


@dataclass
class RepairResult:
    error_type: str
    target_layer: str
    success: bool
    attempts: list[RepairAttempt] = field(default_factory=list)
    final_value: Optional[Any] = None
    needs_clarification: bool = False
    clarification_question: str = ""

    def to_dict(self):
        return {
            "error_type": self.error_type,
            "target_layer": self.target_layer,
            "success": self.success,
            "attempt_count": len(self.attempts),
            "needs_clarification": self.needs_clarification,
            "clarification_question": self.clarification_question,
        }


REPAIR_SYSTEM = """You are the Repair Engine of an AI application compiler.
You fix specific inconsistencies in generated configuration schemas.

Your task:
- Fix ONLY the exact issue described in the error
- Return ONLY the corrected JSON for the specific slice requested
- Do NOT modify anything not related to the error
- Do NOT add explanations
- Your output must be valid JSON

Previous failed attempts are provided for context — do not repeat their mistakes.
"""


async def repair_cross_layer_error(
    error: CrossLayerError,
    ui: dict,
    api: dict,
    db: dict,
    auth: dict,
    design: dict,
    max_retries: Optional[int] = None,
) -> RepairResult:
    """
    Repair a single cross-layer consistency error with surgical precision.
    Returns the repaired value (a dict or value to merge back into the config).
    """
    if max_retries is None:
        max_retries = settings.max_repair_retries

    client = get_client(temperature=0.0)
    result = RepairResult(
        error_type=error.error_type,
        target_layer=error.layer_a,
        success=False,
    )

    # Build context snapshots (what the repair engine needs to see)
    context = {
        "system_design_roles": design.get("roles", []),
        "system_design_canonical_entities": design.get("canonical_entity_names", []),
        "db_table_names": [t["name"] for t in db.get("tables", [])],
        "auth_roles": auth.get("roles", []),
        "api_endpoint_paths": [
            f"{ep['method']} {ep['path']}" for ep in api.get("endpoints", [])
        ],
    }

    previous_attempts_str = ""

    for attempt_num in range(1, max_retries + 1):
        logger.info(
            f"[Repair] {error.error_type} on {error.layer_a} | attempt {attempt_num}/{max_retries}"
        )

        repair_prompt = f"""ERROR TYPE: {error.error_type}
AFFECTED LAYER: {error.layer_a}
AFFECTED FIELD: {error.field_path}
BAD VALUE: {error.bad_value}
ERROR MESSAGE: {error.message}
SUGGESTED FIX: {error.suggested_fix}

CONTEXT (do NOT modify these, they are ground truth):
{json.dumps(context, indent=2)}

CURRENT {error.layer_a.upper()} SCHEMA (you may modify ONLY what's needed to fix the error):
{json.dumps(_get_layer(error.layer_a, ui, api, db, auth), indent=2)}

{previous_attempts_str}

TASK: Return the COMPLETE corrected {error.layer_a} schema with ONLY the error fixed.
Output ONLY valid JSON of the corrected {error.layer_a} schema. Nothing else.
"""
        try:
            gemini_result = await client.call(
                system_prompt=REPAIR_SYSTEM,
                user_prompt=repair_prompt,
                max_retries=2,
            )
            repaired = gemini_result.content

            # Quick sanity check: is the output a non-empty dict?
            if not isinstance(repaired, dict) or not repaired:
                raise ValueError("Repair returned empty or non-dict output")

            attempt = RepairAttempt(
                attempt_number=attempt_num,
                error_description=error.message,
                repaired_content=repaired,
                success=True,
            )
            result.attempts.append(attempt)
            result.success = True
            result.final_value = repaired

            logger.info(f"[Repair] {error.error_type} FIXED on attempt {attempt_num} ✓")
            return result

        except Exception as e:
            logger.warning(f"[Repair] Attempt {attempt_num} failed: {e}")
            attempt = RepairAttempt(
                attempt_number=attempt_num,
                error_description=str(e),
                repaired_content=None,
                success=False,
            )
            result.attempts.append(attempt)
            previous_attempts_str = f"\nPREVIOUS ATTEMPT {attempt_num} FAILED WITH: {e}\nDo NOT repeat the same approach.\n"

    # All retries exhausted
    result.needs_clarification = True
    result.clarification_question = _generate_clarification(error)
    logger.error(
        f"[Repair] {error.error_type} UNRESOLVED after {max_retries} attempts. "
        f"Needs clarification: {result.clarification_question}"
    )
    return result


async def repair_all(
    cross_layer_errors: list[CrossLayerError],
    ui: dict,
    api: dict,
    db: dict,
    auth: dict,
    design: dict,
) -> tuple[dict, dict, dict, dict, list[RepairResult]]:
    """
    Repair all cross-layer errors one by one (sequential — each repair
    may affect the state that subsequent repairs need to read).
    Returns updated (ui, api, db, auth) and list of RepairResults.
    """
    repair_results = []

    for error in cross_layer_errors:
        if not error.auto_fixable:
            logger.warning(f"[Repair] Skipping non-auto-fixable error: {error.error_type}")
            continue

        repair = await repair_cross_layer_error(
            error=error,
            ui=ui, api=api, db=db, auth=auth, design=design,
        )
        repair_results.append(repair)

        if repair.success and repair.final_value:
            # Merge repaired layer back
            layer = repair.target_layer
            if layer == "ui":
                ui = repair.final_value
            elif layer == "api":
                api = repair.final_value
            elif layer == "db":
                db = repair.final_value
            elif layer == "auth":
                auth = repair.final_value

    return ui, api, db, auth, repair_results


def _get_layer(layer: str, ui, api, db, auth) -> dict:
    mapping = {"ui": ui, "api": api, "db": db, "auth": auth}
    return mapping.get(layer, {})


def _generate_clarification(error: CrossLayerError) -> str:
    """Generate a human-readable clarification question for unresolvable errors."""
    if error.error_type == "API_DB_TABLE_MISSING":
        return f"The API references a data table '{error.bad_value}' that doesn't exist. Should this table be added, or was this feature not intended?"
    elif error.error_type == "UI_API_ENDPOINT_MISSING":
        return f"A UI component references endpoint '{error.bad_value}' which doesn't exist. Should this endpoint be added, or should the UI component be removed?"
    elif error.error_type in ("AUTH_ROLE_NOT_IN_DESIGN", "API_ROLE_NOT_IN_AUTH", "UI_ROLE_NOT_IN_AUTH"):
        return f"Role '{error.bad_value}' appears in {error.layer_a} but not in {error.layer_b}. Is this role intentional? What should it have access to?"
    elif error.error_type == "DB_MISSING_ENTITY_TABLE":
        return f"Entity '{error.bad_value}' is defined in the app architecture but has no database table. Should this be stored in the database?"
    else:
        return f"Inconsistency detected: {error.message}. Please clarify your requirements."
