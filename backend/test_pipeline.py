import asyncio
import sys
import logging
from app.pipeline.orchestrator import run_pipeline

# Configure basic logging to console
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")

async def test():
    prompt = "Build a task manager with user login, tasks with titles, descriptions, and statuses, and role-based access control where managers can assign tasks to developers."
    print("Starting pipeline test...")
    try:
        result = await run_pipeline(prompt, mode="balanced")
        print("\n--- TEST SUCCESS ---")
        print(f"App Name: {result['app_name']}")
        print(f"Entities: {result['intent']['entities']}")
        print(f"Pages: {[p['name'] for p in result['design']['pages']]}")
        print(f"Tables: {[t['name'] for t in result['schemas']['db']['tables']]}")
        print(f"Endpoints: {[ep['path'] for ep in result['schemas']['api']['endpoints']]}")
        print(f"Runtime Proof Success: {result['metrics']['runtime']['overall_executable']}")
        print(f"DB Simulation Result: {result['runtime_proof']['db']}")
        print(f"API Simulation Result: {result['runtime_proof']['api']}")
        print(f"UI Simulation Result: {result['runtime_proof']['ui']}")
        print(f"Cost Estimate: ${result['metrics']['cost_estimate_usd']}")
        print(f"Total Duration: {result['metrics']['total_duration_ms']} ms")
    except Exception as e:
        print(f"\n--- TEST FAILED ---")
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test())
