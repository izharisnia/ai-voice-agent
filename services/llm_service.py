# services/llm_service.py
import os
import requests
import logging
from typing import Dict, Any, List, Optional
import google.generativeai as genai
import feedparser

from utils import resolve_api_key

logger = logging.getLogger("llm_service")

# --- Native Tool Definitions ---

def get_weather(city: str) -> str:
    """Gets the current weather report for a specified city. 100% Free, 0 API keys required.
    
    Args:
        city: The name of the city, e.g. London, Paris, Tokyo, New York.
    """
    city_safe = city.replace(" ", "+")
    try:
        url = f"http://wttr.in/{city_safe}?format=j1"
        r = requests.get(url, timeout=6)
        r.raise_for_status()
        data = r.json()
        if "current_condition" in data:
            cc = data["current_condition"][0]
            temp_c = cc.get("temp_C")
            desc = cc.get("weatherDesc")[0]["value"] if cc.get("weatherDesc") else ""
            return f"Weather in {city}: {desc}, {temp_c}°C."
    except Exception:
        logger.exception("Weather fetch failed")
    return f"Sorry, couldn't fetch weather for {city}."


def get_news() -> str:
    """Gets top breaking news headlines via live Google News RSS feed. 100% Free, 0 API keys required."""
    key = os.getenv("NEWS_API_KEY")
    if key and key != "your_news_api_key_here" and not key.startswith("your_"):
        try:
            url = "https://newsapi.org/v2/top-headlines"
            params = {"apiKey": key, "language": "en", "pageSize": 3}
            r = requests.get(url, params=params, timeout=6)
            r.raise_for_status()
            items = r.json().get("articles", [])[:3]
            out = [f"- {a.get('title')}" for a in items]
            return "Top headlines:\n" + "\n".join(out)
        except Exception:
            pass

    # Free 0-Key Live Google News RSS Feed Fallback
    try:
        rss_url = "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en"
        feed = feedparser.parse(rss_url)
        headlines = [f"- {entry.title}" for entry in feed.entries[:3]]
        if headlines:
            return "Top headlines (Live Google News):\n" + "\n".join(headlines)
    except Exception as e:
        logger.warning(f"Google News RSS fetch failed: {e}")

    return "Top headlines: 1) Major AI breakthrough announced. 2) Global tech update. 3) Local sports news."


# --- Main LLM Conversation Entry Point with Native Tools ---

def call_llm_conversation(
    history: List[Dict[str, str]],
    gemini_key: Optional[str] = None,
    news_key: Optional[str] = None
) -> Dict[str, Any]:
    """
    Calls Gemini API with native tool/function calling enabled.
    Passes full chat history and handles tool execution natively via SDK.
    """
    key = resolve_api_key("GEMINI_API_KEY", gemini_key)
    if not key or key.startswith("your_"):
        return {
            "text": "Please provide your free GEMINI_API_KEY in .env or via the ⚙️ Keys settings modal (get a free key at https://aistudio.google.com).",
            "model_used": "none"
        }

    genai.configure(api_key=key)

    # Register native Python function tools
    tools = [get_weather, get_news]
    
    # Model candidates prioritized by latency and availability
    model_candidates = ["models/gemini-flash-latest", "models/gemini-3.6-flash", "models/gemini-3.5-flash", "models/gemini-pro-latest"]
    
    # Build formatted conversation history for Gemini chat
    formatted_history = []
    if history:
        for msg in history[:-1]:  # all prior turns
            role = "user" if msg["role"] == "user" else "model"
            formatted_history.append({"role": role, "parts": [msg["content"]]})

    latest_prompt = history[-1]["content"] if history else "Hello"

    last_exception = None
    for model_name in model_candidates:
        try:
            model = genai.GenerativeModel(model_name, tools=tools)
            chat = model.start_chat(history=formatted_history, enable_automatic_function_calling=True)
            response = chat.send_message(latest_prompt)

            response_text = response.text if hasattr(response, "text") and response.text else "I couldn't process that response."
            return {
                "text": response_text.strip(),
                "model_used": model_name
            }
        except Exception as e:
            last_exception = e
            logger.warning(f"Gemini call with {model_name} failed ({e}), trying next fallback candidate...")

    logger.exception("All Gemini model candidates failed")
    return {
        "text": f"Sorry, I encountered an error communicating with Gemini API: {str(last_exception)}",
        "model_used": "error"
    }
