"""
Core configuration — loaded once at startup from .env
"""
from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    gemini_api_key: str
    gemini_model: str = "gemini-1.5-flash"
    pipeline_mode: str = "balanced"   # fast | balanced | thorough
    max_repair_retries: int = 3
    log_level: str = "INFO"
    frontend_url: str = "http://localhost:5173"

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


# Pipeline mode configurations
PIPELINE_MODES = {
    "fast": {
        "temperature": 0.2,
        "schema_calls": "combined",   # 1 LLM call for all 4 schemas
        "max_retries": 1,
    },
    "balanced": {
        "temperature": 0.0,
        "schema_calls": "separate",   # 4 separate constrained calls
        "max_retries": 3,
    },
    "thorough": {
        "temperature": 0.0,
        "schema_calls": "separate",
        "max_retries": 5,
    },
}
