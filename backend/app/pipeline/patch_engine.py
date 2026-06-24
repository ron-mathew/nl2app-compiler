"""
Patch Engine — Incremental Schema Refinement

Given an existing full pipeline output and a patch instruction like
"add Stripe payments" or "remove the admin role", this engine:

  Step 1: Impact Analysis  — which schemas are affected? (1 cheap LLM call)
  Step 2: Targeted Patch   — re-generate only the affected schemas with context
  Step 3: Merge            — splice patched schemas back into the full config
  Step 4: Validate + Repair — same cross-layer validator + repair engine
  Step 5: Diff Generation  — pure Python structural diff (no LLM)

The KEY invariant: schemas NOT listed as affected are NEVER touched.
This proves incremental compilation — like a compiler that only recompiles
changed modules.
"""
import time
import json
import logging
from typing import AsyncGenerator, Optional

from app.core.gemini_client import get_client
from app.validation import cross_layer, repair
from app.core.config import PIPELINE_MODES

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────────────
# STEP 1: Impact Analyzer
# ──────────────────────────────────────────────────────────────────────────────

IMPACT_SYSTEM_PROMPT = """You are an app architecture analyzer.
Given a patch instruction and a summary of an existing app config, determine:
1. Which schemas need to be modified (subset of: ui, api, db, auth)
2. Why each needs to change
3. What new entities/concepts are being introduced

Return ONLY valid JSON matching this exact structure:
{
  "affected_schemas": ["api", "db"],
  "rationale": "Brief explanation of why each schema is affected",
  "new_entities": ["payment", "subscription"],
  "patch_summary": "One sentence describing what the patch will do",
  "risk_level": "low|medium|high"
}

Rules:
- Only include schemas that ACTUALLY need to change
- "auth" is affected only if roles/permissions change
- "ui" is affected only if new pages or components are needed
- "db" is affected if new tables, columns, or relations are needed
- "api" is affected if new endpoints or request/response shapes change
"""


async def analyze_impact(
    patch_instruction: str,
    current_output: dict,
    temperature: float = 0.0,
) -> dict:
    """Determine which schemas need to change for this patch."""
    client = get_client(temperature)

    # Build a compact summary of the current config (not the full JSON — too large)
    intent = current_output.get("intent", {})
    design = current_output.get("design", {})
    schemas = current_output.get("schemas", {})

    summary = {
        "app_name": intent.get("app_name", "App"),
        "entities": [e.get("name") for e in intent.get("entities", [])],
        "roles": schemas.get("auth", {}).get("roles", design.get("roles", [])),
        "db_tables": [t.get("name") for t in schemas.get("db", {}).get("tables", [])],
        "api_endpoints": [
            f"{e.get('method')} {e.get('path')}"
            for e in schemas.get("api", {}).get("endpoints", [])[:10]
        ],
        "ui_pages": [p.get("name") for p in schemas.get("ui", {}).get("pages", [])],
    }

    user_prompt = f"""Patch instruction: "{patch_instruction}"

Current app config summary:
{json.dumps(summary, indent=2)}

Which schemas need to be modified to implement this patch?"""

    result = await client.call(IMPACT_SYSTEM_PROMPT, user_prompt)
    return result.content


# ──────────────────────────────────────────────────────────────────────────────
# STEP 2: Schema Patcher (per schema type)
# ──────────────────────────────────────────────────────────────────────────────

PATCH_PROMPTS = {
    "db": """You are a database schema engineer.
Apply the patch instruction to the existing DB schema.
Return the COMPLETE updated DB schema as valid JSON.
RULES:
- Keep ALL existing tables and columns
- Only ADD new tables/columns/relations that the patch requires
- Do NOT remove anything unless explicitly instructed
- Maintain all existing foreign key relationships
Return JSON with structure: {"tables": [...], "relations": [...]}""",

    "api": """You are an API architect.
Apply the patch instruction to the existing API schema.
Return the COMPLETE updated API schema as valid JSON.
RULES:
- Keep ALL existing endpoints
- Only ADD new endpoints that the patch requires
- Do NOT remove any existing endpoints unless explicitly instructed
- New endpoints must reference tables that exist in the DB schema
Return JSON with structure: {"endpoints": [...]}""",

    "ui": """You are a UI architect.
Apply the patch instruction to the existing UI schema.
Return the COMPLETE updated UI schema as valid JSON.
RULES:
- Keep ALL existing pages and components
- Only ADD new pages or components that the patch requires
- New components must reference endpoints that exist in the API schema
- Do NOT remove existing pages unless explicitly instructed
Return JSON with structure: {"pages": [...]}""",

    "auth": """You are an auth/permissions architect.
Apply the patch instruction to the existing auth schema.
Return the COMPLETE updated auth schema as valid JSON.
RULES:
- Keep ALL existing roles and permissions
- Only ADD/MODIFY what the patch explicitly requires
- Do NOT remove roles unless explicitly instructed
Return JSON with structure: {"roles": [...], "permissions": {...}, "strategies": [...]}""",
}


