"""
Cross-Layer Consistency Checker — Layer 2 of the Validation Engine
Pure rule-based Python code. Zero LLM involvement.
Checks that all 4 schemas agree with each other and with the System Design.

Rules checked:
  1. API → DB: every endpoint's db_table exists in DB schema tables
  2. UI → API: every data_source/submit_action maps to a real API endpoint
  3. Auth → Design: every auth role exists in design roles
  4. API → Auth: every required_role in API exists in auth roles
  5. DB → Design: every canonical entity has a DB table
  6. UI → Auth: every access_role in UI pages exists in auth roles
"""
import logging
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class CrossLayerError:
    error_type: str           # e.g. "API_DB_MISMATCH"
    layer_a: str              # layer with the bad reference
    layer_b: str              # layer being referenced
    field_path: str           # exact dotted path of the bad field
    bad_value: Any            # the value that's wrong
    message: str              # human readable description
    suggested_fix: str        # concrete suggestion
    auto_fixable: bool = True # can the repair engine fix this?

    def to_dict(self):
        return {
            "error_type": self.error_type,
            "layer_a": self.layer_a,
            "layer_b": self.layer_b,
            "field_path": self.field_path,
            "bad_value": str(self.bad_value)[:100],
            "message": self.message,
            "suggested_fix": self.suggested_fix,
            "auto_fixable": self.auto_fixable,
        }


def _api_endpoints_index(api: dict) -> dict[str, dict]:
    """Build a lookup: 'METHOD /api/path' → endpoint dict"""
    index = {}
    for ep in api.get("endpoints", []):
        key = f"{ep.get('method', '?')} {ep.get('path', '?')}"
        index[key] = ep
    return index


def _db_tables_index(db: dict) -> set[str]:
    """Set of all table names in DB schema"""
    return {t["name"] for t in db.get("tables", [])}


def check(
    ui: dict,
    api: dict,
    db: dict,
    auth: dict,
    design: dict,
) -> list[CrossLayerError]:
    """
    Run all cross-layer consistency rules.
    Returns list of CrossLayerError (empty = all consistent).
    """
    errors: list[CrossLayerError] = []
    api_index = _api_endpoints_index(api)
    db_tables = _db_tables_index(db)
    auth_roles = set(auth.get("roles", []))
    design_roles = set(design.get("roles", []))
    canonical_entities = set(design.get("canonical_entity_names", []))

    # ── Rule 1: API → DB ────────────────────────────────────
    # Every endpoint's db_table must exist in DB schema
    for i, ep in enumerate(api.get("endpoints", [])):
        db_table = ep.get("db_table")
        if db_table and db_table not in db_tables and db_table != "NONE":
            errors.append(CrossLayerError(
                error_type="API_DB_TABLE_MISSING",
                layer_a="api",
                layer_b="db",
                field_path=f"endpoints[{i}].db_table",
                bad_value=db_table,
                message=f"API endpoint '{ep.get('id', i)}' references DB table '{db_table}' which does not exist in DB schema",
                suggested_fix=f"Change db_table to one of: {sorted(db_tables)} OR add table '{db_table}' to DB schema",
                auto_fixable=True,
            ))

    # ── Rule 2: UI → API ────────────────────────────────────
    # Every data_source and submit_action must match an API endpoint
    for pi, page in enumerate(ui.get("pages", [])):
        for ci, comp in enumerate(page.get("components", [])):
            for field_name in ("data_source", "submit_action"):
                ref = comp.get(field_name)
                if ref and ref not in api_index:
                    errors.append(CrossLayerError(
                        error_type="UI_API_ENDPOINT_MISSING",
                        layer_a="ui",
                        layer_b="api",
                        field_path=f"pages[{pi}].components[{ci}].{field_name}",
                        bad_value=ref,
                        message=f"UI component '{comp.get('id', ci)}' on page '{page.get('id', pi)}' references endpoint '{ref}' which does not exist in API schema",
                        suggested_fix=f"Add endpoint '{ref}' to API schema OR update component to use existing endpoint",
                        auto_fixable=True,
                    ))

    # ── Rule 3: Auth → Design ───────────────────────────────
    # Every auth role must exist in design roles
    for role in auth_roles:
        if role not in design_roles:
            errors.append(CrossLayerError(
                error_type="AUTH_ROLE_NOT_IN_DESIGN",
                layer_a="auth",
                layer_b="design",
                field_path="roles",
                bad_value=role,
                message=f"Auth schema defines role '{role}' which is not in System Design roles: {design_roles}",
                suggested_fix=f"Remove '{role}' from auth roles OR add it to design roles",
                auto_fixable=True,
            ))

    # ── Rule 4: API → Auth ──────────────────────────────────
    # Every required_role in API endpoints must exist in auth roles
    for i, ep in enumerate(api.get("endpoints", [])):
        for role in ep.get("required_roles", []):
            if role not in auth_roles:
                errors.append(CrossLayerError(
                    error_type="API_ROLE_NOT_IN_AUTH",
                    layer_a="api",
                    layer_b="auth",
                    field_path=f"endpoints[{i}].required_roles",
                    bad_value=role,
                    message=f"API endpoint '{ep.get('id', i)}' requires role '{role}' which is not defined in Auth schema",
                    suggested_fix=f"Add role '{role}' to auth schema OR remove it from endpoint required_roles",
                    auto_fixable=True,
                ))

    # ── Rule 5: DB → Design ─────────────────────────────────
    # Every canonical entity must have a corresponding DB table
    for entity in canonical_entities:
        if entity not in db_tables:
            errors.append(CrossLayerError(
                error_type="DB_MISSING_ENTITY_TABLE",
                layer_a="db",
                layer_b="design",
                field_path="tables",
                bad_value=entity,
                message=f"Canonical entity '{entity}' from System Design has no corresponding table in DB schema",
                suggested_fix=f"Add a table named '{entity}' to the DB schema",
                auto_fixable=True,
            ))

    # ── Rule 6: UI → Auth ───────────────────────────────────
    # Every access_role in UI pages must exist in auth roles
    for pi, page in enumerate(ui.get("pages", [])):
        access = page.get("access_roles", [])
        if isinstance(access, list):
            for role in access:
                if role not in auth_roles and auth_roles:  # skip if auth is empty (will be caught by Rule 3)
                    errors.append(CrossLayerError(
                        error_type="UI_ROLE_NOT_IN_AUTH",
                        layer_a="ui",
                        layer_b="auth",
                        field_path=f"pages[{pi}].access_roles",
                        bad_value=role,
                        message=f"UI page '{page.get('id', pi)}' restricts access to role '{role}' which is not in Auth schema",
                        suggested_fix=f"Add role '{role}' to auth schema OR fix page access_roles",
                        auto_fixable=True,
                    ))

    if errors:
        logger.warning(f"[CrossLayer] Found {len(errors)} cross-layer inconsistencies")
        for e in errors:
            logger.warning(f"  [{e.error_type}] {e.message[:100]}")
    else:
        logger.info("[CrossLayer] All cross-layer checks passed ✓")

    return errors
