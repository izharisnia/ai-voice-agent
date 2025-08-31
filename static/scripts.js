
// // =============================
// // Day 12: single toggle record button
// // =============================
// let recWaveform;
// let mediaRecorder;
// let audioChunks = [];
// let STATE = "idle"; // 'idle' | 'recording' | 'playing'
// let SESSION_ID = null;

// function initRecWaveform() {
//   try {
//     recWaveform = WaveSurfer.create({
//       container: '#waveformEcho',
//       waveColor: '#ff00ff',
//       progressColor: '#ff6600',
//       height: 80
//     });
//   } catch (e) { console.warn("WaveSurfer REC init failed:", e); }
// }

// function setState(next) {
//   STATE = next;
//   const btn = document.getElementById("recordToggleBtn");
//   const label = document.getElementById("recordBtnLabel");
//   const status = document.getElementById("statusText");
//   const dot = status?.querySelector(".status-dot");

//   if (!btn || !label || !status || !dot) return;

//   if (STATE === "idle") {
//     btn.classList.remove("is-recording");
//     btn.setAttribute("aria-pressed", "false");
//     label.textContent = "Start Recording";
//     status.innerHTML = `<span class="status-dot idle"></span> Idle`;
//   } else if (STATE === "recording") {
//     btn.classList.add("is-recording");
//     btn.setAttribute("aria-pressed", "true");
//     label.textContent = "Stop & Send";
//     status.innerHTML = `<span class="status-dot recording"></span> Recording...`;
//   } else if (STATE === "playing") {
//     btn.classList.remove("is-recording");
//     btn.setAttribute("aria-pressed", "false");
//     label.textContent = "Playing...";
//     status.innerHTML = `<span class="status-dot playing"></span> Playing reply`;
//   }
// }

// async function toggleRecording() {
//   if (STATE === "idle") {
//     await startRecording();
//   } else if (STATE === "recording") {
//     stopRecording();
//   }
// }

// async function startRecording() {
//   try {
//     const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
//     mediaRecorder = new MediaRecorder(stream);
//     audioChunks = [];

//     mediaRecorder.ondataavailable = (e) => {
//       if (e.data && e.data.size > 0) audioChunks.push(e.data);
//     };

//     mediaRecorder.onstop = async () => {
//       const blob = new Blob(audioChunks, { type: "audio/webm" });
//       if (recWaveform) recWaveform.load(URL.createObjectURL(blob));
//       await sendAudioToChat(blob);
//     };

//     mediaRecorder.start();
//     setState("recording");
//   } catch (err) {
//     console.error("startRecording error:", err);
//     alert("Microphone access denied or not available.");
//     setState("idle");
//   }
// }

// function stopRecording() {
//   try {
//     if (mediaRecorder && mediaRecorder.state !== "inactive") {
//       mediaRecorder.stop();
//     }
//   } catch (e) { /* no-op */ }
// }

// // ---- session id helper (unchanged if you already have it) ----
// function getSessionId() {
//   const params = new URLSearchParams(window.location.search);
//   let sessionId = params.get("session");
//   if (!sessionId) {
//     sessionId = crypto.randomUUID();
//     params.set("session", sessionId);
//     window.history.replaceState({}, "", `${location.pathname}?${params}`);
//   }
//   return sessionId;
// }

// // ---- DOM Ready ----
// document.addEventListener("DOMContentLoaded", () => {
//   initRecWaveform();

//   SESSION_ID = getSessionId();

//   const toggleBtn = document.getElementById("recordToggleBtn");
//   if (toggleBtn) toggleBtn.addEventListener("click", toggleRecording);

//   // keep your existing New Chat / Clear History listeners
//   const newChatBtn = document.getElementById("newChatBtn");
//   const clearHistoryBtn = document.getElementById("clearHistoryBtn");

//   if (newChatBtn) {
//     newChatBtn.addEventListener("click", () => {
//       SESSION_ID = crypto.randomUUID();
//       const params = new URLSearchParams(window.location.search);
//       params.set("session", SESSION_ID);
//       window.history.replaceState({}, "", `${location.pathname}?${params}`);
//       document.getElementById("historyList").innerHTML = "";
//       document.getElementById("transcript").innerHTML =
//         `<p class="placeholder">New conversation started...</p>`;
//       setState("idle");
//     });
//   }