async def patch_schema(
    schema_type: str,
    current_schema: dict,
    patch_instruction: str,
    app_context: dict,
    temperature: float = 0.0,
) -> tuple[dict, dict]:
    """Patch a single schema type. Returns (patched_schema, metrics)."""
    client = get_client(temperature)
    system_prompt = PATCH_PROMPTS.get(schema_type, PATCH_PROMPTS["api"])

    # Include other schemas as read-only context so the LLM stays consistent
    context_summary = {
        k: v for k, v in app_context.get("schemas", {}).items()
        if k != schema_type
    }

    user_prompt = f"""Patch instruction: "{patch_instruction}"

Current {schema_type.upper()} schema to patch:
{json.dumps(current_schema, indent=2)}

Read-only context (other schemas — do NOT modify these, just reference them for consistency):
{json.dumps(context_summary, indent=2)}

Apply the patch and return the complete updated {schema_type.upper()} schema."""

    result = await client.call(system_prompt, user_prompt)
    return result.content, result.to_dict()


# ──────────────────────────────────────────────────────────────────────────────
# STEP 5: Structural Diff Generator (pure Python — no LLM)
# ──────────────────────────────────────────────────────────────────────────────

def _diff_lists(old_list: list, new_list: list, key_field: str) -> dict:
    """Compare two lists of dicts by a key field. Returns added/removed/modified."""
    old_map = {item.get(key_field, str(i)): item for i, item in enumerate(old_list)}
    new_map = {item.get(key_field, str(i)): item for i, item in enumerate(new_list)}

    added   = [new_map[k] for k in new_map if k not in old_map]
    removed = [old_map[k] for k in old_map if k not in new_map]
    modified = []
    for k in new_map:
        if k in old_map and new_map[k] != old_map[k]:
            modified.append({
                "key": k,
                "before": old_map[k],
                "after": new_map[k],
            })

    return {"added": added, "removed": removed, "modified": modified}


def generate_diff(old_schemas: dict, new_schemas: dict) -> dict:
    """
    Generate a structured diff between old and new schemas.
    Returns a human-readable + machine-readable diff object.
    """
    diff = {}
    stats = {"schemas_changed": 0, "items_added": 0, "items_removed": 0, "items_modified": 0}

    # DB diff
    old_db = old_schemas.get("db", {})
    new_db = new_schemas.get("db", {})
    if old_db != new_db:
        db_diff = _diff_lists(
            old_db.get("tables", []),
            new_db.get("tables", []),
            "name"
        )
        if any(db_diff[k] for k in db_diff):
            diff["db"] = db_diff
            stats["schemas_changed"] += 1
            stats["items_added"] += len(db_diff["added"])
            stats["items_removed"] += len(db_diff["removed"])
            stats["items_modified"] += len(db_diff["modified"])

    # API diff
    old_api = old_schemas.get("api", {})
    new_api = new_schemas.get("api", {})
    if old_api != new_api:
        api_diff = _diff_lists(
            old_api.get("endpoints", []),
            new_api.get("endpoints", []),
            "path"
        )
        if any(api_diff[k] for k in api_diff):
            diff["api"] = api_diff
            stats["schemas_changed"] += 1
            stats["items_added"] += len(api_diff["added"])
            stats["items_removed"] += len(api_diff["removed"])
            stats["items_modified"] += len(api_diff["modified"])

    # UI diff
    old_ui = old_schemas.get("ui", {})
    new_ui = new_schemas.get("ui", {})
    if old_ui != new_ui:
        ui_diff = _diff_lists(
            old_ui.get("pages", []),
            new_ui.get("pages", []),
            "id"
        )
        if any(ui_diff[k] for k in ui_diff):
            diff["ui"] = ui_diff
            stats["schemas_changed"] += 1
            stats["items_added"] += len(ui_diff["added"])
            stats["items_removed"] += len(ui_diff["removed"])
            stats["items_modified"] += len(ui_diff["modified"])

    # Auth diff
    old_auth = old_schemas.get("auth", {})
    new_auth = new_schemas.get("auth", {})
    if old_auth != new_auth:
        old_roles = old_auth.get("roles", [])
        new_roles = new_auth.get("roles", [])
        added_roles   = [r for r in new_roles if r not in old_roles]
        removed_roles = [r for r in old_roles if r not in new_roles]
        if added_roles or removed_roles:
            diff["auth"] = {"roles_added": added_roles, "roles_removed": removed_roles}
            stats["schemas_changed"] += 1
            stats["items_added"] += len(added_roles)
            stats["items_removed"] += len(removed_roles)

    return {"changes": diff, "stats": stats}


