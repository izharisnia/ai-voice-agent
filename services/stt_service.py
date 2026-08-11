import io
import logging
from typing import Optional
import assemblyai as aai
import speech_recognition as sr
from pydub import AudioSegment

from utils import resolve_api_key

logger = logging.getLogger("stt_service")

def free_stt_transcribe(audio_bytes: bytes) -> str:
    """
    100% Free Speech-to-Text fallback using Google's free speech recognition engine via SpeechRecognition.
    Requires 0 API keys.
    """
    recognizer = sr.Recognizer()
    try:
        sound = AudioSegment.from_file(io.BytesIO(audio_bytes))
        wav_io = io.BytesIO()
        sound.export(wav_io, format="wav")
        wav_io.seek(0)

        with sr.AudioFile(wav_io) as source:
            audio_data = recognizer.record(source)
            return recognizer.recognize_google(audio_data)
    except Exception as e:
        logger.warning(f"Free SpeechRecognition fallback error: {e}")
        return ""

def transcribe_bytes(audio_bytes: bytes, assembly_key: Optional[str] = None) -> str:
    """
    Transcribe raw audio bytes. Uses AssemblyAI if key provided, otherwise falls back to free SpeechRecognition.
    """
    key = resolve_api_key("ASSEMBLYAI_API_KEY", assembly_key)
    if key and not key.startswith("your_"):
        try:
            aai.settings.api_key = key
            transcriber = aai.Transcriber()
            res = transcriber.transcribe(audio_bytes)
            text = getattr(res, "text", "") or ""
            if text:
                return text
        except Exception as e:
            logger.warning(f"AssemblyAI transcription failed ({e}). Trying free STT fallback...")

    logger.info("Using 100% free SpeechRecognition engine for transcription.")
    return free_stt_transcribe(audio_bytes)
