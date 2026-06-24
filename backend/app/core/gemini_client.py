"""
Gemini API client wrapper with:
- JSON mode (response_mime_type = application/json)
- temperature=0 for determinism
- Exponential backoff on rate limit / transient errors
- Token usage tracking for cost estimation
"""
import json
import time
import asyncio
import logging
from typing import Any, Optional
import google.generativeai as genai
from app.core.config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()
genai.configure(api_key=settings.gemini_api_key)


def _extract_first_json(text: str) -> dict:
    """
    Robustly extract the first valid JSON object or array from a string.
    Handles the 'Extra data' case where Gemini emits two JSON objects back-to-back.
    Strategy: find the first '{' or '[', then walk the string counting braces until balanced.
    """
    text = text.strip()
    # Fast path: standard json.loads works
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        if "Extra data" not in str(e) and "Trailing" not in str(e):
            raise  # re-raise non-truncation errors

    # Find the opening bracket
    start = -1
    opener, closer = '{', '}'
    for i, ch in enumerate(text):
        if ch in ('{', '['):
            start = i
            opener = ch
            closer = '}' if ch == '{' else ']'
            break

    if start == -1:
        raise json.JSONDecodeError("No JSON object found", text, 0)

    # Walk forward counting open/close brackets (respecting strings)
    depth = 0
    in_string = False
    escape_next = False
    for i in range(start, len(text)):
        ch = text[i]
        if escape_next:
            escape_next = False
            continue
        if ch == '\\' and in_string:
            escape_next = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == opener:
            depth += 1
        elif ch == closer:
            depth -= 1
            if depth == 0:
                # Found the end of the first complete JSON object
                candidate = text[start:i + 1]
                return json.loads(candidate)

    raise json.JSONDecodeError("Unterminated JSON object", text, len(text))


def _parse_retry_delay(error_message: str, default: float = 4.0) -> float:
    """
    Parse the retry delay (in seconds) from a 429 error message.
    Gemini 429 errors contain: 'retry_delay { seconds: 17 }' or 'Please retry in 17.1s'
    Falls back to `default` if not found.
    """
    import re
    # Pattern: "seconds: 17" inside retry_delay block
    m = re.search(r'retry_delay\s*\{[^}]*seconds:\s*(\d+)', error_message)
    if m:
        return float(m.group(1)) + 2.0  # add 2s buffer

    # Pattern: "Please retry in 17.1s"
    m = re.search(r'retry in\s*([\d.]+)s', error_message, re.IGNORECASE)
    if m:
        return float(m.group(1)) + 2.0

    return default



class GeminiCallResult:
    def __init__(
        self,
        content: dict,
        input_tokens: int,
        output_tokens: int,
        duration_ms: float,
        attempts: int,
    ):
        self.content = content
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens
        self.duration_ms = duration_ms
        self.attempts = attempts
        self.cost_estimate_usd = (input_tokens * 0.075 + output_tokens * 0.30) / 1_000_000

    def to_dict(self):
        return {
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "cost_estimate_usd": round(self.cost_estimate_usd, 6),
            "duration_ms": round(self.duration_ms, 1),
            "attempts": self.attempts,
        }


class GeminiClient:
    """
    Wraps google-generativeai with:
    - JSON mode enforced on every call
    - temperature=0 for determinism
    - Exponential backoff (max 3 retries by default)
    - Returns structured GeminiCallResult for token tracking
    """

    def __init__(self, temperature: float = 0.0):
        self.model = genai.GenerativeModel(
            model_name=settings.gemini_model,
            generation_config=genai.GenerationConfig(
                temperature=temperature,
                response_mime_type="application/json",
            ),
        )

    async def call(
        self,
        system_prompt: str,
        user_prompt: str,
        max_retries: int = 3,
        backoff_base: float = 2.0,
    ) -> GeminiCallResult:
        """
        Makes a Gemini API call with retry/backoff.
        Always returns valid JSON dict or raises after max_retries.
        """
        start_time = time.time()
        last_error = None

        for attempt in range(1, max_retries + 1):
            try:
                full_prompt = f"{system_prompt}\n\n{user_prompt}"
                response = await asyncio.to_thread(
                    self.model.generate_content, full_prompt
                )

                raw_text = response.text.strip()

                # Strip markdown code fences if present
                if raw_text.startswith("```"):
                    raw_text = raw_text.split("```")[1]
                    if raw_text.startswith("json"):
                        raw_text = raw_text[4:]

                # Robust JSON extraction:
                # Sometimes Gemini emits two JSON objects back-to-back ("Extra data" error).
                # We extract only the first complete JSON object/array.
                parsed = _extract_first_json(raw_text)

                duration_ms = (time.time() - start_time) * 1000

                input_tokens = response.usage_metadata.prompt_token_count or 0
                output_tokens = response.usage_metadata.candidates_token_count or 0

                logger.info(
                    f"Gemini call OK | attempt={attempt} | "
                    f"tokens={input_tokens}+{output_tokens} | {duration_ms:.0f}ms"
                )

                return GeminiCallResult(
                    content=parsed,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    duration_ms=duration_ms,
                    attempts=attempt,
                )

            except json.JSONDecodeError as e:
                last_error = f"JSON parse failed: {e} | raw={raw_text[:200]}"
                logger.warning(f"Attempt {attempt}: {last_error}")
                # Small wait before retry on parse failure
                await asyncio.sleep(1.0)
            except Exception as e:
                last_error = str(e)
                logger.warning(f"Attempt {attempt}: Gemini error: {e}")
                if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e):
                    # Parse the retry_delay seconds from the error message if present
                    wait = _parse_retry_delay(str(e), default=backoff_base ** attempt)
                    logger.info(f"Rate limit — waiting {wait:.1f}s before retry")
                    await asyncio.sleep(wait)
                elif "500" in str(e) or "503" in str(e):
                    await asyncio.sleep(1.5 * attempt)

        raise RuntimeError(
            f"Gemini call failed after {max_retries} attempts. Last error: {last_error}"
        )


# Singleton instances (one per temperature level)
_clients: dict[float, GeminiClient] = {}


def get_client(temperature: float = 0.0) -> GeminiClient:
    if temperature not in _clients:
        _clients[temperature] = GeminiClient(temperature=temperature)
    return _clients[temperature]
