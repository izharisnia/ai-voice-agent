/* Electric Voice Agent - Client Frontend Script */

let recWaveform = null;
let mediaRecorder = null;
let audioChunks = [];
let STATE = "idle"; // 'idle' | 'recording' | 'processing' | 'playing'
let SESSION_ID = null;

// WebSocket Streaming variables
let streamWS = null;

function escapeHtml(unsafe) {
    if (!unsafe) return "";
    return String(unsafe).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function getSessionFromURL() {
    const p = new URLSearchParams(window.location.search);
    let s = p.get("session");
    if (!s) {
        s = crypto.randomUUID();
        p.set("session", s);
        window.history.replaceState({}, "", `${location.pathname}?${p}`);
    }
    return s;
}

function getSavedKeys() {
    try {
        return JSON.parse(localStorage.getItem("voiceAgentKeys") || "{}");
    } catch (e) {
        return {};
    }
}

function getCustomHeaders() {
    const keys = getSavedKeys();
    const headers = {};
    if (keys.assembly) headers["X-AssemblyAI-Key"] = keys.assembly;
    if (keys.gemini) headers["X-Gemini-Key"] = keys.gemini;
    if (keys.murf) headers["X-Murf-Key"] = keys.murf;
    if (keys.news) headers["X-News-Key"] = keys.news;
    return headers;
}

function initWaveform() {
    try {
        if (!recWaveform && document.getElementById("waveformEcho")) {
            recWaveform = WaveSurfer.create({
                container: '#waveformEcho',
                waveColor: '#00f0ff',
                progressColor: '#ff007f',
                height: 80,
                barWidth: 2,
                barGap: 3
            });
        }
    } catch (e) {
        console.warn("WaveSurfer init failed:", e);
    }
}

function setState(s, customText) {
    STATE = s;
    const btn = document.getElementById("recordToggleBtn");
    const label = document.getElementById("recordBtnLabel");
    const status = document.getElementById("statusText");

    if (!btn || !label || !status) return;

    if (s === "idle") {
        btn.classList.remove("is-recording");
        btn.disabled = false;
        btn.setAttribute("aria-pressed", "false");
        label.textContent = "Start Recording";
        status.innerHTML = '<span class="status-dot idle"></span> Idle';
    } else if (s === "recording") {
        btn.classList.add("is-recording");
        btn.disabled = false;
        btn.setAttribute("aria-pressed", "true");
        label.textContent = "Stop & Send";
        status.innerHTML = '<span class="status-dot recording"></span> Recording...';
    } else if (s === "processing") {
        btn.classList.remove("is-recording");
        btn.disabled = true;
        label.textContent = "Processing...";
        status.innerHTML = `<span class="status-dot processing"></span> ${escapeHtml(customText || "Processing...")}`;
    } else if (s === "playing") {
        btn.classList.remove("is-recording");
        btn.disabled = false;
        label.textContent = "Playing...";
        status.innerHTML = '<span class="status-dot playing"></span> Playing reply';
    }
}

// Load session history from SQLite backend
async function loadSessionHistory() {
    try {
        const res = await fetch(`/agent/history/${SESSION_ID}`);
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.history)) {
                updateChatHistorySidebar(data.history);
            }
        }
    } catch (err) {
        console.error("Failed to load session history from DB:", err);
    }
}

// Mode router: WebSocket Streaming vs HTTP Upload
async function startRecording() {
    const isWSMode = document.getElementById("wsModeToggle")?.checked;
    if (isWSMode) {
        await startWebSocketStreaming();
    } else {
        await startHTTPRecording();
    }
}

function stopRecording() {
    const isWSMode = document.getElementById("wsModeToggle")?.checked;
    if (isWSMode && streamWS) {
        stopWebSocketStreaming();
    } else if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
    }
}

