# main.py — Electric Voice Agent Server
import os
import uuid
import logging
from typing import List, Dict, Any, Optional

from fastapi import (
    FastAPI, Request, UploadFile, File, Form, Header, HTTPException,
    WebSocket, WebSocketDisconnect, Query
)
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from dotenv import load_dotenv

# Local modules
from models.schemas import TTSRequest, TTSResponse, ChatResponse, ClearResponse
from services.stt_service import transcribe_bytes
from services.llm_service import call_llm_conversation
from services.tts_service import generate_tts_from_text
from db import init_db, save_message, get_history, clear_history, list_sessions

load_dotenv()

# Logging setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("voice-agent")

# Initialize database
init_db()

app = FastAPI(title="Electric Voice Agent")

# Static files & templates setup
os.makedirs("static", exist_ok=True)
os.makedirs("uploads", exist_ok=True)
os.makedirs("transcripts", exist_ok=True)

app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/transcripts", StaticFiles(directory="transcripts"), name="transcripts")

templates = Jinja2Templates(directory="templates")


# Helper to extract custom API keys from HTTP Headers
def extract_keys_from_headers(
    x_assemblyai_key: Optional[str] = Header(None),
    x_gemini_key: Optional[str] = Header(None),
    x_murf_key: Optional[str] = Header(None),
    x_news_key: Optional[str] = Header(None),
) -> Dict[str, Optional[str]]:
    return {
        "assembly": x_assemblyai_key,
        "gemini": x_gemini_key,
        "murf": x_murf_key,
        "news": x_news_key,
    }


# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.connections: List[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.connections.append(ws)

    def disconnect(self, ws: WebSocket):
        if ws in self.connections:
            self.connections.remove(ws)

    async def send_json(self, data: Dict[str, Any], ws: WebSocket):
        await ws.send_json(data)


manager = ConnectionManager()


# ---------- HTTP Routes ----------

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/health")
async def health():
    return {"status": "ok", "db": "connected"}


@app.post("/generate-tts", response_model=TTSResponse)
async def generate_tts_route(
    text: str = Form(...),
    language_code: str = Form("en"),
    x_murf_key: Optional[str] = Header(None)
):
    try:
        audio_url = generate_tts_from_text(text, language_code=language_code, murf_key=x_murf_key)
        return {"message": "TTS successful", "audio_url": audio_url}
    except Exception as e:
        logger.exception("TTS endpoint failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/agent/chat/{session_id}", response_model=ChatResponse)