//   if (clearHistoryBtn) {
//     clearHistoryBtn.addEventListener("click", async () => {
//       if (!confirm("Clear history for this session?")) return;
//       try {
//         await fetch(`/agent/clear/${SESSION_ID}`, { method: "POST" });
//         document.getElementById("historyList").innerHTML = "";
//         document.getElementById("transcript").innerHTML =
//           `<p class="placeholder">History cleared.</p>`;
//       } catch (err) {
//         console.error("Error clearing history:", err);
//       } finally {
//         setState("idle");
//       }
//     });
//   }

//   setState("idle");
// });

// // ---- sendAudioToChat (reuse your working version; only minor tweaks below) ----
// async function sendAudioToChat(audioBlob) {
//   const fd = new FormData();
//   const file = new File([audioBlob], `recording_${Date.now()}.webm`, { type: 'audio/webm' });
//   fd.append("file", file);

//   try {
//     const res = await fetch(`/agent/chat/${SESSION_ID}`, { method: "POST", body: fd });
//     if (!res.ok) {
//       const txt = await res.text().catch(()=>null);
//       throw new Error(txt || `Server returned ${res.status}`);
//     }
//     const data = await res.json();

//     // update transcript
//     const transcriptBox = document.getElementById("transcript");
//     transcriptBox.innerHTML = `
//       <p><strong>You said:</strong> ${escapeHtml(data.transcript || "[no transcript]")}</p>
//       <p><strong>LLM replied:</strong> ${escapeHtml(data.llm_response || "[no reply]")}</p>
//     `;

//     // update sidebar
//     if (Array.isArray(data.history)) updateChatHistorySidebar(data.history);

//     // play LLM audio automatically
//     const audioPlayer = document.getElementById("llmAudioPlayer");
//     if (data.audio_url) {
//       audioPlayer.src = data.audio_url;
//       setState("playing");
//       try { await audioPlayer.play(); } catch (e) { console.warn("Autoplay blocked:", e); setState("idle"); }
//       audioPlayer.onended = () => {
//         setState("idle");
//         // optional: auto re-start for next user turn
//         setTimeout(() => startRecording(), 250);
//       };
//     } else {
//       setState("idle");
//       console.warn("No audio URL returned from server.");
//     }
//   } catch (err) {
//     console.error("sendAudioToChat error:", err);
//     alert("Conversation error: " + (err.message || err));
//     setState("idle");
//   }
// }

// // ---- utilities: history + xss-escape (use your existing working ones) ----
// function updateChatHistorySidebar(historyArr) {
//   const list = document.getElementById("historyList");
//   list.innerHTML = "";

//   for (let i = historyArr.length - 2; i >= 0; i -= 2) {
//     const userMsg = historyArr[i] && historyArr[i].role === "user" ? historyArr[i].content : "";
//     const assistantMsg = historyArr[i+1] ? historyArr[i+1].content : "";

//     const li = document.createElement("li");
//     li.className = "history-item";
//     const snippet = userMsg.length > 80 ? userMsg.slice(0,77) + "..." : userMsg;
//     li.innerHTML = `<div class="meta">You</div><div class="snippet">${escapeHtml(snippet)}</div>`;
//     li.addEventListener("click", () => {
//       document.getElementById("transcript").innerHTML = `
//         <p><strong>You said:</strong> ${escapeHtml(userMsg)}</p>
//         <p><strong>LLM replied:</strong> ${escapeHtml(assistantMsg)}</p>
//       `;
//     });
//     list.appendChild(li);
//   }

//   if (historyArr.length % 2 === 1) {
//     const last = historyArr[historyArr.length - 1];
//     if (last) {
//       const li = document.createElement("li");
//       li.className = "history-item";
//       li.innerHTML = `<div class="meta">${escapeHtml(last.role)}</div><div class="snippet">${escapeHtml(last.content)}</div>`;
//       list.insertBefore(li, list.firstChild);
//     }
//   }

//   list.scrollTop = 0;
// }

// function escapeHtml(unsafe) {
//   if (!unsafe) return "";
//   return String(unsafe)
//     .replaceAll("&", "&amp;")
//     .replaceAll("<", "&lt;")
//     .replaceAll(">", "&gt;")
//     .replaceAll('"', "&quot;")
//     .replaceAll("'", "&#039;");
// }

