from pydantic import BaseModel
from typing import List, Optional, Dict

class TTSRequest(BaseModel):
    text: str
    language_code: str = "en"

class TTSResponse(BaseModel):
    message: str
    audio_url: str

class ChatResponse(BaseModel):
    transcript: str
    llm_response: str
    audio_url: Optional[str] = ""
    history: List[Dict[str, str]]

class ClearResponse(BaseModel):
    cleared: bool
    session: str
