# # main.py  — HTTP API + WebSocket echo (/ws)

# from fastapi import (
#     FastAPI, HTTPException, UploadFile, File, Form, Request,
#     WebSocket, WebSocketDisconnect
# )
# from fastapi.responses import HTMLResponse, FileResponse
# from fastapi.staticfiles import StaticFiles
# from fastapi.templating import Jinja2Templates
# from dotenv import load_dotenv
# import os
# import json
# import assemblyai as aai
# from uuid import uuid4
# from typing import List

# import wave

# # === Your utility functions (as in your project) ===
# from utils import generate_tts, query_gemini

# # ------------------ Setup ------------------
# load_dotenv()

# # AssemblyAI
# aai.settings.api_key = os.getenv("ASSEMBLYAI_API_KEY")
# transcriber = aai.Transcriber()

# # FastAPI app
# app = FastAPI()
# app.mount("/static", StaticFiles(directory="static"), name="static")
# templates = Jinja2Templates(directory="templates")

# # In-memory chat history { session_id: [ {role, content}, ... ] }
# chat_histories = {}

# # ------------------ WebSocket manager ------------------
# class ConnectionManager:
#     """
#     Tiny helper to track active WebSocket connections.
#     For Day 15 we only need echo back to the same socket,
#     but this lets you broadcast later if you want.
#     """
#     def __init__(self):
#         self.active_connections: List[WebSocket] = []

#     async def connect(self, websocket: WebSocket):
#         await websocket.accept()
#         self.active_connections.append(websocket)

#     def disconnect(self, websocket: WebSocket):
#         if websocket in self.active_connections:
#             self.active_connections.remove(websocket)

#     async def send_personal(self, message: str, websocket: WebSocket):
#         await websocket.send_text(message)

#     async def broadcast(self, message: str):
#         # Optional utility (not used in the echo flow)
#         for ws in list(self.active_connections):
#             try:
#                 await ws.send_text(message)
#             except Exception:
#                 self.disconnect(ws)

# manager = ConnectionManager()

# # ------------------ Routes (existing) ------------------

# @app.get("/", response_class=HTMLResponse)
# async def home(request: Request):
#     """Serve the main HTML page."""
#     return templates.TemplateResponse("index.html", {"request": request})


# @app.post("/generate-tts")
# async def generate_tts_route(text: str = Form(...), language_code: str = Form(...)):
#     """Generate TTS audio in selected language."""
#     try:
#         audio_url = generate_tts(text, language_code)
#         return {"message": "TTS generation successful", "audio_url": audio_url}
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=str(e))


# @app.post("/agent/chat/{session_id}")
# async def agent_chat(session_id: str, file: UploadFile = File(...)):
#     """Conversational pipeline — Audio → Transcription → LLM → TTS."""
#     try:
#         os.makedirs("uploads", exist_ok=True)
#         file_path = f"uploads/{file.filename}"
#         with open(file_path, "wb") as f:
#             f.write(await file.read())

#         # Transcribe audio
#         with open(file_path, "rb") as audio_file:
#             transcript = transcriber.transcribe(audio_file.read())

#         user_text = transcript.text.strip()
#         if not user_text:
#             raise HTTPException(status_code=400, detail="No speech detected.")

#         # Init session history
#         if session_id not in chat_histories:
#             chat_histories[session_id] = []

#         # Append user message
#         chat_histories[session_id].append({"role": "user", "content": user_text})

#         # Build conversation context
#         conversation_text = "\n".join(
#             [("User: " if m["role"] == "user" else "Assistant: ") + m["content"]
#              for m in chat_histories[session_id]]
#         )

#         # LLM response (Gemini via your utils)
#         try:
#             llm_result = query_gemini(conversation_text)
#             response_text = llm_result["text"] if isinstance(llm_result, dict) else str(llm_result)
#         except Exception as e:
#             print("[WARN] Gemini call failed:", e)
#             response_text = "I'm sorry, I couldn't process that request."

#         # Append assistant message
#         chat_histories[session_id].append({"role": "assistant", "content": response_text})

#         # TTS for assistant reply (cap length to 3k chars)
#         murf_audio_url = generate_tts(text=response_text[:3000], language_code="en")

#         return {
#             "transcript": user_text,
#             "llm_response": response_text,
#             "audio_url": murf_audio_url,
#             "history": chat_histories[session_id]
#         }

#     except Exception as e:
#         raise HTTPException(status_code=500, detail=str(e))


# @app.post("/agent/clear/{session_id}")
# async def clear_history(session_id: str):
#     """Clear chat history for a session."""
#     if session_id in chat_histories:
#         del chat_histories[session_id]
#     return {"message": f"Chat history for session {session_id} cleared."}


# @app.post("/transcribe/file")
# async def transcribe_file(file: UploadFile = File(...), language_code: str = Form("en")):
#     """Upload & transcribe a file."""
#     try:
#         audio_data = await file.read()
#         transcript = transcriber.transcribe(audio_data)

