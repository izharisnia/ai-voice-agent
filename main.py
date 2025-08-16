# from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request
# from fastapi.responses import HTMLResponse, FileResponse
# from fastapi.staticfiles import StaticFiles
# from fastapi.templating import Jinja2Templates
# from dotenv import load_dotenv
# import os
# import assemblyai as aai
# from uuid import uuid4

# # === Your utility functions ===
# from utils import generate_tts, query_gemini

# # Load environment variables
# load_dotenv()

# # AssemblyAI setup
# aai.settings.api_key = os.getenv("ASSEMBLYAI_API_KEY")
# transcriber = aai.Transcriber()

# # Initialize FastAPI app
# app = FastAPI()
# app.mount("/static", StaticFiles(directory="static"), name="static")
# templates = Jinja2Templates(directory="templates")

# # In-memory chat history { session_id: [ {role, content}, ... ] }
# chat_histories = {}

# # ------------------ ROUTES ------------------

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
#     """Day 10: Conversational pipeline — Audio → Transcription → LLM → TTS"""
#     try:
#         os.makedirs("uploads", exist_ok=True)
#         file_path = f"uploads/{file.filename}"
#         with open(file_path, "wb") as f:
#             f.write(await file.read())

#         # Transcribe
#         with open(file_path, "rb") as audio_file:
#             transcript = transcriber.transcribe(audio_file.read())

#         user_text = transcript.text.strip()
#         if not user_text:
#             raise HTTPException(status_code=400, detail="No speech detected.")

#         # Initialize session history if missing
#         if session_id not in chat_histories:
#             chat_histories[session_id] = []

#         # Append user message
#         chat_histories[session_id].append({"role": "user", "content": user_text})

#         # Build conversation context
#         conversation_text = "\n".join(
#             [("User: " if m["role"] == "user" else "Assistant: ") + m["content"]
#              for m in chat_histories[session_id]]
#         )

#         # Get LLM response
#         try:
#             llm_result = query_gemini(conversation_text)
#             response_text = llm_result["text"] if isinstance(llm_result, dict) else str(llm_result)
#         except Exception as e:
#             print("[WARN] Gemini call failed:", e)
#             response_text = "I'm sorry, I couldn't process that request."

#         # Append assistant message
#         chat_histories[session_id].append({"role": "assistant", "content": response_text})

#         # Generate TTS from response
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

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import os, logging
from uuid import uuid4

# Local imports
from models.schemas import TTSResponse, ChatResponse
from services.tts_service import generate_tts
from services.stt_service import transcribe_audio
from services.llm_service import query_gemini

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

chat_histories = {}

# ------------------ ROUTES ------------------

@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/generate-tts", response_model=TTSResponse)
async def generate_tts_route(text: str = Form(...), language_code: str = Form(...)):
    try:
        audio_url = generate_tts(text, language_code)
        return {"message": "TTS generation successful", "audio_url": audio_url}
    except Exception as e:
        logging.error(f"TTS Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/agent/chat/{session_id}", response_model=ChatResponse)
async def agent_chat(session_id: str, file: UploadFile = File(...)):
    try:
        os.makedirs("uploads", exist_ok=True)
        file_path = f"uploads/{file.filename}"
        with open(file_path, "wb") as f:
            f.write(await file.read())

        with open(file_path, "rb") as audio_file:
            user_text = transcribe_audio(audio_file.read())

        if not user_text:
            raise HTTPException(status_code=400, detail="No speech detected.")

        # Manage history
        if session_id not in chat_histories:
            chat_histories[session_id] = []
        chat_histories[session_id].append({"role": "user", "content": user_text})

        conversation_text = "\n".join(
            [("User: " if m["role"] == "user" else "Assistant: ") + m["content"]
             for m in chat_histories[session_id]]
        )

        try:
            response_text = query_gemini(conversation_text)
        except Exception as e:
            logging.warning(f"Gemini call failed: {e}")
            response_text = "I'm sorry, I couldn't process that request."

        chat_histories[session_id].append({"role": "assistant", "content": response_text})

        murf_audio_url = generate_tts(text=response_text[:3000], language_code="en")

        return {
            "transcript": user_text,
            "llm_response": response_text,
            "audio_url": murf_audio_url,
            "history": chat_histories[session_id]
        }
    except Exception as e:
        logging.error(f"Agent chat error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/agent/clear/{session_id}")
async def clear_history(session_id: str):
    if session_id in chat_histories:
        del chat_histories[session_id]
    return {"message": f"Chat history for session {session_id} cleared."}

