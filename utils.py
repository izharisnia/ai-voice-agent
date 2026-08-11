import os
import requests
import logging
import uuid
from typing import Optional
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger("utils")

def resolve_api_key(env_var_name: str, dynamic_key: Optional[str] = None) -> str:
    """
    Returns dynamic API key if present, otherwise falls back to environment variables.
    """
    if dynamic_key and dynamic_key.strip():
        return dynamic_key.strip()
    return os.getenv(env_var_name, "") or ""

def gtts_generate_audio(text: str, language_code: str = "en") -> str:
    """
    Generates TTS audio using gTTS (Google Text-to-Speech).
    100% Free, 0 API keys required.
    Saves generated MP3 file to static/audio/.
    """
    from gtts import gTTS
    
    os.makedirs("static/audio", exist_ok=True)
    filename = f"tts_{uuid.uuid4().hex}.mp3"
    filepath = os.path.join("static", "audio", filename)
    
    clean_lang = language_code.split("-")[0] if language_code else "en"
    tts = gTTS(text=text, lang=clean_lang, slow=False)
    tts.save(filepath)
    return f"/static/audio/{filename}"

def murf_generate_audio(text: str, voice_id: str = "en-UK-juliet", murf_key: Optional[str] = None) -> str:
    """
    Generates TTS audio via Murf AI REST API if key available, otherwise falls back to gTTS.
    """
    key = resolve_api_key("MURF_API_KEY", murf_key)
    if not key or key.startswith("your_"):
        logger.info("Murf API key missing. Using gTTS free fallback.")
        return gtts_generate_audio(text)

    try:
        url = "https://api.murf.ai/v1/speech/generate"
        payload = {"voiceId": voice_id, "text": text}
        headers = {"api-key": key, "Content-Type": "application/json"}
        resp = requests.post(url, json=payload, headers=headers, timeout=10)
        resp.raise_for_status()
        body = resp.json()
        audio_url = body.get("audioFile") or body.get("audio_url") or body.get("url")
        if audio_url:
            return audio_url
    except Exception as e:
        logger.warning(f"Murf API failed ({e}). Falling back to gTTS free audio.")

    return gtts_generate_audio(text)