// // =============================
// // Day 16: WebSocket Streaming Audio
// // =============================
// let streamWS;
// let streamRecorder;

// async function startStreaming() {
//   streamWS = new WebSocket("ws://127.0.0.1:8000/ws/stream-audio");

//   streamWS.onopen = async () => {
//     console.log("✅ Connected to /ws/stream-audio");

//     const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
//     streamRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });

//     streamRecorder.ondataavailable = async (event) => {
//       if (event.data.size > 0 && streamWS.readyState === WebSocket.OPEN) {
//         const arrayBuffer = await event.data.arrayBuffer();
//         streamWS.send(arrayBuffer);
//       }
//     };

//     // send chunks every 250ms
//     streamRecorder.start(250);
//     console.log("🎤 Streaming started...");
//   };

//   streamWS.onclose = () => {
//     console.log("❌ Streaming socket closed.");
//   };
// }

// function stopStreaming() {
//   if (streamRecorder && streamRecorder.state !== "inactive") {
//     streamRecorder.stop();
//   }
//   if (streamWS && streamWS.readyState === WebSocket.OPEN) {
//     streamWS.close();
//   }
//   console.log("⏹ Streaming stopped.");
// }

// // =============================
// // Day 16: Streaming audio over WebSocket
// // =============================
// let wsStream;
// let mediaRecorderStream;

// function startStreaming() {
//   if (wsStream && wsStream.readyState === WebSocket.OPEN) {
//     console.warn("Already streaming...");
//     return;
//   }

//   wsStream = new WebSocket("ws://127.0.0.1:8000/ws/stream-audio");

//   wsStream.onopen = async () => {
//     console.log("✅ WebSocket connected for streaming");

//     // Capture microphone
//     const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
//     mediaRecorderStream = new MediaRecorder(stream);

//     mediaRecorderStream.ondataavailable = (e) => {
//       if (e.data.size > 0 && wsStream.readyState === WebSocket.OPEN) {
//         e.data.arrayBuffer().then(buffer => {
//           wsStream.send(buffer);
//         });
//       }
//     };

//     mediaRecorderStream.start(250); // send every 250ms
//   };

//   wsStream.onclose = () => {
//     console.log("❌ WebSocket closed");
//   };

//   wsStream.onerror = (err) => {
//     console.error("WebSocket error:", err);
//   };
// }

// function stopStreaming() {
//   if (mediaRecorderStream && mediaRecorderStream.state !== "inactive") {
//     mediaRecorderStream.stop();
//   }
//   if (wsStream && wsStream.readyState === WebSocket.OPEN) {
//     wsStream.close();
//   }
//   console.log("⏹️ Streaming stopped");
// }
// =============================
// Existing: Toggle record button (Day 12–14)
// =============================

// static/scripts.js
/* Electric Voice Agent - front-end logic */
/* Responsibilities:
   - Recording toggle (single button)
   - Create session id in URL
   - Upload recorded audio to /agent/chat/{session}
   - Show waveform (WaveSurfer)
   - Settings modal to save API keys to localStorage
*/

let recWaveform = null;
let mediaRecorder = null;
let audioChunks = [];
let STATE = "idle";
let SESSION_ID = null;

function escapeHtml(unsafe) {
    if (!unsafe) return "";
    return String(unsafe).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
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

function initWaveform() {
    try {
        recWaveform = WaveSurfer.create({ container: '#waveformEcho', waveColor: '#ff00ff', progressColor:'#ff6600', height:80 });
    } catch (e) { console.warn("WaveSurfer init failed", e) }
}

function setState(s) {
    STATE = s;
    const btn = document.getElementById("recordToggleBtn");
    const label = document.getElementById("recordBtnLabel");
    const status = document.getElementById("statusText");
    if (!btn || !label || !status) return;
    if (s === "idle") {
        btn.classList.remove("is-recording");
        btn.setAttribute("aria-pressed","false");
        label.textContent = "Start Recording";
        status.innerHTML = '<span class="status-dot idle"></span> Idle';
    } else if (s === "recording") {
        btn.classList.add("is-recording");
        btn.setAttribute("aria-pressed","true");
        label.textContent = "Stop & Send";
        status.innerHTML = '<span class="status-dot recording"></span> Recording...';
    } else if (s === "playing") {
        label.textContent = "Playing...";
        status.innerHTML = '<span class="status-dot playing"></span> Playing reply';
    }
}

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.ondataavailable = e => { if (e.data && e.data.size>0) audioChunks.push(e.data); };
        mediaRecorder.onstop = async () => {
            const blob = new Blob(audioChunks, { type: "audio/webm" });
            if (recWaveform) recWaveform.load(URL.createObjectURL(blob));
            await sendAudioToChat(blob);
        };
        mediaRecorder.start();
        setState("recording");
    } catch (err) {
        console.error("startRecording error", err);
        alert("Microphone not available");
        setState("idle");
    }
}

