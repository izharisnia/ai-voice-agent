# services/llm_service.py
"""
High-level LLM service functions.
- call_llm_conversation(prompt) -> {"text": "...", "model_used": "..."}
- llm_check_for_skill(prompt) -> {"call": {...}} or {"call": None}
- invoke_skill_and_finalize(call_obj, convo_text) -> (final_text, model_used)
"""
import logging
from typing import Dict, Any, Tuple
from utils import gemini_generate_text, gemini_detect_call
import requests
import os

logger = logging.getLogger("llm_service")

def call_llm_conversation(prompt: str) -> Dict[str, Any]:
    # return dict with text and model_used
    try:
        txt = gemini_generate_text(prompt)
        return {"text": txt, "model_used": "gemini-1.5-flash"}
    except Exception:
        logger.exception("LLM call failed")
        return {"text": "Sorry, I couldn't process that.", "model_used": "unknown"}

def llm_check_for_skill(prompt: str) -> Dict[str, Any]:
    """
    Use a heuristic or the Gemini function-calling API to detect skill invocation.
    Here we call a lightweight detector in utils.gemini_detect_call
    """
    call = gemini_detect_call(prompt)
    if call:
        return {"call": call}
    return {"call": None}

# Simple skills
def get_weather(city: str) -> str:
    """
    Use wttr.in JSON (no API key) as a simple weather provider.
    """
    city_safe = city.replace(" ", "+")
    try:
        url = f"http://wttr.in/{city_safe}?format=j1"
        r = requests.get(url, timeout=6)
        r.raise_for_status()
        data = r.json()
        # extract quick summary
        if "current_condition" in data:
            cc = data["current_condition"][0]
            temp_c = cc.get("temp_C")
            desc = cc.get("weatherDesc")[0]["value"] if cc.get("weatherDesc") else ""
            return f"Weather in {city}: {desc}, {temp_c}°C."
    except Exception:
        logger.exception("Weather fetch failed")
    return f"Sorry, couldn't fetch weather for {city}."

def get_news() -> str:
    """
    Use NewsAPI if NEWS_API_KEY set. Otherwise return a placeholder or brief sample.
    """
    key = os.getenv("NEWS_API_KEY")
    try:
        if key:
            url = "https://newsapi.org/v2/top-headlines"
            params = {"apiKey": key, "language": "en", "pageSize": 3}
            r = requests.get(url, params=params, timeout=6)
            r.raise_for_status()
            items = r.json().get("articles", [])[:3]
            out = []
            for a in items:
                out.append(f"- {a.get('title')}")
            return "Top headlines:\n" + "\n".join(out)
        else:
            # fallback mock headlines
            return "Top headlines: 1) Major AI conference announced. 2) Stock markets steady. 3) Local sports update."
    except Exception:
        logger.exception("News fetch failed")
        return "Sorry, couldn't fetch latest news at the moment."

def invoke_skill_and_finalize(call_obj: Dict[str, Any], convo_text: str) -> Tuple[str,str]:
    """
    call_obj example: {"name":"get_weather", "args":{"city":"Delhi"}}
    After retrieving skill result, call LLM again to synthesize final reply.
    """
    name = call_obj.get("name")
    args = call_obj.get("args", {})
    skill_text = ""
    if name == "get_weather":
        city = args.get("city", "your location")
        skill_text = get_weather(city)
    elif name == "get_news":
        skill_text = get_news()
    else:
        skill_text = f"Unknown skill {name}"

    # combine conversation + skill result and call LLM to compose final human-friendly reply
    prompt = convo_text + "\n\nSkill result:\n" + skill_text + "\n\nPlease produce a brief assistant reply that includes this skill result and acknowledges the user."
    final = call_llm_conversation(prompt)
    return (final.get("text", skill_text), final.get("model_used", "gemini-1.5-flash"))
