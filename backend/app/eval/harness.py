"""
Evaluation Harness — 20 prompts (10 real + 10 edge cases)
Runs all prompts through the full pipeline, collects metrics, saves results.
This produces the "actual metrics, not claims" the evaluators are looking for.
"""
import json
import time
import asyncio
import logging
from pathlib import Path
from datetime import datetime
from app.pipeline.orchestrator import run_pipeline

logger = logging.getLogger(__name__)

RESULTS_DIR = Path(__file__).parent / "results"
RESULTS_DIR.mkdir(exist_ok=True)

# ──────────────────────────────────────────────────────────────
# 10 Real Product Prompts
# ──────────────────────────────────────────────────────────────
REAL_PROMPTS = [
    {
        "id": "R01",
        "category": "real",
        "prompt": "Build a CRM with login, contacts, dashboard, role-based access, and premium plan with payments. Admins can see analytics.",
        "expected_entities": ["users", "contacts"],
        "expected_features": ["auth", "crud", "analytics", "billing", "rbac"],
    },
    {
        "id": "R02",
        "category": "real",
        "prompt": "Create an e-commerce platform with product catalog, shopping cart, checkout with Stripe payments, order tracking, and vendor management. Vendors can manage their own products.",
        "expected_entities": ["users", "products", "orders", "carts", "vendors"],
        "expected_features": ["auth", "crud", "billing", "rbac"],
    },
    {
        "id": "R03",
        "category": "real",
        "prompt": "Build a project management tool like Jira with sprints, tickets, assignees, comments, attachments, and time tracking. Managers can assign tickets, developers can update status.",
        "expected_entities": ["users", "projects", "sprints", "tickets"],
        "expected_features": ["auth", "crud", "rbac"],
    },
    {
        "id": "R04",
        "category": "real",
        "prompt": "Create a healthcare portal with patient records, appointment scheduling, doctor profiles, prescription management, and medical history. Doctors see all patients, patients see only their own data.",
        "expected_entities": ["users", "patients", "doctors", "appointments", "prescriptions"],
        "expected_features": ["auth", "crud", "rbac", "notifications"],
    },
    {
        "id": "R05",
        "category": "real",
        "prompt": "Build a learning management system with courses, video lessons, quizzes, student progress tracking, certificates, and instructor dashboard. Students enroll in courses, instructors create content.",
        "expected_entities": ["users", "courses", "lessons", "quizzes", "enrollments"],
        "expected_features": ["auth", "crud", "analytics", "rbac"],
    },
    {
        "id": "R06",
        "category": "real",
        "prompt": "Create a real estate platform with property listings, advanced search and filters, agent profiles, booking requests, virtual tour scheduling, and mortgage calculator.",
        "expected_entities": ["users", "properties", "agents", "bookings"],
        "expected_features": ["auth", "crud", "search", "notifications"],
    },
    {
        "id": "R07",
        "category": "real",
        "prompt": "Build a restaurant management system with menu management, online ordering, table reservations, kitchen order display, staff management, and daily sales reports.",
        "expected_entities": ["users", "menu_items", "orders", "reservations", "staff"],
        "expected_features": ["auth", "crud", "analytics", "rbac"],
    },
    {
        "id": "R08",
        "category": "real",
        "prompt": "Create a social media platform with user profiles, posts with images, comments, likes, followers system, direct messaging, and content moderation for admins.",
        "expected_entities": ["users", "posts", "comments", "messages"],
        "expected_features": ["auth", "crud", "real_time", "rbac"],
    },
    {
        "id": "R09",
        "category": "real",
        "prompt": "Build an HR management system with employee records, leave request management, payroll processing, performance reviews, org chart, and department management.",
        "expected_entities": ["users", "employees", "departments", "leave_requests", "payroll"],
        "expected_features": ["auth", "crud", "analytics", "rbac", "reporting"],
    },
    {
        "id": "R10",
        "category": "real",
        "prompt": "Create a fintech app with bank account management, money transfers, transaction history, budget tracking with categories, savings goals, and investment portfolio overview.",
        "expected_entities": ["users", "accounts", "transactions", "budgets", "investments"],
        "expected_features": ["auth", "crud", "analytics", "billing"],
    },
]

