# 🎙️ AI Voice Agent

An interactive **AI-powered voice assistant** built with **FastAPI**, **JavaScript**, and **WaveSurfer.js** that can listen to your speech, transcribe it using **AssemblyAI**, process it with **Google Gemini**, and reply back with a **Murf.ai generated voice** — all in real time.

## 🚀 Features
- 🎤 **Real-time Voice Conversation** – Speak to the bot, and it listens + replies instantly.
- 📝 **Accurate Transcription** – Powered by **AssemblyAI** Speech-to-Text API.
- 🤖 **Smart Responses** – Generated via **Google Gemini** LLM.
- 🔊 **Natural Voice Output** – Murf.ai Text-to-Speech integration.
- 📜 **Chat History Sidebar** – View previous exchanges in the session.
- 🌐 **Electric Glow UI** – Stylish animated buttons & neon theme.
- 📱 **Responsive Design** – Works on desktop and mobile.


## 🏗️ Project Architecture
Frontend (HTML + CSS + JS)
│
├── index.html (UI + chat history sidebar + mic button)
├── style.css (Electric Glow Theme)
└── scripts.js (Handles recording, transcription, TTS, chat updates)
│
Backend (FastAPI - Python)
│
├── main.py
│ ├── /agent/chat/{session_id} → Handles audio input → Transcribes → Sends to Gemini → Converts to TTS
│ ├── /generate-tts → Converts custom text to voice
│ ├── /transcribe/file → Returns transcription from audio
│ └── /agent/clear/{session_id} → Clears chat history
│
APIs
│
├── AssemblyAI (Speech-to-Text)
├── Google Gemini (Text Generation)
└── Murf.ai (Text-to-Speech)



## ⚙️ Installation & Setup

1️⃣ Clone the Repository
```bash
git clone https://github.com/izharisnia/ai-voice-agent.git
cd ai-voice-agent

2️⃣ Install Dependencies
pip install -r requirements.txt


3️⃣ Environment Variables
Create a .env file in the root folder:

ASSEMBLYAI_API_KEY=your_assemblyai_api_key
MURF_API_KEY=your_murf_api_key
GEMINI_API_KEY=your_gemini_api_key


4️⃣ Run the Server
uvicorn main:app --reload

Open your browser and go to:
http://127.0.0.1:8000


📚 Technologies Used
1. FastAPI – Backend framework
2. HTML5, CSS3, JavaScript – Frontend
3. WaveSurfer.js – Audio visualization
4. AssemblyAI API – Speech-to-Text
5. Google Gemini API – LLM text generation
6. Murf.ai API – Text-to-Speech
7. UUID – Unique session tracking

📝 How It Works
1. Click Start Recording → Speak into the mic.
2. Audio is sent to the backend.
3. AssemblyAI transcribes it into text.
4. The text is sent to Gemini for response generation.
5. The generated text is converted into speech using Murf.ai.
6. The reply plays automatically, and the session history is updated.

📌 Notes
1. Ensure your .env file contains all required API keys before starting.
2. The app automatically restarts recording after each AI reply for smooth conversations.

Built by Isnia Izhar