function stopRecording() {
    try {
        if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
    } catch(e){}
}

async function sendAudioToChat(blob) {
    setState("playing"); // optimistic until we get audio
    const fd = new FormData();
    const file = new File([blob], `recording_${Date.now()}.webm`, { type:'audio/webm' });
    fd.append("file", file);
    try {
        const res = await fetch(`/agent/chat/${SESSION_ID}`, { method:'POST', body: fd });
        if (!res.ok) {
            const txt = await res.text().catch(()=>null);
            throw new Error(txt || `Server ${res.status}`);
        }
        const data = await res.json();
        // transcript
        const tbox = document.getElementById("transcript");
        tbox.innerHTML = `<p><strong>You said:</strong> ${escapeHtml(data.transcript || "[no transcript]")}</p>
                          <p style="margin-top:10px;"><strong>LLM replied:</strong> ${escapeHtml(data.llm_response || "[no reply]")}</p>`;
        // skill result: if your LLM returned anything that looks like skill text it will be in the llm_response
        const sr = document.getElementById("skillResult");
        sr.textContent = data.llm_response || "";

        // update sidebar history
        if (Array.isArray(data.history)) updateChatHistorySidebar(data.history);

        // play audio
        const audio = document.getElementById("llmAudioPlayer");
        if (data.audio_url) {
            audio.src = data.audio_url;
            try { await audio.play(); } catch(e){ console.warn("autoplay blocked", e) }
            audio.onended = ()=> setState("idle");
        } else {
            setState("idle");
        }
    } catch (err) {
        console.error("sendAudio error", err);
        alert("Conversation failed: " + (err.message || err));
        setState("idle");
    }
}

function updateChatHistorySidebar(historyArr) {
    const list = document.getElementById("historyList");
    list.innerHTML = "";
    for (let i = historyArr.length - 2; i >= 0; i -= 2) {
        const userMsg = historyArr[i] && historyArr[i].role==="user" ? historyArr[i].content : "";
        const assistantMsg = historyArr[i+1] ? historyArr[i+1].content : "";
        const li = document.createElement("li");
        li.className = "history-item";
        const snippet = userMsg.length>80 ? userMsg.slice(0,77)+"..." : userMsg;
        li.innerHTML = `<div class="meta">You</div><div class="snippet">${escapeHtml(snippet)}</div>`;
        li.addEventListener("click", ()=> {
            document.getElementById("transcript").innerHTML = `<p><strong>You said:</strong> ${escapeHtml(userMsg)}</p>
                                                               <p><strong>LLM replied:</strong> ${escapeHtml(assistantMsg)}</p>`;
        });
        list.appendChild(li);
    }
    if (historyArr.length % 2 === 1) {
        const last = historyArr[historyArr.length-1];
        if (last) {
            const li = document.createElement("li");
            li.className = "history-item";
            li.innerHTML = `<div class="meta">${escapeHtml(last.role)}</div><div class="snippet">${escapeHtml(last.content)}</div>`;
            list.insertBefore(li, list.firstChild);
        }
    }
    list.scrollTop = 0;
}

