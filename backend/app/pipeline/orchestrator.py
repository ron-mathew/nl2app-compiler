"""
Pipeline Orchestrator — coordinates all 5 stages and emits SSE events.
This is the entry point called by the FastAPI route.

Flow:
  Stage 1: Intent Extraction
  Stage 2: System Design
  Stage 3: Schema Generation (parallel)
  Stage 4: Validation + Repair (deterministic + surgical LLM repair)
  Stage 5: Mock Runtime Execution
  Final: Assemble + return complete config
"""
import time
import logging
import asyncio
from typing import AsyncGenerator, Optional
from app.pipeline import stage1_intent, stage2_design, stage3_schema_gen, stage4_refine
from app.validation import validator, cross_layer, repair
from app.runtime import db_simulator, api_simulator, ui_simulator
from app.core.config import get_settings, PIPELINE_MODES

logger = logging.getLogger(__name__)
settings = get_settings()


async def run_pipeline(
    prompt: str,
    mode: str = "balanced",
    event_callback=None,
) -> dict:
    """
    Run the full 5-stage pipeline.
    
    event_callback: async callable that receives SSE event dicts.
                    Used for real-time streaming to the frontend.
    
    Returns the complete assembled config dict.
    """
    mode_config = PIPELINE_MODES.get(mode, PIPELINE_MODES["balanced"])
    temperature = mode_config["temperature"]
    pipeline_start = time.time()

    total_tokens = {"input": 0, "output": 0}
    total_cost = 0.0
    all_metrics = {}

    async def emit(event_type: str, **kwargs):
        if event_callback:
            await event_callback({"type": event_type, **kwargs})

    # ──────────────────────────────────────────────────────────────
    # STAGE 1: Intent Extraction
    # ──────────────────────────────────────────────────────────────
    await emit("stage_start", stage="intent", message="Extracting intent and entities...")
    t = time.time()
    try:
        intent_ir, meta1 = await stage1_intent.run(prompt, temperature=temperature)
        duration1 = round((time.time() - t) * 1000)
        all_metrics["stage1_intent"] = {**meta1, "duration_ms": duration1}
        total_tokens["input"] += meta1.get("input_tokens", 0)
        total_tokens["output"] += meta1.get("output_tokens", 0)
        total_cost += meta1.get("cost_estimate_usd", 0)

        # Early exit if clarification is absolutely needed
        if intent_ir.get("clarification_needed") and not intent_ir.get("entities"):
            questions = intent_ir.get("clarification_questions", ["Please describe your app in more detail."])
            await emit("clarification_needed", questions=questions)
            return {"status": "clarification_needed", "questions": questions}

        await emit(
            "stage_complete",
            stage="intent",
            data=intent_ir,
            duration_ms=duration1,
            entities=len(intent_ir.get("entities", [])),
            features=len(intent_ir.get("features", [])),
            ambiguity_flags=intent_ir.get("ambiguity_flags", []),
            assumptions=intent_ir.get("assumptions", []),
        )
    except Exception as e:
        await emit("error", stage="intent", message=str(e))
        raise

    # ──────────────────────────────────────────────────────────────
    # STAGE 2: System Design
    # ──────────────────────────────────────────────────────────────
    await emit("stage_start", stage="design", message="Designing app architecture...")
    t = time.time()
    try:
        design, meta2 = await stage2_design.run(intent_ir, temperature=temperature)
        duration2 = round((time.time() - t) * 1000)
        all_metrics["stage2_design"] = {**meta2, "duration_ms": duration2}
        total_tokens["input"] += meta2.get("input_tokens", 0)
        total_tokens["output"] += meta2.get("output_tokens", 0)
        total_cost += meta2.get("cost_estimate_usd", 0)

        await emit(
            "stage_complete",
            stage="design",
            data=design,
            duration_ms=duration2,
            pages=len(design.get("pages", [])),
            roles=design.get("roles", []),
        )
    except Exception as e:
        await emit("error", stage="design", message=str(e))
        raise

    # ──────────────────────────────────────────────────────────────
    # STAGE 3: Schema Generation (4 parallel sub-generators)
    # ──────────────────────────────────────────────────────────────
    await emit("stage_start", stage="schema_gen", message="Generating UI, API, DB, and Auth schemas in parallel...")
    t = time.time()
    try:
        schemas, meta3 = await stage3_schema_gen.run(intent_ir, design, temperature=temperature)
        duration3 = round((time.time() - t) * 1000)
        all_metrics["stage3_schema_gen"] = meta3
        for sub_meta in meta3.values():
            total_tokens["input"] += sub_meta.get("input_tokens", 0)
            total_tokens["output"] += sub_meta.get("output_tokens", 0)
            total_cost += sub_meta.get("cost_estimate_usd", 0)

        await emit(
            "stage_complete",
            stage="schema_gen",
            data=schemas,
            duration_ms=duration3,
            ui_pages=len(schemas.get("ui", {}).get("pages", [])),
            api_endpoints=len(schemas.get("api", {}).get("endpoints", [])),
            db_tables=len(schemas.get("db", {}).get("tables", [])),
            auth_roles=schemas.get("auth", {}).get("roles", []),
        )
    except Exception as e:
        await emit("error", stage="schema_gen", message=str(e))
        raise

    ui = schemas.get("ui", {})
    api = schemas.get("api", {})
    db = schemas.get("db", {})
    auth = schemas.get("auth", {})

    # ──────────────────────────────────────────────────────────────
    # STAGE 4: Validation + Repair
    # ──────────────────────────────────────────────────────────────
    await emit("stage_start", stage="validation", message="Running schema validation and cross-layer checks...")

    # Layer 1: JSON Schema validation
    validation_results = validator.validate_all(intent_ir, design, schemas)
    schema_errors = {k: v for k, v in validation_results.items() if not v.valid}

    if schema_errors:
        await emit(
            "validation_errors",
            stage="validation",
            errors={k: v.to_dict() for k, v in schema_errors.items()},
            message=f"Found schema validation errors in: {list(schema_errors.keys())}",
        )

    # Layer 2: Cross-layer consistency checks
    cross_errors = cross_layer.check(ui, api, db, auth, design)

    if cross_errors:
        await emit(
            "cross_layer_errors",
            stage="validation",
            errors=[e.to_dict() for e in cross_errors],
            count=len(cross_errors),
            message=f"Found {len(cross_errors)} cross-layer inconsistencies",
        )

        # Layer 3: Surgical repair
        await emit(
            "repair_start",
            stage="repair",
            count=len(cross_errors),
            message=f"Starting surgical repair of {len(cross_errors)} inconsistencies...",
        )

        ui, api, db, auth, repair_results = await repair.repair_all(
            cross_errors, ui, api, db, auth, design
        )

        schemas = {"ui": ui, "api": api, "db": db, "auth": auth}

        successful_repairs = sum(1 for r in repair_results if r.success)
        clarifications = [r for r in repair_results if r.needs_clarification]

        await emit(
            "repair_complete",
            stage="repair",
            repairs_attempted=len(repair_results),
            repairs_successful=successful_repairs,
            clarifications_needed=[r.to_dict() for r in clarifications],
        )

        all_metrics["repair"] = {
            "errors_found": len(cross_errors),
            "repairs_attempted": len(repair_results),
            "repairs_successful": successful_repairs,
            "clarifications_needed": len(clarifications),
        }

    else:
        await emit("validation_passed", stage="validation", message="All validation checks passed ✓")
        all_metrics["repair"] = {"errors_found": 0, "repairs_attempted": 0}

    # Stage 4b: LLM refinement pass (thorough mode only)
    if mode == "thorough":
        await emit("stage_start", stage="refinement", message="Running final LLM cross-layer refinement...")
        t = time.time()
        schemas, meta4 = await stage4_refine.run(schemas, design, temperature=temperature)
        duration4 = round((time.time() - t) * 1000)
        all_metrics["stage4_refine"] = {**meta4, "duration_ms": duration4}
        ui = schemas["ui"]
        api = schemas["api"]
        db = schemas["db"]
        auth = schemas["auth"]
        await emit("stage_complete", stage="refinement", duration_ms=duration4)

    # ──────────────────────────────────────────────────────────────
    # STAGE 5: Mock Runtime Execution
    # ──────────────────────────────────────────────────────────────
    await emit("stage_start", stage="runtime", message="Simulating execution — proving output is usable...")

    db_result = db_simulator.simulate(db)
    await emit("runtime_result", **db_result.to_dict())

    api_result = api_simulator.simulate(api)
    await emit("runtime_result", **api_result.to_dict())

    ui_result = ui_simulator.simulate(ui, api, auth)
    await emit("runtime_result", **ui_result.to_dict())

    overall_runtime_success = db_result.success and api_result.success and ui_result.success

    await emit(
        "stage_complete",
        stage="runtime",
        success=overall_runtime_success,
        db=db_result.to_dict(),
        api=api_result.to_dict(),
        ui=ui_result.to_dict(),
    )

    # ──────────────────────────────────────────────────────────────
    # Final Assembly
    # ──────────────────────────────────────────────────────────────
    total_duration = round((time.time() - pipeline_start) * 1000)

    final_metrics = {
        "total_duration_ms": total_duration,
        "tokens": total_tokens,
        "cost_estimate_usd": round(total_cost, 6),
        "stages": all_metrics,
        "runtime": {
            "db_success": db_result.success,
            "api_success": api_result.success,
            "ui_success": ui_result.success,
            "overall_executable": overall_runtime_success,
        },
        "mode": mode,
    }

    final_output = {
        "status": "success",
        "app_name": intent_ir.get("app_name", "Generated App"),
        "intent": intent_ir,
        "design": design,
        "schemas": {
            "ui": ui,
            "api": api,
            "db": db,
            "auth": auth,
        },
        "runtime_proof": {
            "db": db_result.to_dict(),
            "api": api_result.to_dict(),
            "ui": ui_result.to_dict(),
        },
        "metrics": final_metrics,
    }

    await emit("complete", data=final_output, metrics=final_metrics)
    logger.info(f"Pipeline complete | {total_duration}ms | ${total_cost:.6f}")
    return final_output
