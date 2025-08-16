# 🎙️ AI Voice Agent

A conversational AI voice agent built with **FastAPI**, **AssemblyAI**, **Murf TTS**, and **Google Gemini**.  
This project was created as part of the **30 Days of AI Voice Agents Challenge**.



## 🚀 Features
- 🎤 **Voice Conversations** – Speak to the bot, and it responds with speech.
- 📝 **Real-time Transcription** – Powered by AssemblyAI.
- 🤖 **LLM Responses** – Context-aware replies using Google Gemini.
- 🗣️ **Text-to-Speech** – Natural AI voices using Murf API.
- 🧠 **Conversation Memory** – Keeps chat history per session.
- 📂 **Transcript Download** – Save conversations as `.txt`.
- ⚡ **Electric Glow UI** – Styled front-end with waveform visualizer.



## 🏗️ Architecture
Frontend (HTML/CSS/JS)
|
|--> FastAPI Backend
|--> AssemblyAI (Speech-to-Text)
|--> Gemini (LLM Responses)
|--> Murf (Text-to-Speech)
|
└── Conversation History (in-memory)

## 📂 Project Structure
voice-agent/
│── main.py # FastAPI entrypoint
│── requirements.txt
│── .env.example
│── templates/
│ └── index.html
│── static/
│ ├── style.css
│ └── scripts.js
│── services/
│ ├── tts_service.py and stt_service.py # Murf TTS and STT logic
│ └── llm_service.py # Gemini logic
│── models/
│ └── schemas.py # (optional) Pydantic schemas
│── uploads/
│── transcripts/


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

🤝 Contributing
Pull requests are welcome! For major changes, open an issue first to discuss.

📝 License
MIT License © 2025 Isnia Izhar
