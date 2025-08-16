import os
import requests

def generate_tts(text: str, language_code: str) -> str:
    """
    Call Murf API for TTS
    """
    api_key = os.getenv("MURF_API_KEY")
    if not api_key:
        raise Exception("MURF_API_KEY not set in environment")

    url = "https://api.murf.ai/v1/speech/generate"
    headers = {"api-key": api_key, "Content-Type": "application/json"}
    payload = {
        "voiceId": "en-UK-juliet",
        "text": text
    }

    resp = requests.post(url, headers=headers, json=payload, timeout=30)
    if resp.status_code != 200:
        raise Exception(f"Murf API error: {resp.text}")

    return resp.json().get("audioFile")