@app.post("/transcribe/file")
async def transcribe_file(file: UploadFile = File(...), language_code: str = Form("en")):
    try:
        audio_data = await file.read()
        transcript_text = transcribe_audio(audio_data)

        os.makedirs("transcripts", exist_ok=True)
        transcript_path = f"transcripts/{file.filename}.txt"
        with open(transcript_path, "w", encoding="utf-8") as f:
            f.write(transcript_text)

        return {
            "transcript": transcript_text,
            "download_url": f"/download-transcript/{file.filename}.txt"
        }
    except Exception as e:
        logging.error(f"Transcription error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/download-transcript/{filename}")
async def download_transcript(filename: str):
    path = f"transcripts/{filename}"
    if os.path.exists(path):
        return FileResponse(path, media_type="text/plain", filename=filename)
    raise HTTPException(status_code=404, detail="Transcript not found")

# from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Form
# from fastapi.responses import HTMLResponse, FileResponse
# from fastapi.staticfiles import StaticFiles
# from fastapi.templating import Jinja2Templates
# from pydantic import BaseModel
# from dotenv import load_dotenv
# from utils import generate_tts, query_gemini
# import os
# import assemblyai as aai

# # Load environment variables
# load_dotenv()

# # Initialize FastAPI app
# app = FastAPI()

# # Static & template folders
# app.mount("/static", StaticFiles(directory="static"), name="static")
# templates = Jinja2Templates(directory="templates")

# # AssemblyAI setup
# aai.settings.api_key = os.getenv("ASSEMBLYAI_API_KEY")
# transcriber = aai.Transcriber()

# # ------------------ MODELS ------------------
# class TTSRequest(BaseModel):
#     text: str
#     language_code: str  # e.g., 'en', 'es', 'fr', 'de'

# class TTSResponse(BaseModel):
#     message: str
#     audio_url: str

# class LLMRequest(BaseModel):
#     prompt: str

# class LLMResponse(BaseModel):
#     response: str
#     model_used: str

# from fastapi import FastAPI, File, UploadFile, HTTPException
# from fastapi.staticfiles import StaticFiles
# from fastapi.responses import FileResponse
# import os
# from uuid import uuid4

# # === Mocked functions for STT/LLM/TTS ===
# # Replace these with your actual implementations
# def transcribe_audio(file_bytes):
#     class Result: pass
#     r = Result()
#     r.text = "Mock transcription from audio"
#     return r

# def query_gemini(prompt):
#     return {"text": f"Mock LLM reply to: {prompt}"}

# def generate_tts(text, language_code="en"):
#     return "/static/mock_llm_audio.mp3"


# # Store chat histories per session_id
# chat_histories = {}

# @app.get("/")
# def index():
#     return FileResponse("templates/index.html")

# # ==== NEW ENDPOINT FOR DAY 10 ====
# @app.post("/agent/chat/{session_id}")
# async def agent_chat(session_id: str, file: UploadFile = File(...)):
#     try:
#         os.makedirs("uploads", exist_ok=True)
#         file_path = f"uploads/{file.filename}"
#         with open(file_path, "wb") as f:
#             f.write(await file.read())

#         # Transcribe with AssemblyAI SDK
#         with open(file_path, "rb") as audio_file:
#             transcript = transcriber.transcribe(audio_file.read())  # ✅ no name collision

#         user_text = transcript.text.strip()
#         if not user_text:
#             raise HTTPException(status_code=400, detail="No speech detected.")

#         # Init session history
#         if session_id not in chat_histories:
#             chat_histories[session_id] = []

#         # Append user message
#         chat_histories[session_id].append({"role": "user", "content": user_text})

#         # Combine history for prompt
#         conversation_text = ""
#         for msg in chat_histories[session_id]:
#             prefix = "User:" if msg["role"] == "user" else "Assistant:"
#             conversation_text += f"{prefix} {msg['content']}\n"

#         # LLM response
#         try:
#             llm_result = query_gemini(conversation_text)
#             response_text = (
#                 llm_result["text"] if isinstance(llm_result, dict) else str(llm_result)
#             )
#         except Exception as e:
#             print("[WARN] Gemini call failed:", e)
#             response_text = "I'm sorry, I couldn't process that request."

#         # Append assistant message
#         chat_histories[session_id].append({"role": "assistant", "content": response_text})

#         # Murf TTS
#         murf_audio_url = generate_tts(text=response_text[:3000], language_code="en")

#         return {
#             "transcript": user_text,
#             "llm_response": response_text,
#             "audio_url": murf_audio_url,
#             "history": chat_histories[session_id]
#         }

#     except Exception as e:
#         raise HTTPException(status_code=500, detail=str(e))

