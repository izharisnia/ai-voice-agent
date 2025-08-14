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
import os
import requests
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

def generate_tts(text, language_code):
    api_key = os.getenv("MURF_API_KEY")
    if not api_key:
        raise Exception("MURF_API_KEY not set in environment")

    print(f"[DEBUG] Generating TTS: text='{text}', lang='{language_code}', api_key_present={bool(api_key)}")

    url = "https://api.murf.ai/v1/speech/generate"
    headers = {
        "api-key": api_key,
        "Content-Type": "application/json"
    }
    payload = {
        "voiceId": "en-UK-juliet",
        "text": text
    }

    resp = requests.post(url, headers=headers, json=payload, timeout=30)
    print(f"[DEBUG] Murf API status: {resp.status_code}, body: {resp.text}")

    if resp.status_code != 200:
        raise Exception(f"Murf API error: {resp.text}")

    data = resp.json()
    return data.get("audioFile")


def query_gemini(prompt: str) -> dict:
    """
    Prefer flash (faster) model first, fallback to pro if needed.
    Returns: { "text": "...", "model_used": "models/..." }
    """
    # prefer a low-latency model first
    candidates = ["models/gemini-1.5-flash", "models/gemini-1.5-pro-latest"]
    last_err = None

    for model_name in candidates:
        try:
            model = genai.GenerativeModel(model_name)
            # generate_content(prompt) worked for you previously — keep same call
            response = model.generate_content(prompt)
            text = response.text.strip() if hasattr(response, "text") else ""
            return {"text": text, "model_used": model_name}
        except Exception as e:
            last_err = e
            # If quota / 429 try next model
            msg = str(e)
            if "429" in msg or "quota" in msg.lower():
                print(f"[WARN] Quota/429 for {model_name}, trying fallback model...")
                continue
            else:
                # for other errors raise with context
                raise RuntimeError(f"Gemini API Error with {model_name}: {e}")

    # all failed
    raise RuntimeError(f"All Gemini models failed: {last_err}")