async def agent_chat(
    session_id: str,
    file: UploadFile = File(...),
    x_assemblyai_key: Optional[str] = Header(None),
    x_gemini_key: Optional[str] = Header(None),
    x_murf_key: Optional[str] = Header(None),
    x_news_key: Optional[str] = Header(None),
):
    """
    Main HTTP Voice Pipeline:
    1. Receive uploaded audio
    2. Transcribe via AssemblyAI (dynamic client key fallback)
    3. Save user turn to SQLite DB
    4. Call Gemini LLM with Native Tools & full DB history
    5. Save assistant reply to SQLite DB
    6. Generate TTS via Murf AI
    7. Return transcript, reply, audio URL, and persistent history
    """
    try:
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Empty audio file received")

        # Save audio file to uploads directory
        safe_fn = f"{uuid.uuid4().hex}_{file.filename}"
        upload_path = os.path.join("uploads", safe_fn)
        with open(upload_path, "wb") as fh:
            fh.write(content)

        # 1. Transcribe audio
        transcript_text = transcribe_bytes(content, assembly_key=x_assemblyai_key)
        if not transcript_text or not transcript_text.strip():
            raise HTTPException(status_code=400, detail="No speech detected in audio recording.")

        # 2. Save user message in SQLite DB
        save_message(session_id, "user", transcript_text)

        # 3. Retrieve persistent history from SQLite DB
        history = get_history(session_id)

        # 4. Call Gemini LLM with Native Function Calling tools
        llm_result = call_llm_conversation(
            history=history,
            gemini_key=x_gemini_key,
            news_key=x_news_key
        )
        assistant_reply = llm_result.get("text", "I'm sorry, I couldn't process that.")

        # 5. Save assistant message in SQLite DB
        save_message(session_id, "assistant", assistant_reply)

        # Updated history after turn
        updated_history = get_history(session_id)

        # 6. Generate TTS Audio
        audio_url = generate_tts_from_text(
            text=assistant_reply[:3000],
            language_code="en",
            murf_key=x_murf_key
        )

        return {
            "transcript": transcript_text,
            "llm_response": assistant_reply,
            "audio_url": audio_url,
            "history": updated_history
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("agent_chat error")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/agent/history/{session_id}")
async def get_session_history_route(session_id: str):
    """Retrieve persistent history for a session from SQLite DB."""
    return {"session_id": session_id, "history": get_history(session_id)}


@app.post("/agent/clear/{session_id}")
async def clear_session_route(session_id: str):
    """Clear chat history in SQLite DB for a session."""
    clear_history(session_id)
    return {"cleared": True, "session": session_id}


@app.post("/transcribe/file")
async def transcribe_file_route(
    file: UploadFile = File(...),
    x_assemblyai_key: Optional[str] = Header(None)
):
    try:
        data = await file.read()
        text = transcribe_bytes(data, assembly_key=x_assemblyai_key)
        
        fname = f"{uuid.uuid4().hex}_{file.filename}.txt"
        filepath = os.path.join("transcripts", fname)
        with open(filepath, "w", encoding="utf-8") as fh:
            fh.write(text)
            
        return {"transcript": text, "download_url": f"/transcripts/{fname}"}
    except Exception as e:
        logger.exception("transcribe_file route failed")
        raise HTTPException(status_code=500, detail=str(e))


# ---------- WebSocket Audio Streaming Endpoint ----------

@app.websocket("/ws/stream-audio")
async def websocket_stream_audio(
    ws: WebSocket,
    session: str = Query(...),
    assembly_key: Optional[str] = Query(None),
    gemini_key: Optional[str] = Query(None),
    murf_key: Optional[str] = Query(None),
    news_key: Optional[str] = Query(None)
):
    """
    WebSocket Real-Time Audio Streaming Pipeline:
    - Client connects and streams binary audio chunks (e.g., 250ms chunks).
    - Server buffers binary audio in memory.
    - When client sends string message '{"event":"stop"}' or closes stream:
      - Server transcribes buffered audio
      - Saves user turn to SQLite DB
      - Queries Gemini with Native Tools
      - Saves assistant turn to SQLite DB
      - Generates TTS audio
      - Sends JSON response back over WebSocket connection
    """
    await manager.connect(ws)
    logger.info(f"WebSocket client connected for session {session}")
    audio_buffer = bytearray()

    try:
        await manager.send_json({"event": "connected", "session": session}, ws)

        while True:
            # Receive either binary audio chunk or JSON control message
            message = await ws.receive()

            if "bytes" in message and message["bytes"]:
                audio_buffer.extend(message["bytes"])
                # Send minor ACK back to client if needed
                await manager.send_json({"event": "chunk_received", "bytes_total": len(audio_buffer)}, ws)

            elif "text" in message and message["text"]:
                text_data = message["text"].strip()
                if text_data == '{"event":"stop"}' or text_data == "stop":
                    # Process accumulated audio stream
                    if not audio_buffer:
                        await manager.send_json({"event": "error", "message": "No audio buffer received"}, ws)
                        continue

                    # 1. Status: Transcribing
                    await manager.send_json({"event": "status", "status": "transcribing"}, ws)
                    try:
                        transcript_text = transcribe_bytes(bytes(audio_buffer), assembly_key=assembly_key)
                    except Exception as stt_err:
                        await manager.send_json({"event": "error", "message": f"Transcription failed: {str(stt_err)}"}, ws)
                        audio_buffer.clear()
                        continue

                    if not transcript_text or not transcript_text.strip():
                        await manager.send_json({"event": "error", "message": "No speech detected in audio stream."}, ws)
                        audio_buffer.clear()
                        continue

                    # 2. Save user turn to SQLite
                    save_message(session, "user", transcript_text)

                    # 3. Status: Thinking (LLM with Native Tools)
                    await manager.send_json({"event": "status", "status": "thinking", "transcript": transcript_text}, ws)
                    history = get_history(session)
                    llm_result = call_llm_conversation(history=history, gemini_key=gemini_key, news_key=news_key)
                    assistant_reply = llm_result.get("text", "I'm sorry, I couldn't process that.")

                    # 4. Save assistant turn to SQLite
                    save_message(session, "assistant", assistant_reply)
                    updated_history = get_history(session)

                    # 5. Status: Generating TTS
                    await manager.send_json({"event": "status", "status": "generating_speech"}, ws)
                    audio_url = generate_tts_from_text(text=assistant_reply[:3000], language_code="en", murf_key=murf_key)

                    # 6. Send final response payload over WebSocket
                    await manager.send_json({
                        "event": "response",
                        "transcript": transcript_text,
                        "llm_response": assistant_reply,
                        "audio_url": audio_url,
                        "history": updated_history
                    }, ws)

                    # Clear buffer for next turn
                    audio_buffer.clear()

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for session {session}")
        manager.disconnect(ws)
    except Exception as e:
        logger.exception("WebSocket stream error")
        try:
            await manager.send_json({"event": "error", "message": str(e)}, ws)
        except Exception:
            pass
        manager.disconnect(ws)