// settings modal functions
function showSettings() { document.getElementById("settingsModal").classList.remove("hidden"); loadKeysToUI(); }
function hideSettings() { document.getElementById("settingsModal").classList.add("hidden"); }
function saveKeysFromUI() {
    const keys = {
        assembly: document.getElementById("cfg_assembly").value.trim(),
        gemini: document.getElementById("cfg_gemini").value.trim(),
        murf: document.getElementById("cfg_murf").value.trim(),
        news: document.getElementById("cfg_news").value.trim()
    };
    // store locally - backend remains configured by .env for server-run
    localStorage.setItem("voiceAgentKeys", JSON.stringify(keys));
    hideSettings();
}
function loadKeysToUI() {
    const k = JSON.parse(localStorage.getItem("voiceAgentKeys") || "{}");
    document.getElementById("cfg_assembly").value = k.assembly || "";
    document.getElementById("cfg_gemini").value = k.gemini || "";
    document.getElementById("cfg_murf").value = k.murf || "";
    document.getElementById("cfg_news").value = k.news || "";
}

document.addEventListener("DOMContentLoaded", ()=>{
    initWaveform();
    SESSION_ID = getSessionFromURL();
    setState("idle");

    const toggle = document.getElementById("recordToggleBtn");
    toggle.addEventListener("click", ()=>{
        if (STATE === "idle") startRecording();
        else if (STATE === "recording") stopRecording();
    });

    document.getElementById("newChatBtn").addEventListener("click", ()=>{
        SESSION_ID = crypto.randomUUID();
        const params = new URLSearchParams(window.location.search);
        params.set("session", SESSION_ID);
        window.history.replaceState({}, "", `${location.pathname}?${params}`);
        document.getElementById("historyList").innerHTML = "";
        document.getElementById("transcript").innerHTML = `<p class="placeholder">New conversation started...</p>`;
        setState("idle");
    });

    document.getElementById("clearHistoryBtn").addEventListener("click", async ()=>{
        if (!confirm("Clear session history?")) return;
        try {
            await fetch(`/agent/clear/${SESSION_ID}`, { method: "POST" });
            document.getElementById("historyList").innerHTML = "";
            document.getElementById("transcript").innerHTML = `<p class="placeholder">History cleared.</p>`;
        } catch (e) { console.error(e); alert("Failed to clear") }
    });

    document.getElementById("settingsBtn").addEventListener("click", showSettings);
    document.getElementById("closeModalBtn").addEventListener("click", hideSettings);
    document.getElementById("saveKeysBtn").addEventListener("click", saveKeysFromUI);
});

// let recWaveform;
// let mediaRecorder;
// let audioChunks = [];
// let STATE = "idle"; // 'idle' | 'recording' | 'playing'
// let SESSION_ID = null;

// function initRecWaveform() {
//   try {
//     recWaveform = WaveSurfer.create({
//       container: '#waveformEcho',
//       waveColor: '#ff00ff',
//       progressColor: '#ff6600',
//       height: 80
//     });
//   } catch (e) { console.warn("WaveSurfer REC init failed:", e); }
// }

// function setState(next) {
//   STATE = next;
//   const btn = document.getElementById("recordToggleBtn");
//   const label = document.getElementById("recordBtnLabel");
//   const status = document.getElementById("statusText");
//   const dot = status?.querySelector(".status-dot");

//   if (!btn || !label || !status || !dot) return;

//   if (STATE === "idle") {
//     btn.classList.remove("is-recording");
//     btn.setAttribute("aria-pressed", "false");
//     label.textContent = "Start Recording";
//     status.innerHTML = `<span class="status-dot idle"></span> Idle`;
//   } else if (STATE === "recording") {
//     btn.classList.add("is-recording");
//     btn.setAttribute("aria-pressed", "true");
//     label.textContent = "Stop & Send";
//     status.innerHTML = `<span class="status-dot recording"></span> Recording...`;
//   } else if (STATE === "playing") {
//     btn.classList.remove("is-recording");
//     btn.setAttribute("aria-pressed", "false");
//     label.textContent = "Playing...";
//     status.innerHTML = `<span class="status-dot playing"></span> Playing reply`;
//   }
// }

// async function toggleRecording() {
//   if (STATE === "idle") {
//     await startRecording();
//   } else if (STATE === "recording") {
//     stopRecording();
//   }
// }

// async function startRecording() {
//   try {
//     const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
//     mediaRecorder = new MediaRecorder(stream);
//     audioChunks = [];

//     mediaRecorder.ondataavailable = (e) => {
//       if (e.data && e.data.size > 0) audioChunks.push(e.data);
//     };