// ---------------- 1. WebSocket Streaming Logic ----------------
async function startWebSocketStreaming() {
    try {
        const keys = getSavedKeys();
        const wsProtocol = location.protocol === "https:" ? "wss:" : "ws:";
        let wsUrl = `${wsProtocol}//${location.host}/ws/stream-audio?session=${SESSION_ID}`;
        if (keys.assembly) wsUrl += `&assembly_key=${encodeURIComponent(keys.assembly)}`;
        if (keys.gemini) wsUrl += `&gemini_key=${encodeURIComponent(keys.gemini)}`;
        if (keys.murf) wsUrl += `&murf_key=${encodeURIComponent(keys.murf)}`;
        if (keys.news) wsUrl += `&news_key=${encodeURIComponent(keys.news)}`;

        streamWS = new WebSocket(wsUrl);

        streamWS.onopen = async () => {
            console.log("⚡ WebSocket Streaming connected");
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
            audioChunks = [];

            mediaRecorder.ondataavailable = async (e) => {
                if (e.data && e.data.size > 0) {
                    audioChunks.push(e.data);
                    if (streamWS && streamWS.readyState === WebSocket.OPEN) {
                        const buffer = await e.data.arrayBuffer();
                        streamWS.send(buffer);
                    }
                }
            };

            mediaRecorder.start(250); // send chunks every 250ms
            setState("recording");
        };

        streamWS.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleWebSocketEvent(data);
            } catch (err) {
                console.error("WS Parse error:", err);
            }
        };

        streamWS.onerror = (err) => {
            console.error("WebSocket error:", err);
            alert("WebSocket connection error.");
            setState("idle");
        };

        streamWS.onclose = () => {
            console.log("WebSocket connection closed.");
        };

    } catch (err) {
        console.error("startWebSocketStreaming error:", err);
        alert("Microphone access denied or WebSocket failed: " + err.message);
        setState("idle");
    }
}

function stopWebSocketStreaming() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
    }
    if (recWaveform && audioChunks.length > 0) {
        const blob = new Blob(audioChunks, { type: "audio/webm" });
        recWaveform.load(URL.createObjectURL(blob));
    }
    if (streamWS && streamWS.readyState === WebSocket.OPEN) {
        setState("processing", "Sending stream...");
        streamWS.send(JSON.stringify({ event: "stop" }));
    }
}

function handleWebSocketEvent(data) {
    if (data.event === "status") {
        if (data.status === "transcribing") setState("processing", "Transcribing audio...");
        else if (data.status === "thinking") setState("processing", "Gemini thinking...");
        else if (data.status === "generating_speech") setState("processing", "Generating TTS audio...");
    } else if (data.event === "response") {
        displayResponse(data);
        if (streamWS) {
            streamWS.close();
            streamWS = null;
        }
    } else if (data.event === "error") {
        alert("Streaming Error: " + data.message);
        setState("idle");
        if (streamWS) {
            streamWS.close();
            streamWS = null;
        }
    }
}


// ---------------- 2. HTTP POST Recording Logic ----------------
async function startHTTPRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = e => {
            if (e.data && e.data.size > 0) audioChunks.push(e.data);
        };

        mediaRecorder.onstop = async () => {
            const blob = new Blob(audioChunks, { type: "audio/webm" });
            if (recWaveform) recWaveform.load(URL.createObjectURL(blob));
            await sendAudioHTTP(blob);
        };

        mediaRecorder.start();
        setState("recording");
    } catch (err) {
        console.error("startHTTPRecording error", err);
        alert("Microphone access denied: " + err.message);
        setState("idle");
    }
}

async function sendAudioHTTP(blob) {
    setState("processing", "Processing HTTP Upload...");
    const fd = new FormData();
    const file = new File([blob], `recording_${Date.now()}.webm`, { type: 'audio/webm' });
    fd.append("file", file);

    try {
        const customHeaders = getCustomHeaders();
        const res = await fetch(`/agent/chat/${SESSION_ID}`, {
            method: 'POST',
            headers: customHeaders,
            body: fd
        });

        if (!res.ok) {
            const txt = await res.text().catch(() => null);
            throw new Error(txt || `Server error ${res.status}`);
        }

        const data = await res.json();
        displayResponse(data);
    } catch (err) {
        console.error("sendAudioHTTP error:", err);
        alert("Conversation failed: " + (err.message || err));
        setState("idle");
    }
}


// ---------------- Common UI Response Renderer ----------------
function displayResponse(data) {
    // Transcript box
    const tbox = document.getElementById("transcript");
    tbox.innerHTML = `
        <p><strong>You said:</strong> ${escapeHtml(data.transcript || "[no transcript]")}</p>
        <p style="margin-top:10px;"><strong>LLM replied:</strong> ${escapeHtml(data.llm_response || "[no reply]")}</p>
    `;

    // Skill output box
    const sr = document.getElementById("skillResult");
    sr.textContent = data.llm_response || "";

    // Sidebar history update
    if (Array.isArray(data.history)) {
        updateChatHistorySidebar(data.history);
    }

    // Audio Playback
    const audio = document.getElementById("llmAudioPlayer");
    if (data.audio_url) {
        audio.src = data.audio_url;
        setState("playing");
        audio.play().catch(e => {
            console.warn("Autoplay blocked:", e);
            setState("idle");
        });
        audio.onended = () => setState("idle");
    } else {
        setState("idle");
    }
}

