import os
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

def query_gemini(prompt: str) -> str:
    """
    Query Gemini (prefer flash first, fallback to pro)
    """
    candidates = ["models/gemini-1.5-flash", "models/gemini-1.5-pro-latest"]

    for model_name in candidates:
        try:
            model = genai.GenerativeModel(model_name)
            response = model.generate_content(prompt)
            return response.text.strip()
        except Exception as e:
            if "429" in str(e) or "quota" in str(e).lower():
                print(f"[WARN] Quota issue for {model_name}, trying fallback...")
                continue
            raise RuntimeError(f"Gemini Error ({model_name}): {e}")

    raise RuntimeError("All Gemini models failed.")