//     mediaRecorder.onstop = async () => {
//       const blob = new Blob(audioChunks, { type: "audio/webm" });
//       if (recWaveform) recWaveform.load(URL.createObjectURL(blob));
//       await sendAudioToChat(blob);
//     };

//     mediaRecorder.start();
//     setState("recording");
//   } catch (err) {
//     console.error("startRecording error:", err);
//     alert("Microphone access denied or not available.");
//     setState("idle");
//   }
// }

// function stopRecording() {
//   try {
//     if (mediaRecorder && mediaRecorder.state !== "inactive") {
//       mediaRecorder.stop();
//     }
//   } catch (e) { /* no-op */ }
// }

// // ---- Session ID helper ----
// function getSessionId() {
//   const params = new URLSearchParams(window.location.search);
//   let sessionId = params.get("session");
//   if (!sessionId) {
//     sessionId = crypto.randomUUID();
//     params.set("session", sessionId);
//     window.history.replaceState({}, "", `${location.pathname}?${params}`);
//   }
//   return sessionId;
// }

// // ---- DOM Ready ----
// document.addEventListener("DOMContentLoaded", () => {
//   initRecWaveform();
//   SESSION_ID = getSessionId();

//   const toggleBtn = document.getElementById("recordToggleBtn");
//   if (toggleBtn) toggleBtn.addEventListener("click", toggleRecording);

//   const newChatBtn = document.getElementById("newChatBtn");
//   const clearHistoryBtn = document.getElementById("clearHistoryBtn");

//   if (newChatBtn) {
//     newChatBtn.addEventListener("click", () => {
//       SESSION_ID = crypto.randomUUID();
//       const params = new URLSearchParams(window.location.search);
//       params.set("session", SESSION_ID);
//       window.history.replaceState({}, "", `${location.pathname}?${params}`);
//       document.getElementById("historyList").innerHTML = "";
//       document.getElementById("transcript").innerHTML =
//         `<p class="placeholder">New conversation started...</p>`;
//       setState("idle");
//     });
//   }

//   if (clearHistoryBtn) {
//     clearHistoryBtn.addEventListener("click", async () => {
//       if (!confirm("Clear history for this session?")) return;
//       try {
//         await fetch(`/agent/clear/${SESSION_ID}`, { method: "POST" });
//         document.getElementById("historyList").innerHTML = "";
//         document.getElementById("transcript").innerHTML =
//           `<p class="placeholder">History cleared.</p>`;
//       } catch (err) {
//         console.error("Error clearing history:", err);
//       } finally {
//         setState("idle");
//       }
//     });
//   }

//   setState("idle");
// });

// // ---- Send audio via POST (Day 12–14) ----
// async function sendAudioToChat(audioBlob) {
//   const fd = new FormData();
//   const file = new File([audioBlob], `recording_${Date.now()}.webm`, { type: 'audio/webm' });
//   fd.append("file", file);

//   try {
//     const res = await fetch(`/agent/chat/${SESSION_ID}`, { method: "POST", body: fd });
//     const data = await res.json();
//     console.log("Chat response:", data);
//   } catch (err) {
//     console.error("sendAudioToChat error:", err);
//     alert("Conversation error: " + (err.message || err));
//     setState("idle");
//   }
// }

// // =============================
// // NEW: Streaming Audio (Day 16)
// // =============================
// let ws;
// let streamMediaRecorder;

// function startStreaming() {
//   ws = new WebSocket("ws://127.0.0.1:8000/ws/stream-audio");

//   ws.onopen = async () => {
//     console.log("WebSocket connected. Starting mic stream...");
//     const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
//     streamMediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });

//     streamMediaRecorder.ondataavailable = (event) => {
//       if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
//         event.data.arrayBuffer().then(buffer => {
//           ws.send(buffer);  // send binary chunk
//         });
//       }
//     };

//     streamMediaRecorder.start(250); // send every 250ms
//   };

//   ws.onclose = () => {
//     console.log("WebSocket closed.");
//   };
// }

// function stopStreaming() {
//   if (streamMediaRecorder && streamMediaRecorder.state !== "inactive") {
//     streamMediaRecorder.stop();
//   }
//   if (ws) {
//     ws.close();
//   }
// }