function updateChatHistorySidebar(historyArr) {
    const list = document.getElementById("historyList");
    if (!list) return;
    list.innerHTML = "";

    for (let i = historyArr.length - 2; i >= 0; i -= 2) {
        const userMsg = historyArr[i] && historyArr[i].role === "user" ? historyArr[i].content : "";
        const assistantMsg = historyArr[i + 1] ? historyArr[i + 1].content : "";

        const li = document.createElement("li");
        li.className = "history-item";
        const snippet = userMsg.length > 80 ? userMsg.slice(0, 77) + "..." : userMsg;
        li.innerHTML = `<div class="meta">You</div><div class="snippet">${escapeHtml(snippet)}</div>`;
        li.addEventListener("click", () => {
            document.getElementById("transcript").innerHTML = `
                <p><strong>You said:</strong> ${escapeHtml(userMsg)}</p>
                <p style="margin-top:10px;"><strong>LLM replied:</strong> ${escapeHtml(assistantMsg)}</p>
            `;
            document.getElementById("skillResult").textContent = assistantMsg;
        });
        list.appendChild(li);
    }

    if (historyArr.length % 2 === 1) {
        const last = historyArr[historyArr.length - 1];
        if (last) {
            const li = document.createElement("li");
            li.className = "history-item";
            li.innerHTML = `<div class="meta">${escapeHtml(last.role)}</div><div class="snippet">${escapeHtml(last.content)}</div>`;
            list.insertBefore(li, list.firstChild);
        }
    }
}

// ---------------- Settings Modal Functions ----------------
function showSettings() {
    document.getElementById("settingsModal").classList.remove("hidden");
    loadKeysToUI();
}

function hideSettings() {
    document.getElementById("settingsModal").classList.add("hidden");
}

function saveKeysFromUI() {
    const keys = {
        assembly: document.getElementById("cfg_assembly").value.trim(),
        gemini: document.getElementById("cfg_gemini").value.trim(),
        murf: document.getElementById("cfg_murf").value.trim(),
        news: document.getElementById("cfg_news").value.trim()
    };
    localStorage.setItem("voiceAgentKeys", JSON.stringify(keys));
    hideSettings();
    alert("API keys saved! Custom keys will be sent to the backend.");
}

function loadKeysToUI() {
    const k = getSavedKeys();
    document.getElementById("cfg_assembly").value = k.assembly || "";
    document.getElementById("cfg_gemini").value = k.gemini || "";
    document.getElementById("cfg_murf").value = k.murf || "";
    document.getElementById("cfg_news").value = k.news || "";
}

// ---------------- DOM Loaded Entry Point ----------------
document.addEventListener("DOMContentLoaded", () => {
    initWaveform();
    SESSION_ID = getSessionFromURL();
    loadSessionHistory();
    setState("idle");

    const toggle = document.getElementById("recordToggleBtn");
    if (toggle) {
        toggle.addEventListener("click", () => {
            if (STATE === "idle") startRecording();
            else if (STATE === "recording") stopRecording();
        });
    }

    document.getElementById("newChatBtn")?.addEventListener("click", () => {
        SESSION_ID = crypto.randomUUID();
        const params = new URLSearchParams(window.location.search);
        params.set("session", SESSION_ID);
        window.history.replaceState({}, "", `${location.pathname}?${params}`);
        document.getElementById("historyList").innerHTML = "";
        document.getElementById("transcript").innerHTML = `<p class="placeholder">New conversation started...</p>`;
        document.getElementById("skillResult").textContent = "";
        setState("idle");
    });

    document.getElementById("clearHistoryBtn")?.addEventListener("click", async () => {
        if (!confirm("Clear session history in database?")) return;
        try {
            await fetch(`/agent/clear/${SESSION_ID}`, { method: "POST" });
            document.getElementById("historyList").innerHTML = "";
            document.getElementById("transcript").innerHTML = `<p class="placeholder">History cleared.</p>`;
            document.getElementById("skillResult").textContent = "";
        } catch (e) {
            console.error(e);
            alert("Failed to clear history");
        } finally {
            setState("idle");
        }
    });

    document.getElementById("settingsBtn")?.addEventListener("click", showSettings);
    document.getElementById("closeModalBtn")?.addEventListener("click", hideSettings);
    document.getElementById("saveKeysBtn")?.addEventListener("click", saveKeysFromUI);
});