#         os.makedirs("transcripts", exist_ok=True)
#         transcript_path = f"transcripts/{file.filename}.txt"
#         with open(transcript_path, "w", encoding="utf-8") as f:
#             f.write(transcript.text)

#         return {
#             "transcript": transcript.text,
#             "download_url": f"/download-transcript/{file.filename}.txt"
#         }
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=str(e))


# @app.get("/download-transcript/{filename}")
# async def download_transcript(filename: str):
#     """Download transcript file."""
#     path = f"transcripts/{filename}"
#     if os.path.exists(path):
#         return FileResponse(path, media_type="text/plain", filename=filename)
#     raise HTTPException(status_code=404, detail="Transcript not found")


# # ------------------ NEW: WebSocket echo endpoint ------------------

# @app.websocket("/ws")
# async def websocket_endpoint(websocket: WebSocket):
#     """
#     Simple echo server over WebSocket.
#     Connect with ws://127.0.0.1:8000/ws (or your host).
#     Any text message you send will be echoed back.
#     """
#     await manager.connect(websocket)
#     try:
#         # Optional greeting
#         await manager.send_personal(
#             "✅ Connected to /ws. Send any message to get an echo.",
#             websocket
#         )

#         while True:
#             # Receive text; if you send JSON, we'll echo a JSON wrapper
#             text = await websocket.receive_text()

#             # Pretty echo JSON if possible
#             try:
#                 parsed = json.loads(text)
#                 echo_payload = json.dumps({"echo": parsed}, ensure_ascii=False)
#             except json.JSONDecodeError:
#                 echo_payload = f"echo: {text}"

#             await manager.send_personal(echo_payload, websocket)

#     except WebSocketDisconnect:
#         manager.disconnect(websocket)
#     except Exception:
#         # On any other error, ensure we cleanup
#         try:
#             await websocket.close()
#         finally:
#             manager.disconnect(websocket)
#         raise



# # ------------------ NEW: WebSocket streaming audio ------------------

# @app.websocket("/ws/stream-audio")
# async def websocket_audio(websocket: WebSocket):
#     """
#     Receives audio chunks from client via WebSocket and saves them to a file.
#     """
#     await websocket.accept()
#     os.makedirs("uploads", exist_ok=True)
#     file_path = f"uploads/streamed_{uuid4().hex}.wav"

#     # Setup WAV file (mono, 16-bit PCM, 44.1kHz)
#     wf = wave.open(file_path, "wb")
#     wf.setnchannels(1)
#     wf.setsampwidth(2)
#     wf.setframerate(44100)

#     try:
#         while True:
#             data = await websocket.receive_bytes()
#             wf.writeframes(data)
#     except WebSocketDisconnect:
#         print(f"[INFO] Client disconnected. File saved at {file_path}")
#     finally:
#         wf.close()

# # ------------------ NEW: WebSocket audio streaming ------------------

# @app.websocket("/ws/stream-audio")
# async def websocket_audio_stream(websocket: WebSocket):
#     """
#     Receives audio chunks from client and saves them into ONE reusable file.
#     """
#     await websocket.accept()

#     os.makedirs("uploads", exist_ok=True)
#     file_path = "uploads/streamed_audio.wav"  # fixed filename

#     # If file already exists, overwrite it
#     wf = wave.open(file_path, 'wb')
#     wf.setnchannels(1)           # Mono
#     wf.setsampwidth(2)           # 16-bit PCM
#     wf.setframerate(44100)       # Standard rate

#     print("[INFO] Streaming audio recording started...")

#     try:
#         while True:
#             data = await websocket.receive_bytes()
#             wf.writeframes(data)  # append new chunk
#     except WebSocketDisconnect:
#         print(f"[INFO] Client disconnected. File saved at {file_path}")
#         wf.close()
#     except Exception as e:
#         print("[ERROR] Streaming error:", e)
#         wf.close()
#         await websocket.close()



# main.py — Conversational agent + Settings + Skills + WebSocket echo + Stream-save
# main.py
"""
Final main app for Electric Voice Agent (Day 1..28)
- HTTP endpoints for TTS, chat (audio->transcribe->LLM->TTS)
- /agent/clear/{session_id}
- WebSocket echo (for Day 15) at /ws
- A small function-calling "skill" layer: get_weather(city), get_news()
"""

import os
import json
import uuid
import logging
from typing import List, Dict, Any, Optional

from fastapi import FastAPI, Request, UploadFile, File, Form, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from dotenv import load_dotenv

# local modules
from models.schemas import TTSRequest, TTSResponse, ChatResponse
from services.stt_service import transcribe_bytes
from services.llm_service import call_llm_conversation, llm_check_for_skill, invoke_skill_and_finalize
from services.tts_service import generate_tts_from_text

load_dotenv()

# logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("voice-agent")

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# in-memory chat store: { session_id: [ {"role","content"}, ... ] }
chat_histories: Dict[str, List[Dict[str,str]]] = {}

# Simple websocket manager for Day 15 (echo)
class ConnectionManager:
    def __init__(self):
        self.connections: List[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.connections.append(ws)

    def disconnect(self, ws: WebSocket):
        try:
            self.connections.remove(ws)
        except ValueError:
            pass

    async def send_personal(self, msg: str, ws: WebSocket):
        await ws.send_text(msg)

manager = ConnectionManager()

# ---------- Routes ----------
@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/generate-tts", response_model=TTSResponse)
async def generate_tts_route(text: str = Form(...), language_code: str = Form("en")):
    try:
        audio_url = generate_tts_from_text(text, language_code)
        return {"message": "TTS successful", "audio_url": audio_url}
    except Exception as e:
        logger.exception("TTS failed")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/agent/chat/{session_id}", response_model=ChatResponse)
async def agent_chat(session_id: str, file: UploadFile = File(...)):
    """
    Main Day 10 pipeline:
    - save uploaded file
    - transcribe via AssemblyAI (service)
    - append to session history
    - call LLM (service) — LLM may request skills (function-calling)
    - produce final assistant text, then TTS via Murf
    - return transcript, llm_response, audio_url, history
    """
    try:
        # Save uploaded audio
        os.makedirs("uploads", exist_ok=True)
        safe_fn = f"{uuid.uuid4().hex}_{file.filename}"
        path = os.path.join("uploads", safe_fn)
        content = await file.read()
        with open(path, "wb") as fh:
            fh.write(content)

        # Transcribe (delegates to services/stt_service.py)
        transcript_text = transcribe_bytes(content)
        if not transcript_text or not transcript_text.strip():
            raise HTTPException(status_code=400, detail="No speech detected")

        # ensure session exists
        chat_histories.setdefault(session_id, [])

        # append user message
        chat_histories[session_id].append({"role": "user", "content": transcript_text})

        # build conversation for LLM
        convo_text = "\n".join(
            [(m["role"].capitalize() + ": " + m["content"]) for m in chat_histories[session_id]]
        )

        # ask LLM if a skill should be invoked (high-level function)
        # llm_check_for_skill returns {"call": None} or {"call": {"name": "...", "args": {...}}}
        skill_check = llm_check_for_skill(convo_text)

        final_response_text = ""
        model_used = None

        if skill_check.get("call"):
            # will run skill, call LLM with the function result and get final response
            skill_result, model_used = invoke_skill_and_finalize(skill_check["call"], convo_text)
            final_response_text = skill_result  # the helper returns the finalized reply
        else:
            # normal LLM reply
            llm_out = call_llm_conversation(convo_text)
            final_response_text = llm_out.get("text", "")
            model_used = llm_out.get("model_used")

        # append assistant message
        chat_histories[session_id].append({"role": "assistant", "content": final_response_text})

        # Generate TTS via services/tts_service.py
        audio_url = generate_tts_from_text(final_response_text[:3000], language_code="en")

        return {
            "transcript": transcript_text,
            "llm_response": final_response_text,
            "audio_url": audio_url,
            "history": chat_histories[session_id]
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("agent_chat error")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/agent/clear/{session_id}")
async def clear_session(session_id: str):
    chat_histories.pop(session_id, None)
    return {"cleared": True, "session": session_id}


# simple file transcribe endpoint
@app.post("/transcribe/file")
async def transcribe_file(file: UploadFile = File(...)):
    try:
        data = await file.read()
        text = transcribe_bytes(data)
        os.makedirs("transcripts", exist_ok=True)
        fname = f"transcripts/{uuid.uuid4().hex}_{file.filename}.txt"
        with open(fname, "w", encoding="utf-8") as fh:
            fh.write(text)
        return {"transcript": text, "download_url": f"/{fname}"}
    except Exception as e:
        logger.exception("transcribe_file")
        raise HTTPException(status_code=500, detail=str(e))


# ---------- Websocket echo (Day 15) ----------
@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await manager.connect(ws)
    try:
        await manager.send_personal("✅ Connected to /ws. Send a message to be echoed.", ws)
        while True:
            data = await ws.receive_text()
            # echo back
            await manager.send_personal(f"echo: {data}", ws)
    except WebSocketDisconnect:
        manager.disconnect(ws)
    except Exception:
        manager.disconnect(ws)
        raise


# ---------- Simple skill endpoints (optional) ----------
@app.get("/skill/weather/{city}")
async def skill_weather(city: str):
    # wrapper optional
    from services.llm_service import get_weather
    return {"city": city, "weather": get_weather(city)}

@app.get("/skill/news")
async def skill_news():
    from services.llm_service import get_news
    return {"news": get_news()}

# ---------- Health ----------
@app.get("/health")
async def health():
    return {"status": "ok"}
