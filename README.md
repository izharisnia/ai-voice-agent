# Electric Voice Agent

A conversational voice agent (Day 1–28) using AssemblyAI for STT, Google Gemini for LLM, and Murf for TTS.
Features:
- Record and stream audio
- Conversation memory per session
- Function-calling skills (weather & news)
- Responsive electric neon UI

## How to run

1. Create virtualenv:
   ```bash
   python -m venv venv
   source venv/bin/activate    # mac/linux
   venv\Scripts\activate       # windows
2. Install requirements:
pip install -r requirements.txt

3. Create .env in repo root with:
ASSEMBLYAI_API_KEY=...
GEMINI_API_KEY=...
MURF_API_KEY=...
NEWS_API_KEY=...   # optional

4. Run:
uvicorn main:app --reload

5. Open browser: http://127.0.0.1:8000