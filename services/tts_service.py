import logging
from typing import Optional
from utils import murf_generate_audio, gtts_generate_audio

logger = logging.getLogger("tts_service")

def generate_tts_from_text(text: str, language_code: str = "en", murf_key: Optional[str] = None) -> str:
    """
    Generate TTS audio URL. Automatically uses free gTTS if Murf key is omitted or invalid.
    """
    try:
        return murf_generate_audio(text, voice_id="en-UK-juliet", murf_key=murf_key)
    except Exception:
        logger.exception("TTS generation error. Using gTTS fallback.")
        return gtts_generate_audio(text, language_code=language_code)
