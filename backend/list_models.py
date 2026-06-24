import google.generativeai as genai
from app.core.config import get_settings

settings = get_settings()
print(f"API Key: {settings.gemini_api_key[:10]}...")
genai.configure(api_key=settings.gemini_api_key)

try:
    for m in genai.list_models():
        print(f"Name: {m.name}, Supported Methods: {m.supported_generation_methods}")
except Exception as e:
    print(f"Error: {e}")
