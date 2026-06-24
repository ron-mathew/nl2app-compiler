"""
JSON Schema Validator — Layer 1 of the Validation Engine
Uses jsonschema (deterministic code, zero LLM involvement).
Returns structured ValidationResult with exact error paths.
"""
import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional
import jsonschema

logger = logging.getLogger(__name__)

SCHEMAS_DIR = Path(__file__).parent.parent / "schemas"

SCHEMA_FILES = {
    "intent": "intent_ir.schema.json",
    "design": "design.schema.json",
    "ui": "ui_schema.schema.json",
    "api": "api_schema.schema.json",
    "db": "db_schema.schema.json",
    "auth": "auth_schema.schema.json",
}

# Load all schemas once at import time
_loaded_schemas: dict[str, dict] = {}
for key, filename in SCHEMA_FILES.items():
    path = SCHEMAS_DIR / filename
    if path.exists():
        _loaded_schemas[key] = json.loads(path.read_text())


@dataclass
class ValidationError:
    layer: str
    error_path: list
    error_message: str
    failed_value: Any
    schema_path: list
    error_type: str  # "missing_field" | "wrong_type" | "invalid_value" | "extra_field"

    def to_dict(self):
        return {
            "layer": self.layer,
            "error_path": [str(p) for p in self.error_path],
            "error_message": self.error_message,
            "failed_value": str(self.failed_value)[:200],
            "schema_path": [str(p) for p in self.schema_path],
            "error_type": self.error_type,
        }

    @property
    def path_str(self) -> str:
        return ".".join(str(p) for p in self.error_path) or "(root)"


@dataclass
class ValidationResult:
    layer: str
    valid: bool
    errors: list[ValidationError] = field(default_factory=list)

    def to_dict(self):
        return {
            "layer": self.layer,
            "valid": self.valid,
            "error_count": len(self.errors),
            "errors": [e.to_dict() for e in self.errors],
        }


def _classify_error(e: jsonschema.ValidationError) -> str:
    if e.validator == "required":
        return "missing_field"
    elif e.validator == "type":
        return "wrong_type"
    elif e.validator in ("enum", "pattern", "format"):
        return "invalid_value"
    elif e.validator == "additionalProperties":
        return "extra_field"
    elif e.validator == "minItems":
        return "missing_field"
    else:
        return "constraint_violation"


def validate(data: dict, layer: str) -> ValidationResult:
    """
    Validate a dict against the JSON Schema for the given layer.
    Returns ValidationResult with all errors (not just the first).
    """
    schema = _loaded_schemas.get(layer)
    if schema is None:
        logger.warning(f"No schema loaded for layer '{layer}' — skipping validation")
        return ValidationResult(layer=layer, valid=True)

    validator = jsonschema.Draft7Validator(schema)
    raw_errors = list(validator.iter_errors(data))

    if not raw_errors:
        logger.info(f"[Validator] Layer '{layer}': VALID ✓")
        return ValidationResult(layer=layer, valid=True)

    errors = []
    for e in raw_errors:
        errors.append(ValidationError(
            layer=layer,
            error_path=list(e.absolute_path),
            error_message=e.message,
            failed_value=e.instance,
            schema_path=list(e.absolute_schema_path),
            error_type=_classify_error(e),
        ))
        logger.warning(f"[Validator] Layer '{layer}': {errors[-1].error_type} at {errors[-1].path_str} — {e.message[:100]}")

    return ValidationResult(layer=layer, valid=False, errors=errors)


def validate_all(
    intent: dict,
    design: dict,
    schemas: dict,
) -> dict[str, ValidationResult]:
    """
    Validate all layers. Returns dict of layer → ValidationResult.
    """
    results = {}
    results["intent"] = validate(intent, "intent")
    results["design"] = validate(design, "design")
    results["ui"] = validate(schemas.get("ui", {}), "ui")
    results["api"] = validate(schemas.get("api", {}), "api")
    results["db"] = validate(schemas.get("db", {}), "db")
    results["auth"] = validate(schemas.get("auth", {}), "auth")
    return results