# ──────────────────────────────────────────────────────────────────────────────
# Main Patch Orchestrator
# ──────────────────────────────────────────────────────────────────────────────

async def run_patch(
    patch_instruction: str,
    current_output: dict,
    mode: str = "balanced",
    event_callback=None,
) -> dict:
    """
    Run the full patch pipeline:
      1. Analyze impact
      2. Patch affected schemas only
      3. Validate + repair
      4. Generate diff
    """
    mode_config = PIPELINE_MODES.get(mode, PIPELINE_MODES["balanced"])
    temperature = mode_config["temperature"]
    patch_start = time.time()

    async def emit(event_type: str, **kwargs):
        if event_callback:
            await event_callback({"type": event_type, **kwargs})

    old_schemas = current_output.get("schemas", {})
    new_schemas  = {k: dict(v) for k, v in old_schemas.items()}  # deep copy

    # ── Step 1: Impact Analysis ──────────────────────────────────────────
    await emit("patch_stage", stage="impact", message="Analyzing which schemas are affected...")
    try:
        impact = await analyze_impact(patch_instruction, current_output, temperature)
        affected = impact.get("affected_schemas", ["api", "db"])
        await emit(
            "patch_impact",
            affected_schemas=affected,
            rationale=impact.get("rationale", ""),
            new_entities=impact.get("new_entities", []),
            patch_summary=impact.get("patch_summary", patch_instruction),
            risk_level=impact.get("risk_level", "medium"),
        )
    except Exception as e:
        logger.warning(f"Impact analysis failed ({e}), defaulting to [api, db, ui]")
        affected = ["api", "db", "ui"]
        await emit("patch_impact", affected_schemas=affected, rationale="Impact analysis unavailable, patching common schemas")

    # ── Step 2: Patch each affected schema ────────────────────────────────
    await emit("patch_stage", stage="patching", message=f"Patching {len(affected)} schema(s): {', '.join(affected)}...")
    patch_metrics = {}

    for schema_type in affected:
        if schema_type not in old_schemas:
            continue
        try:
            await emit("patch_schema_start", schema=schema_type)
            patched, meta = await patch_schema(
                schema_type,
                old_schemas[schema_type],
                patch_instruction,
                current_output,
                temperature,
            )
            new_schemas[schema_type] = patched
            patch_metrics[schema_type] = meta
            await emit("patch_schema_done", schema=schema_type, **meta)
        except Exception as e:
            await emit("patch_schema_error", schema=schema_type, message=str(e))
            logger.error(f"Failed to patch {schema_type}: {e}")

    # ── Step 3: Cross-layer Validation + Repair ───────────────────────────
    await emit("patch_stage", stage="validation", message="Validating patched schemas for consistency...")

    ui   = new_schemas.get("ui", {})
    api  = new_schemas.get("api", {})
    db   = new_schemas.get("db", {})
    auth = new_schemas.get("auth", {})
    design = current_output.get("design", {})

    cross_errors = cross_layer.check(ui, api, db, auth, design)

    if cross_errors:
        await emit(
            "patch_validation_errors",
            errors=[e.to_dict() for e in cross_errors],
            count=len(cross_errors),
            message=f"{len(cross_errors)} inconsistencies found — repairing...",
        )
        ui, api, db, auth, repair_results = await repair.repair_all(
            cross_errors, ui, api, db, auth, design
        )
        new_schemas = {"ui": ui, "api": api, "db": db, "auth": auth}
        successful = sum(1 for r in repair_results if r.success)
        await emit(
            "patch_repair_complete",
            repairs_attempted=len(repair_results),
            repairs_successful=successful,
        )
    else:
        await emit("patch_validation_passed", message="All cross-layer checks passed ✓")

    # ── Step 4: Diff Generation ───────────────────────────────────────────
    diff = generate_diff(old_schemas, new_schemas)

    # ── Assemble final output ─────────────────────────────────────────────
    total_duration = round((time.time() - patch_start) * 1000)

    # Merge new schemas into the original output
    patched_output = {
        **current_output,
        "schemas": new_schemas,
        "patch_applied": {
            "instruction": patch_instruction,
            "affected_schemas": affected,
            "diff": diff,
            "patch_metrics": patch_metrics,
            "duration_ms": total_duration,
            "cross_errors_found": len(cross_errors) if cross_errors else 0,
        },
    }

    await emit(
        "patch_complete",
        data=patched_output,
        diff=diff,
        affected_schemas=affected,
        duration_ms=total_duration,
    )

    logger.info(
        f"Patch complete | {patch_instruction[:50]!r} | "
        f"affected={affected} | {total_duration}ms | "
        f"added={diff['stats']['items_added']} removed={diff['stats']['items_removed']}"
    )
    return patched_output
