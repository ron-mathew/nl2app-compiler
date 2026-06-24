"""
FastAPI main application entry point.
Routes:
  POST /api/generate         — generate app config from prompt (SSE stream)
  GET  /api/generate/sync    — synchronous version (for testing)
  POST /api/eval/run         — run the evaluation harness
  GET  /api/eval/results     — get latest eval results
  GET  /api/health           — health check
"""
import io
import json
import zipfile
import asyncio
import logging
from typing import Optional
from pathlib import Path
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
from app.core.config import get_settings
from app.core.logger import setup_logging
from app.pipeline.orchestrator import run_pipeline
from app.pipeline.patch_engine import run_patch

setup_logging()
logger = logging.getLogger(__name__)
settings = get_settings()

app = FastAPI(
    title="NL2App Compiler API",
    description="Natural language → validated, executable application configuration",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class GenerateRequest(BaseModel):
    prompt: str
    mode: Optional[str] = "balanced"  # fast | balanced | thorough


class EvalRunRequest(BaseModel):
    mode: Optional[str] = "balanced"
    delay_between: Optional[float] = 2.0


class PatchRequest(BaseModel):
    patch_instruction: str
    current_output: dict
    mode: Optional[str] = "balanced"


# ──────────────────────────────────────────────────────────────
# SSE Streaming Generation Endpoint
# ──────────────────────────────────────────────────────────────
@app.post("/api/generate")
async def generate_app(request: GenerateRequest):
    """
    Main endpoint: streams pipeline progress as Server-Sent Events.
    Frontend listens to this and renders each stage in real-time.
    """
    if not request.prompt or not request.prompt.strip():
        # Handle empty prompt gracefully
        request.prompt = ""

    queue: asyncio.Queue = asyncio.Queue()

    async def event_callback(event: dict):
        await queue.put(event)

    async def run_and_close():
        try:
            await run_pipeline(
                prompt=request.prompt,
                mode=request.mode or "balanced",
                event_callback=event_callback,
            )
        except Exception as e:
            await queue.put({"type": "error", "message": str(e)})
        finally:
            await queue.put(None)  # sentinel to close stream

    asyncio.create_task(run_and_close())

    async def event_generator():
        while True:
            event = await queue.get()
            if event is None:
                break
            yield {
                "event": event.get("type", "message"),
                "data": json.dumps(event),
            }

    return EventSourceResponse(event_generator())


# ──────────────────────────────────────────────────────────────
# Synchronous Generation (for testing + eval harness)
# ──────────────────────────────────────────────────────────────
@app.post("/api/generate/sync")
async def generate_sync(request: GenerateRequest):
    """Synchronous version — waits for full result and returns JSON."""
    try:
        result = await run_pipeline(
            prompt=request.prompt or "",
            mode=request.mode or "balanced",
        )
        return result
    except Exception as e:
        logger.error(f"Generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────────────────────
# Patch Endpoint — Incremental Schema Refinement (SSE)
# ──────────────────────────────────────────────────────────────
@app.post("/api/patch")
async def patch_app(request: PatchRequest):
    """
    Incremental refinement endpoint — streams patch progress as SSE.
    Only patches the schemas affected by the instruction.
    Unchanged schemas are returned byte-for-byte identical.
    """
    if not request.patch_instruction or not request.patch_instruction.strip():
        raise HTTPException(status_code=400, detail="patch_instruction is required")
    if not request.current_output:
        raise HTTPException(status_code=400, detail="current_output (full pipeline result) is required")

    queue: asyncio.Queue = asyncio.Queue()

    async def event_callback(event: dict):
        await queue.put(event)

    async def run_and_close():
        try:
            await run_patch(
                patch_instruction=request.patch_instruction,
                current_output=request.current_output,
                mode=request.mode or "balanced",
                event_callback=event_callback,
            )
        except Exception as e:
            await queue.put({"type": "error", "message": str(e)})
        finally:
            await queue.put(None)

    asyncio.create_task(run_and_close())

    async def event_generator():
        while True:
            event = await queue.get()
            if event is None:
                break
            yield {
                "event": event.get("type", "message"),
                "data": json.dumps(event),
            }

    return EventSourceResponse(event_generator())


class ExportRequest(BaseModel):
    current_output: dict


# ──────────────────────────────────────────────────────────────
# Export Project to ZIP Endpoint
# ──────────────────────────────────────────────────────────────
@app.post("/api/export")
async def export_app(request: ExportRequest):
    """
    Export the generated configuration as a structured ZIP file.
    """
    output = request.current_output
    if not output:
        raise HTTPException(status_code=400, detail="current_output is required")
        
    app_name = output.get("app_name") or output.get("intent", {}).get("app_name") or "Application"
    app_name_safe = "".join(c for c in app_name if c.isalnum() or c in ("-", "_")).strip()
    
    schemas = output.get("schemas", {})
    db = schemas.get("db") or output.get("db") or {}
    api = schemas.get("api") or output.get("api") or {}
    ui = schemas.get("ui") or output.get("ui") or {}
    auth = schemas.get("auth") or output.get("auth") or {}
    intent = output.get("intent") or {}
    
    zip_buffer = io.BytesIO()
    
    with zipfile.ZipFile(zip_buffer, "a", zipfile.ZIP_DEFLATED, False) as zip_file:
        # 1. README.md
        prompt = output.get("prompt") or ""
        assumptions = "\n".join(f"- {a}" for a in intent.get("assumptions", []))
        readme_content = f"""# {app_name}
Auto-generated by NL2App AI Compiler.

## Original Prompt
> {prompt}

## Assumptions Made
{assumptions}

## Directory Structure
- `database/` - SQL schema definitions
- `endpoints/` - API route handlers
- `views/` - React page views
- `schemas/` - Raw config JSON schemas

## Running the App
This code represents the compiled static schemas. You can load `app_config.json` into any compatible NL2App runtime to run the sandbox instantly.
"""
        zip_file.writestr("README.md", readme_content)
        
        # 2. app_config.json
        zip_file.writestr("app_config.json", json.dumps(output, indent=2))
        
        # 3. schemas/ folder
        zip_file.writestr("schemas/db_schema.json", json.dumps(db, indent=2))
        zip_file.writestr("schemas/api_schema.json", json.dumps(api, indent=2))
        zip_file.writestr("schemas/ui_schema.json", json.dumps(ui, indent=2))
        zip_file.writestr("schemas/auth_schema.json", json.dumps(auth, indent=2))
        
        # 4. database/ folder
        tables = db.get("tables", [])
        for t in tables:
            t_name = t.get("name", "table")
            columns = t.get("columns", [])
            cols_sql = []
            for col in columns:
                c_name = col.get("name", "column")
                if c_name == "id":
                    continue
                cols_sql.append(f"    {c_name} TEXT")
            cols_sql_str = ",\n".join(cols_sql)
            if cols_sql_str:
                cols_sql_str = ",\n" + cols_sql_str
            sql_content = f"""-- SQL Schema definition for table: {t_name}
CREATE TABLE {t_name} (
    id SERIAL PRIMARY KEY{cols_sql_str}
);
"""
            zip_file.writestr(f"database/{t_name}.sql", sql_content)
            
        # 5. endpoints/ folder
        endpoints = api.get("endpoints", [])
        for ep in endpoints:
            path = ep.get("path", "/api")
            method = ep.get("method", "GET")
            file_name = path.strip("/").replace("/", "_") or "index"
            js_content = f"""// API Route Handler: {method} {path}
// Generated for application: {app_name}

export default function handler(req, res) {{
    if (req.method === '{method}') {{
        return res.status(200).json({{
            status: "success",
            message: "Auto-generated mockup response for {method} {path}"
        }});
    }}
    return res.status(405).json({{ error: "Method Not Allowed" }});
}}
"""
            zip_file.writestr(f"endpoints/{file_name}.js", js_content)
            
        # 6. views/ folder
        pages = ui.get("pages", [])
        for p in pages:
            p_id = p.get("id", "Page")
            p_name = p.get("name", p_id)
            p_route = p.get("route", "/")
            access = ", ".join(p.get("access_roles", [])) or "public"
            components = p.get("components", [])
            
            if not components:
                comps_html = "            <p>No visual elements placed yet.</p>"
            else:
                li_items = []
                for c in components:
                    c_type = c.get('type', 'Component')
                    c_id = c.get('id', 'N/A')
                    c_src = c.get('data_source', 'none')
                    li_items.append(f"                <li><strong>{c_type}</strong> (ID: <code>{c_id}</code>, Source: <code>{c_src}</code>)</li>")
                li_str = "\n".join(li_items)
                comps_html = f"""            <ul style={{{{ lineHeight: '1.8' }}}}>
{li_str}
            </ul>"""
            
            jsx_content = f"""// React Component View for page: {p_name}
// Route: {p_route}
// Access: {access}

import React from 'react';

export default function {p_id}Page() {{
    return (
        <div style={{{{ padding: '2rem', fontFamily: 'sans-serif' }}}}>
            <h1>{p_name}</h1>
            <p style={{{{ color: '#666' }}}}>Route: <code>{p_route}</code> (Access: <strong>{access}</strong>)</p>
            
            <div style={{{{ marginTop: '2rem' }}}}>
                <h3>Page Components:</h3>
{comps_html}
            </div>
        </div>
    );
}}
"""
            zip_file.writestr(f"views/{p_id}.jsx", jsx_content)
            
    zip_buffer.seek(0)
    
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={
            "Content-Disposition": f"attachment; filename={app_name_safe}.zip"
        }
    )


# ──────────────────────────────────────────────────────────────
# Evaluation Harness
# ──────────────────────────────────────────────────────────────
_eval_running = False
_eval_results = None


@app.post("/api/eval/run")
async def run_eval(request: EvalRunRequest, background_tasks: BackgroundTasks):
    """Start the evaluation harness in the background."""
    global _eval_running
    if _eval_running:
        raise HTTPException(status_code=409, detail="Evaluation already running")

    async def _run():
        global _eval_running, _eval_results
        _eval_running = True
        try:
            from app.eval.harness import run_all
            _eval_results = await run_all(
                mode=request.mode or "balanced",
                delay_between=request.delay_between or 2.0,
            )
        finally:
            _eval_running = False

    background_tasks.add_task(_run)
    return {"status": "started", "message": "Evaluation harness running in background. Check /api/eval/results for updates."}


@app.get("/api/eval/results")
async def get_eval_results():
    """Get the latest evaluation results."""
    results_path = Path(__file__).parent / "eval" / "results" / "latest.json"
    if results_path.exists():
        return json.loads(results_path.read_text())
    elif _eval_results:
        return _eval_results
    else:
        raise HTTPException(status_code=404, detail="No evaluation results yet. Run /api/eval/run first.")


@app.get("/api/eval/status")
async def eval_status():
    return {"running": _eval_running}


# ──────────────────────────────────────────────────────────────
# Health Check
# ──────────────────────────────────────────────────────────────
@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "service": "nl2app-compiler",
        "version": "1.0.0",
        "gemini_model": settings.gemini_model,
        "pipeline_mode": settings.pipeline_mode,
    }


@app.get("/")
async def root():
    return {
        "message": "NL2App Compiler API",
        "docs": "/docs",
        "health": "/api/health",
    }
