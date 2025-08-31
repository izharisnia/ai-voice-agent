# import os
# import requests
# import google.generativeai as genai
# from dotenv import load_dotenv

# load_dotenv()

# # Configure Gemini API
# genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

# def generate_tts(text, language_code):
#     api_key = os.getenv("MURF_API_KEY")
#     if not api_key:
#         raise Exception("MURF_API_KEY not set in environment")

#     print(f"[DEBUG] Generating TTS: text='{text}', lang='{language_code}', api_key_present={bool(api_key)}")

#     url = "https://api.murf.ai/v1/speech/generate"
#     headers = {
#         "api-key": api_key,
#         "Content-Type": "application/json"
#     }
#     payload = {
#         "voiceId": "en-UK-juliet",
#         "text": text
#     }

#     resp = requests.post(url, headers=headers, json=payload)
#     print(f"[DEBUG] Murf API status: {resp.status_code}, body: {resp.text}")

#     if resp.status_code != 200:
#         raise Exception(f"Murf API error: {resp.text}")

#     data = resp.json()
#     return data.get("audioFile")

# def query_gemini(prompt: str) -> dict:
#     """
#     Send a prompt to Gemini API.
#     Tries pro model first, falls back to flash if quota exceeded.
#     Returns both text and model used.
#     """
#     models_to_try = ["models/gemini-1.5-pro-latest", "models/gemini-1.5-flash"]
    
#     for model_name in models_to_try:
#         try:
#             model = genai.GenerativeModel(model_name)
#             response = model.generate_content(prompt)
#             return {
#                 "text": response.text.strip() if hasattr(response, "text") else "",
#                 "model_used": model_name
#             }
#         except Exception as e:
#             if "429" in str(e):  # quota exceeded
#                 print(f"[WARN] Quota exceeded for {model_name}, trying fallback model...")
#                 continue
#             else:
#                 raise RuntimeError(f"Gemini API Error with {model_name}: {str(e)}")
    
#     raise RuntimeError("All Gemini models failed due to quota limits or errors.")

# utils.py — Persona-aware Gemini + Skills (Weather + Web Search) + TTS
# utils.py
import os
import requests
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()
GEMINI_KEY = os.getenv("GEMINI_API_KEY")
MURF_KEY = os.getenv("MURF_API_KEY")
NEWS_API_KEY = os.getenv("NEWS_API_KEY", "")

if GEMINI_KEY:
    genai.configure(api_key=GEMINI_KEY)

# Murf TTS wrapper - returns public audio URL (or path) depending on Murf response
def murf_generate_audio(text: str, voice_id: str = "en-UK-juliet"):
    if not MURF_KEY:
        raise RuntimeError("MURF_API_KEY not set in environment")

    url = "https://api.murf.ai/v1/speech/generate"
    payload = {"voiceId": voice_id, "text": text}
    headers = {"api-key": MURF_KEY, "Content-Type": "application/json"}
    resp = requests.post(url, json=payload, headers=headers, timeout=30)
    resp.raise_for_status()
    body = resp.json()
    # Murf's API returns 'audioFile' or similar — adapt if yours differs
    return body.get("audioFile") or body.get("audio_url") or body.get("url")

# Gemini wrapper (synchronous, simple)
def gemini_generate_text(prompt: str, model: str = "models/gemini-1.5-flash"):
    if not GEMINI_KEY:
        raise RuntimeError("GEMINI_API_KEY not set in environment")
    model_obj = genai.GenerativeModel(model)
    res = model_obj.generate_content(prompt)
    text = getattr(res, "text", "") or ""
    return text.strip()

# For function-calling style detection, you can use a simple heuristic:
def gemini_detect_call(prompt: str):
    """
    Basic heuristic: if prompt contains 'weather in' or 'news' request -> return a call dict.
    For production integrate real function-calling from Gemini (if available).
    """
    lower = prompt.lower()
    if "weather in" in lower or "what's the weather" in lower or "weather for" in lower:
        # extract city naive
        import re
        m = re.search(r"weather (?:in|for)?\s*([A-Za-z\s]+)", lower)
        city = m.group(1).strip() if m else "your location"
        return {"name": "get_weather", "args": {"city": city}}
    if "news" in lower and ("today" in lower or "latest" in lower or "headlines" in lower):
        return {"name": "get_news", "args": {}}
    return None


# import os
# import requests
# import google.generativeai as genai
# from dotenv import load_dotenv

# load_dotenv()
# genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

# def generate_tts(text, language_code):
#     api_key = os.getenv("MURF_API_KEY")
#     if not api_key:
#         raise Exception("MURF_API_KEY not set in environment")

#     print(f"[DEBUG] Generating TTS: text='{text}', lang='{language_code}', api_key_present={bool(api_key)}")

#     url = "https://api.murf.ai/v1/speech/generate"
#     headers = {
#         "api-key": api_key,
#         "Content-Type": "application/json"
#     }
#     payload = {
#         "voiceId": "en-UK-juliet",
#         "text": text
#     }

#     resp = requests.post(url, headers=headers, json=payload, timeout=30)
#     print(f"[DEBUG] Murf API status: {resp.status_code}, body: {resp.text}")

#     if resp.status_code != 200:
#         raise Exception(f"Murf API error: {resp.text}")

#     data = resp.json()
#     return data.get("audioFile")


# def query_gemini(prompt: str) -> dict:
#     """
#     Prefer flash (faster) model first, fallback to pro if needed.
#     Returns: { "text": "...", "model_used": "models/..." }
#     """
#     # prefer a low-latency model first
#     candidates = ["models/gemini-1.5-flash", "models/gemini-1.5-pro-latest"]
#     last_err = None

#     for model_name in candidates:
#         try:
#             model = genai.GenerativeModel(model_name)
#             # generate_content(prompt) worked for you previously — keep same call
#             response = model.generate_content(prompt)
#             text = response.text.strip() if hasattr(response, "text") else ""
#             return {"text": text, "model_used": model_name}
#         except Exception as e:
#             last_err = e
#             # If quota / 429 try next model
#             msg = str(e)
#             if "429" in msg or "quota" in msg.lower():
#                 print(f"[WARN] Quota/429 for {model_name}, trying fallback model...")
#                 continue
#             else:
#                 # for other errors raise with context
#                 raise RuntimeError(f"Gemini API Error with {model_name}: {e}")

#     # all failed
#     raise RuntimeError(f"All Gemini models failed: {last_err}")
