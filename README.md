# AI Voice Agent 🎙️⚡

An AI-powered conversational voice agent with real-time transcription and text-to-speech capabilities, built with **FastAPI**, **AssemblyAI**, **Google Gemini**, and **Murf TTS**. Styled with a dark **Electric Glow UI**.

## 🚀 Features
- 🎤 **One-click recording** (toggle start/stop)
- 🗣 **Real-time transcription** with AssemblyAI
- 🤖 **LLM-powered responses** using Google Gemini
- 🔊 **Voice output** with Murf TTS
- 🎛 **Electric Glow theme** for UI
- 📜 Chat history sidebar with clickable items
- 📱 Mobile-responsive design

## 🏗 Architecture
Frontend (HTML, CSS, JS)
↓
FastAPI Backend
↓
AssemblyAI (Speech-to-Text)
↓
Google Gemini (Text generation)
↓
Murf TTS (Text-to-Speech)


## ⚙️ Technologies
- **FastAPI** (Python backend)
- **JavaScript (Vanilla)** for frontend logic
- **AssemblyAI API**
- **Google Gemini API**
- **Murf TTS API**
- **WaveSurfer.js** for waveform visualization

## 📂 Folder Structure
VOICE-AGENT/
│── static/ # CSS, JS, audio files
│── templates/ # HTML templates
│── uploads/ # Uploaded audio
│── transcripts/ # Transcribed text files
│── main.py # FastAPI backend
│── utils.py # Helper functions
│── requirements.txt
│── README.md


## 🔧 Setup & Run
### 1️⃣ Install Dependencies
```bash
pip install -r requirements.txt

Create .env file
ASSEMBLYAI_API_KEY=your_api_key_here
GEMINI_API_KEY=your_api_key_here
MURF_API_KEY=your_api_key_here

Start backend server
uvicorn main:app --reload

Built by Isnia Izhar