# # ------------------ ROUTES ------------------
# @app.get("/", response_class=HTMLResponse)
# async def get_home(request: Request):
#     """Serve home page"""
#     return templates.TemplateResponse("index.html", {"request": request})

# @app.post("/generate-tts", response_model=TTSResponse)
# async def generate_tts_route(req: TTSRequest):
#     """Generate TTS audio in selected language"""
#     try:
#         audio_url = generate_tts(req.text, req.language_code)
#         return {"message": "TTS generation successful", "audio_url": audio_url}
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=str(e))
#     finally:
#         print(req.text, req.language_code)

# @app.post("/upload-audio")
# async def upload_audio(file: UploadFile = File(...)):
#     """Upload recorded audio"""
#     os.makedirs("uploads", exist_ok=True)
#     file_path = f"uploads/{file.filename}"
#     with open(file_path, "wb") as f:
#         f.write(await file.read())

#     return {
#         "filename": file.filename,
#         "content_type": file.content_type,
#         "size_kb": round(os.path.getsize(file_path) / 1024, 2)
#     }

# @app.post("/transcribe/file")
# async def transcribe_file_route(
#     file: UploadFile = File(...),
#     language_code: str = Form("en")
# ):
#     """Transcribe audio file and return word-level timestamps"""
#     try:
#         audio_data = await file.read()
#         transcript = transcriber.transcribe(audio_data)

#         # Save transcript to file for download
#         os.makedirs("transcripts", exist_ok=True)
#         transcript_path = f"transcripts/{file.filename}.txt"
#         with open(transcript_path, "w", encoding="utf-8") as f:
#             f.write(transcript.text)

#         return {
#             "transcript": transcript.text,
#             "words": [w.dict() for w in transcript.words],
#             "download_url": f"/download-transcript/{file.filename}.txt"
#         }
#     except Exception as e:
#         raise HTTPException(status_code=400, detail=str(e))

# @app.post("/tts/echo")
# async def tts_echo(file: UploadFile = File(...)):
#     """
#     1. Receive recorded audio
#     2. Transcribe with AssemblyAI
#     3. Generate Murf TTS from transcription
#     4. Return audio file URL
#     """
#     try:
    
#         os.makedirs("uploads", exist_ok=True)
#         file_path = f"uploads/{file.filename}"
#         with open(file_path, "wb") as f:
#             f.write(await file.read())

#         with open(file_path, "rb") as audio_file:
#             transcript = transcriber.transcribe(audio_file.read())

#         text_to_speak = transcript.text.strip()
#         if not text_to_speak:
#             raise HTTPException(status_code=400, detail="No speech detected.")

#         murf_audio_url = generate_tts(text=text_to_speak, language_code="en")

#         return {"echo_audio_url": murf_audio_url, "transcript": text_to_speak}

#     except Exception as e:
#         raise HTTPException(status_code=500, detail=str(e))

# # ------------------ LLM ENDPOINT Day 8 ------------------
# @app.post("/llm/query", response_model=LLMResponse)
# async def llm_query(req: LLMRequest):
#     """
#     Accepts a text prompt, sends it to Gemini API, and returns the generated response + model used.
#     """
#     try:
#         output, model_used = query_gemini(req.prompt)
#         return {"response": output, "model_used": model_used}
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=str(e))

# @app.get("/download-transcript/{filename}")
# async def download_transcript(filename: str):
#     """Download saved transcript"""
#     path = f"transcripts/{filename}"
#     if os.path.exists(path):
#         return FileResponse(path, media_type="text/plain", filename=filename)
#     raise HTTPException(status_code=404, detail="Transcript not found")
# # ------------------ Non-Streaming Pipeline Day 9 ------------------
# @app.post("/llm/query-audio")
# async def llm_query_audio(file: UploadFile = File(...)):
#     try:
#         # Save uploaded audio
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

#         # Call Gemini with fallback
#         try:
#             llm_result = query_gemini(user_text)
#             response_text = (
#                 llm_result["text"] if isinstance(llm_result, dict) else str(llm_result)
#             )
#         except Exception as e:
#             print("[WARN] Gemini call failed:", e)
#             response_text = "I'm sorry, I couldn't process that request."

#         # Limit for Murf
#         response_text = response_text[:3000]

#         # Generate TTS
#         murf_audio_url = generate_tts(text=response_text, language_code="en")

#         return {
#             "user_transcript": user_text,
#             "llm_text": response_text,
#             "llm_audio_url": murf_audio_url
#         }


#     except Exception as e:
#         raise HTTPException(status_code=500, detail=str(e))