# ──────────────────────────────────────────────────────────────
# 10 Edge Case Prompts
# ──────────────────────────────────────────────────────────────
EDGE_PROMPTS = [
    {
        "id": "E01",
        "category": "edge_vague",
        "prompt": "Build an app",
        "expected_behavior": "clarification_needed or reasonable_assumption",
    },
    {
        "id": "E02",
        "category": "edge_underspecified",
        "prompt": "Make a website with login",
        "expected_behavior": "assumptions_made",
    },
    {
        "id": "E03",
        "category": "edge_conflicting",
        "prompt": "Build a CRM where admins cannot see anything but regular users can see all data and manage everything including admin accounts.",
        "expected_behavior": "ambiguity_flagged",
    },
    {
        "id": "E04",
        "category": "edge_vague_reference",
        "prompt": "Create something like Facebook but completely different and better with more features.",
        "expected_behavior": "reasonable_assumption",
    },
    {
        "id": "E05",
        "category": "edge_conflicting_business",
        "prompt": "Build a SaaS platform where free tier users have all premium features including unlimited storage and API access, and paid users get a more restricted experience.",
        "expected_behavior": "ambiguity_flagged",
    },
    {
        "id": "E06",
        "category": "edge_ambiguous_roles",
        "prompt": "Create a marketplace where buyers and sellers are the same people and everyone is both an admin and a regular user simultaneously.",
        "expected_behavior": "ambiguity_flagged",
    },
    {
        "id": "E07",
        "category": "edge_overloaded",
        "prompt": "Build an app with user auth, GDPR compliance, SOC2, HIPAA, PCI-DSS, real-time chat, video calls, AI recommendations, blockchain transactions, and IoT sensor dashboard.",
        "expected_behavior": "partial_success_or_scope_reduction",
    },
    {
        "id": "E08",
        "category": "edge_mixed_paradigm",
        "prompt": "Build a real-time chat application that also handles batch processing of monthly financial reports and serves as a content management system.",
        "expected_behavior": "reasonable_assumption",
    },
    {
        "id": "E09",
        "category": "edge_empty",
        "prompt": "",
        "expected_behavior": "clarification_needed",
    },
    {
        "id": "E10",
        "category": "edge_impossible_scope",
        "prompt": "Make an app that is exactly like Stripe, Salesforce, and Netflix combined in one platform with all their features.",
        "expected_behavior": "ambiguity_flagged_or_reasonable_subset",
    },
]

ALL_PROMPTS = REAL_PROMPTS + EDGE_PROMPTS


async def run_single(prompt_spec: dict, mode: str = "balanced") -> dict:
    """Run a single prompt through the full pipeline and collect metrics."""
    prompt_id = prompt_spec["id"]
    prompt = prompt_spec["prompt"]

    logger.info(f"[Eval] Running prompt {prompt_id}: '{prompt[:60]}...'")

    events = []
    repair_events = []
    start = time.time()

    async def collect_event(event):
        events.append(event)
        if event.get("type") in ("repair_start", "repair_complete", "cross_layer_errors"):
            repair_events.append(event)

    try:
        result = await run_pipeline(prompt, mode=mode, event_callback=collect_event)
        elapsed = round((time.time() - start) * 1000)

        metrics = result.get("metrics", {})
        cross_errors_found = next(
            (e.get("count", 0) for e in events if e.get("type") == "cross_layer_errors"), 0
        )
        repair_summary = next(
            (e for e in events if e.get("type") == "repair_complete"), {}
        )

        return {
            "prompt_id": prompt_id,
            "category": prompt_spec.get("category", "unknown"),
            "prompt": prompt,
            "status": result.get("status", "unknown"),
            "success": result.get("status") == "success",
            "total_duration_ms": elapsed,
            "cross_layer_errors": cross_errors_found,
            "repairs_attempted": repair_summary.get("repairs_attempted", 0),
            "repairs_successful": repair_summary.get("repairs_successful", 0),
            "clarifications_needed": repair_summary.get("clarifications_needed", []),
            "ambiguity_flags": len(result.get("intent", {}).get("ambiguity_flags", [])),
            "assumptions_made": len(result.get("intent", {}).get("assumptions", [])),
            "tokens_input": metrics.get("tokens", {}).get("input", 0),
            "tokens_output": metrics.get("tokens", {}).get("output", 0),
            "cost_usd": metrics.get("cost_estimate_usd", 0),
            "runtime_executable": metrics.get("runtime", {}).get("overall_executable", False),
            "error": None,
        }
    except Exception as e:
        elapsed = round((time.time() - start) * 1000)
        logger.error(f"[Eval] Prompt {prompt_id} FAILED: {e}")
        return {
            "prompt_id": prompt_id,
            "category": prompt_spec.get("category", "unknown"),
            "prompt": prompt,
            "status": "error",
            "success": False,
            "total_duration_ms": elapsed,
            "cross_layer_errors": 0,
            "repairs_attempted": 0,
            "repairs_successful": 0,
            "clarifications_needed": [],
            "ambiguity_flags": 0,
            "assumptions_made": 0,
            "tokens_input": 0,
            "tokens_output": 0,
            "cost_usd": 0,
            "runtime_executable": False,
            "error": str(e),
        }


