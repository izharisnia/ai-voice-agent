# services/tts_service.py
from utils import murf_generate_audio
import logging
logger = logging.getLogger("tts_service")

def generate_tts_from_text(text: str, language_code: str = "en"):
    # This returns a URL or path to audio
    try:
        audio_url = murf_generate_audio(text, voice_id="en-UK-juliet")
        return audio_url
    except Exception:
        logger.exception("Murf TTS failed")
        # graceful fallback: return empty string so client won't crash
        return ""
