from pydantic import BaseModel
from typing import List, Optional

class TTSRequest(BaseModel):
    text: str
    language_code: str

class TTSResponse(BaseModel):
    message: str
    audio_url: str

class ChatResponse(BaseModel):
    transcript: str
    llm_response: str
    audio_url: Optional[str]
    history: List[dict]