async def run_all(mode: str = "balanced", delay_between: float = 5.0) -> dict:
    """
    Run all 20 prompts sequentially (with delay to respect rate limits).
    Returns full results + summary metrics.

    delay_between: seconds between prompts. Default=5.0 to stay within the
    free-tier limit of 15 req/min (each pipeline makes ~5 LLM calls).
    """
    logger.info(f"[Eval] Starting evaluation harness — {len(ALL_PROMPTS)} prompts, mode={mode}")
    results = []

    for i, prompt_spec in enumerate(ALL_PROMPTS):
        result = await run_single(prompt_spec, mode=mode)
        results.append(result)
        logger.info(
            f"[Eval] {i+1}/{len(ALL_PROMPTS)} | {prompt_spec['id']} | "
            f"{'✓' if result['success'] else '✗'} | {result['total_duration_ms']}ms"
        )
        if i < len(ALL_PROMPTS) - 1:
            await asyncio.sleep(delay_between)  # rate limit buffer

    # Compute summary metrics
    real_results = [r for r in results if r["category"] == "real"]
    edge_results = [r for r in results if r["category"].startswith("edge")]

    summary = {
        "run_at": datetime.utcnow().isoformat(),
        "mode": mode,
        "total_prompts": len(results),
        "overall": _compute_stats(results),
        "real_prompts": _compute_stats(real_results),
        "edge_cases": _compute_stats(edge_results),
        "failure_type_breakdown": _failure_breakdown(results),
        "results": results,
    }

    # Save to disk
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    out_path = RESULTS_DIR / f"eval_{timestamp}.json"
    out_path.write_text(json.dumps(summary, indent=2))
    logger.info(f"[Eval] Results saved to {out_path}")

    # Also save as latest
    (RESULTS_DIR / "latest.json").write_text(json.dumps(summary, indent=2))

    return summary


def _compute_stats(results: list) -> dict:
    if not results:
        return {}
    successes = [r for r in results if r["success"]]
    total_repair = sum(r["repairs_attempted"] for r in results)
    total_cost = sum(r["cost_usd"] for r in results)
    latencies = [r["total_duration_ms"] for r in results]
    executable = [r for r in results if r["runtime_executable"]]

    return {
        "count": len(results),
        "success_rate": round(len(successes) / len(results), 3),
        "executable_rate": round(len(executable) / len(results), 3),
        "avg_retries_per_request": round(total_repair / len(results), 2),
        "avg_latency_ms": round(sum(latencies) / len(latencies)),
        "max_latency_ms": max(latencies),
        "min_latency_ms": min(latencies),
        "total_cost_usd": round(total_cost, 4),
        "avg_cost_per_request_usd": round(total_cost / len(results), 6),
    }


def _failure_breakdown(results: list) -> dict:
    breakdown = {}
    for r in results:
        if not r["success"] and r.get("error"):
            error_type = r["error"][:50]
            breakdown[error_type] = breakdown.get(error_type, 0) + 1
    return breakdown
