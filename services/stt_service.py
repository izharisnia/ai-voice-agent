# services/stt_service.py
"""
AssemblyAI wrapper. This file assumes you have ASSEMBLYAI_API_KEY in .env.
The assemblyai SDK usage can vary; below is a simple HTTP fallback using their REST API
if you prefer not to use the SDK. For simplicity we will use the (synchronous) SDK-like call.
"""

import os
import logging
from dotenv import load_dotenv
import assemblyai as aai

load_dotenv()
logger = logging.getLogger("stt_service")

ASSEMBLY_KEY = os.getenv("ASSEMBLYAI_API_KEY")
if ASSEMBLY_KEY:
    aai.settings.api_key = ASSEMBLY_KEY
    transcriber = aai.Transcriber()
else:
    transcriber = None

def transcribe_bytes(audio_bytes: bytes) -> str:
    """
    Transcribe bytes. Using assemblyai Transcriber (synchronous style provided by sdk).
    If you are using an async SDK, adapt accordingly.
    """
    if not transcriber:
        raise RuntimeError("ASSEMBLYAI_API_KEY not configured")

    # SDK may accept raw bytes; if not, save and pass path (we saved earlier in main.py)
    try:
        res = transcriber.transcribe(audio_bytes)
        return getattr(res, "text", "") or ""
    except Exception as e:
        logger.exception("Transcription failed")
        raise
