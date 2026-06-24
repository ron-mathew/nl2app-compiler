"""
UI Simulator — validates the UI schema is executable:
- All data_source endpoints resolve to real API endpoints
- All submit_action endpoints resolve to real API endpoints
- All access_roles exist in Auth schema
- All form field types are valid
- All component types are known/renderable

No actual browser rendering — this is a static analysis proof that
"a frontend renderer consuming this schema would not crash."
"""
import logging
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

VALID_COMPONENT_TYPES = {
    "form", "data_table", "card", "chart", "button", "modal",
    "stats_card", "list", "tabs", "text", "image", "map",
    "calendar", "kanban",
}

VALID_FIELD_TYPES = {
    "text", "email", "password", "number", "date", "select",
    "textarea", "checkbox", "radio", "file", "phone",
}


@dataclass
class UIIssue:
    severity: str  # "error" | "warning"
    page_id: str
    component_id: str
    field: str
    message: str

    def to_dict(self):
        return {
            "severity": self.severity,
            "page_id": self.page_id,
            "component_id": self.component_id,
            "field": self.field,
            "message": self.message,
        }


@dataclass
class UISimulationResult:
    success: bool
    pages_validated: int
    components_validated: int
    issues: list[UIIssue] = field(default_factory=list)
    proof_statement: str = ""

    def to_dict(self):
        return {
            "layer": "ui",
            "success": self.success,
            "pages_validated": self.pages_validated,
            "components_validated": self.components_validated,
            "issue_count": len(self.issues),
            "issues": [i.to_dict() for i in self.issues],
            "proof_statement": self.proof_statement,
        }


def simulate(ui_schema: dict, api_schema: dict, auth_schema: dict) -> UISimulationResult:
    """
    Statically validate UI schema is executable given the API and Auth schemas.
    """
    # Build indexes
    api_endpoints = set()
    for ep in api_schema.get("endpoints", []):
        key = f"{ep.get('method', '?')} {ep.get('path', '?')}"
        api_endpoints.add(key)

    auth_roles = set(auth_schema.get("roles", []))

    issues = []
    pages = ui_schema.get("pages", [])
    total_components = 0

    for page in pages:
        page_id = page.get("id", "unknown_page")

        # Check page access_roles
        access = page.get("access_roles", [])
        if isinstance(access, list):
            for role in access:
                if auth_roles and role not in auth_roles:
                    issues.append(UIIssue(
                        severity="error",
                        page_id=page_id,
                        component_id="(page)",
                        field="access_roles",
                        message=f"Role '{role}' not found in Auth schema roles: {auth_roles}",
                    ))

        for comp in page.get("components", []):
            total_components += 1
            comp_id = comp.get("id", "unknown_comp")
            comp_type = comp.get("type", "")

            # Check component type is renderable
            if comp_type not in VALID_COMPONENT_TYPES:
                issues.append(UIIssue(
                    severity="error",
                    page_id=page_id,
                    component_id=comp_id,
                    field="type",
                    message=f"Unknown component type '{comp_type}'. Cannot render.",
                ))

            # Check data_source resolves
            if ds := comp.get("data_source"):
                if ds not in api_endpoints:
                    issues.append(UIIssue(
                        severity="error",
                        page_id=page_id,
                        component_id=comp_id,
                        field="data_source",
                        message=f"data_source '{ds}' not found in API schema endpoints",
                    ))

            # Check submit_action resolves
            if sa := comp.get("submit_action"):
                if sa not in api_endpoints:
                    issues.append(UIIssue(
                        severity="error",
                        page_id=page_id,
                        component_id=comp_id,
                        field="submit_action",
                        message=f"submit_action '{sa}' not found in API schema endpoints",
                    ))

            # Check form field types
            for fi, form_field in enumerate(comp.get("fields", [])):
                ft = form_field.get("type", "")
                if ft not in VALID_FIELD_TYPES:
                    issues.append(UIIssue(
                        severity="warning",
                        page_id=page_id,
                        component_id=comp_id,
                        field=f"fields[{fi}].type",
                        message=f"Unknown field type '{ft}' — may not render correctly",
                    ))

    errors = [i for i in issues if i.severity == "error"]
    success = len(errors) == 0

    result = UISimulationResult(
        success=success,
        pages_validated=len(pages),
        components_validated=total_components,
        issues=issues,
        proof_statement=(
            f"All {len(pages)} pages and {total_components} components validated. UI schema is executable."
            if success else
            f"{len(errors)} critical issues found across {len(pages)} pages. UI schema needs repair."
        ),
    )
    logger.info(f"[UI Simulator] Result: {result.proof_statement}")
    return result
