/* Nexus AI Voice Platform - Client Frontend Script */

let recWaveform = null;
let mediaRecorder = null;
let audioChunks = [];
let STATE = "idle"; // 'idle' | 'recording' | 'processing' | 'playing'
let SESSION_ID = null;

// WebSocket Streaming variable
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

function switchSession(newSessionId) {
    SESSION_ID = newSessionId;
    const params = new URLSearchParams(window.location.search);
    params.set("session", SESSION_ID);
    window.history.replaceState({}, "", `${location.pathname}?${params}`);
    loadSessionHistory(SESSION_ID);
    loadSavedSessionsList();
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
                waveColor: '#a855f7',
                progressColor: '#38bdf8',
                height: 70,
                barWidth: 3,
                barGap: 3,
                barRadius: 3
            });
        }
    } catch (e) {
        console.warn("WaveSurfer init failed:", e);
    }
}

function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

function switchTab(targetTab) {
    if (!targetTab) return;

    document.querySelectorAll(".nav-tab, .nav-link").forEach(t => {
        const tabVal = t.getAttribute("data-target") || t.getAttribute("data-tab");
        if (tabVal === targetTab) {
            t.classList.add("active");
        } else {
            t.classList.remove("active");
        }
    });

    document.querySelectorAll(".page-tab").forEach(page => page.classList.remove("active-tab", "active"));
    const pageTarget = document.getElementById(`tab-${targetTab}`);
    if (pageTarget) {
        pageTarget.classList.add("active-tab", "active");
    }
    refreshIcons();
}

function setState(s, customText) {
    STATE = s;
    const btn = document.getElementById("recordToggleBtn");
    const label = document.getElementById("recordBtnLabel");
    const icon = document.getElementById("recordIcon");
    const status = document.getElementById("statusText");
    const voiceOrb = document.getElementById("voiceOrb");
    const orbStatusText = document.getElementById("orbStatusText");

    if (!btn || !label || !status) return;

    if (voiceOrb) {
        voiceOrb.classList.remove("is-listening", "is-speaking");
    }

    if (s === "idle") {
        btn.classList.remove("is-recording");
        btn.disabled = false;
        btn.setAttribute("aria-pressed", "false");
        if (label) label.textContent = "Idle";
        if (icon) icon.setAttribute("data-lucide", "mic");
        status.innerHTML = '<span class="status-dot idle"></span><span class="status-label">Idle</span>';
        if (orbStatusText) orbStatusText.textContent = "Tap recording button to start speaking...";
    } else if (s === "recording") {
        btn.classList.add("is-recording");
        btn.disabled = false;
        btn.setAttribute("aria-pressed", "true");
        if (label) label.textContent = "Listening...";
        if (icon) icon.setAttribute("data-lucide", "square");
        status.innerHTML = '<span class="status-dot recording"></span><span class="status-label">Listening...</span>';
        if (voiceOrb) voiceOrb.classList.add("is-listening");
        if (orbStatusText) orbStatusText.textContent = "Listening to your voice...";
    } else if (s === "processing") {
        btn.classList.remove("is-recording");
        btn.disabled = true;
        if (label) label.textContent = "Processing";
        if (icon) icon.setAttribute("data-lucide", "loader");
        status.innerHTML = `<span class="status-dot processing"></span><span class="status-label">${escapeHtml(customText || "Processing...")}</span>`;
        if (orbStatusText) orbStatusText.textContent = customText || "Processing your request...";
    } else if (s === "playing") {
        btn.classList.remove("is-recording");
        btn.disabled = false;
        if (label) label.textContent = "Speaking";
        if (icon) icon.setAttribute("data-lucide", "volume-2");
        status.innerHTML = '<span class="status-dot playing"></span><span class="status-label">Voice responding</span>';
        if (voiceOrb) voiceOrb.classList.add("is-speaking");
        if (orbStatusText) orbStatusText.textContent = "Voice Assistant is speaking...";
    }
    refreshIcons();
}

// Load ALL saved session threads from SQLite backend for sidebar
async function loadSavedSessionsList() {
    try {
        const res = await fetch('/agent/sessions');
        if (res.ok) {
            const data = await res.json();
            renderSidebarSessions(data.sessions || []);
        }
    } catch (err) {
        console.error("Failed to fetch sessions list:", err);
    }
}

function renderSidebarSessions(sessionsArr) {
    const list = document.getElementById("historyList");
    if (!list) return;
    list.innerHTML = "";

    if (sessionsArr.length === 0) {
        list.innerHTML = `
            <li class="history-item" style="cursor:default; text-align:center; color: var(--text-dim);">
                <div class="snippet">No saved conversations</div>
            </li>
        `;
        return;
    }

    sessionsArr.forEach(s => {
        const li = document.createElement("li");
        li.className = `history-item ${s.session_id === SESSION_ID ? 'active-session' : ''}`;
        
        const snippetText = s.last_snippet && s.last_snippet !== 'New session'
            ? (s.last_snippet.length > 55 ? s.last_snippet.slice(0, 52) + "..." : s.last_snippet)
            : 'New conversation thread';

        li.innerHTML = `
            <div class="meta">
                <span><i data-lucide="message-square" style="width:12px;height:12px;display:inline-block;vertical-align:-1px;"></i> Thread</span>
                <span class="msg-badge">${s.msg_count} msgs</span>
            </div>
            <div class="snippet">${escapeHtml(snippetText)}</div>
        `;

        li.addEventListener("click", () => {
            switchSession(s.session_id);
            switchTab("studio");
        });

        list.appendChild(li);
    });

    refreshIcons();
}

// Load session history from SQLite backend for current active session
async function loadSessionHistory(sessionId) {
    const targetSession = sessionId || SESSION_ID;
    try {
        const res = await fetch(`/agent/history/${targetSession}`);
        if (res.ok) {
            const data = await res.json();
            const history = data.history || [];
            renderTranscriptBubbles(history);

            if (history.length > 0) {
                const lastAssistant = history.filter(m => m.role === 'assistant').pop();
                if (lastAssistant) {
                    const sr = document.getElementById("skillResult");
                    sr.textContent = lastAssistant.content;
                    sr.classList.remove("placeholder-text");
                }
            } else {
                const sr = document.getElementById("skillResult");
                sr.textContent = "Press recording button and speak to receive an instant response...";
                sr.classList.add("placeholder-text");
            }
        }
    } catch (err) {
        console.error("Failed to load session history from DB:", err);
    }
}

function renderTranscriptBubbles(historyArr) {
    const tbox = document.getElementById("transcript");
    if (!tbox) return;

    if (!historyArr || historyArr.length === 0) {
        tbox.innerHTML = `
            <div class="empty-state">
                <i data-lucide="mic-off"></i>
                <p>No audio transcribed yet. Click recording above to begin.</p>
            </div>
        `;
        refreshIcons();
        return;
    }

    tbox.innerHTML = "";
    historyArr.forEach(msg => {
        const bubble = document.createElement("div");
        if (msg.role === "user") {
            bubble.className = "chat-bubble user-bubble";
            bubble.innerHTML = `
                <span class="chat-bubble-label"><i data-lucide="user"></i> You Said</span>
                <p>${escapeHtml(msg.content)}</p>
            `;
        } else {
            bubble.className = "chat-bubble assistant-bubble";
            bubble.innerHTML = `
                <span class="chat-bubble-label"><i data-lucide="bot"></i> Voice Assistant</span>
                <p>${escapeHtml(msg.content)}</p>
            `;
        }
        tbox.appendChild(bubble);
    });

    refreshIcons();
    tbox.scrollTop = tbox.scrollHeight;
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

            mediaRecorder.start(250);
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
        else if (data.status === "generating_speech") setState("processing", "Generating voice...");
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
    setState("processing", "Uploading audio...");
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
    if (Array.isArray(data.history)) {
        renderTranscriptBubbles(data.history);
    }

    const sr = document.getElementById("skillResult");
    sr.textContent = data.llm_response || "";
    sr.classList.remove("placeholder-text");

    loadSavedSessionsList();

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
    refreshIcons();
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
    loadSessionHistory(SESSION_ID);
    loadSavedSessionsList();
    setState("idle");
    refreshIcons();

    // Tab Navigation Logic
    document.querySelectorAll(".nav-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            const targetTab = tab.getAttribute("data-tab");
            switchTab(targetTab);
        });
    });

    // Hero CTA button triggers
    document.querySelectorAll(".nav-trigger").forEach(btn => {
        btn.addEventListener("click", () => {
            const targetTab = btn.getAttribute("data-target");
            if (targetTab) {
                switchTab(targetTab);
            }
        });
    });

    const toggle = document.getElementById("recordToggleBtn");
    if (toggle) {
        toggle.addEventListener("click", () => {
            if (STATE === "idle") startRecording();
            else if (STATE === "recording") stopRecording();
        });
    }

    // Prompt suggestion chips click handlers
    document.querySelectorAll(".chip-btn").forEach(chip => {
        chip.addEventListener("click", () => {
            const promptText = chip.getAttribute("data-prompt");
            if (promptText) {
                alert(`Sample prompt selected: "${promptText}". Click the circular record button to speak your prompt!`);
            }
        });
    });

    document.getElementById("newChatBtn")?.addEventListener("click", () => {
        switchSession(crypto.randomUUID());
    });

    document.getElementById("clearHistoryBtn")?.addEventListener("click", async () => {
        if (!confirm("Clear all saved conversation sessions in SQLite DB?")) return;
        try {
            await fetch(`/agent/clear-all`, { method: "POST" });
            switchSession(crypto.randomUUID());
        } catch (e) {
            console.error(e);
            alert("Failed to clear sessions");
        }
    });

    document.getElementById("settingsBtn")?.addEventListener("click", showSettings);
    document.getElementById("closeModalBtn")?.addEventListener("click", hideSettings);
    document.getElementById("saveKeysBtn")?.addEventListener("click", saveKeysFromUI);

    // Initialize 3D Particle Engines
    initParticleCubeEngine();
    initParticleOrbEngine();
    initGuideParticleEngine();
});

/* --------------------------------------------------------------------------
   3D Particle Diamond / Crystal Engine for Guide Page Hero Column
   -------------------------------------------------------------------------- */
function initGuideParticleEngine() {
    const canvas = document.getElementById("guideParticleCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;

    const PARTICLE_COUNT = 900;
    const CUBE_SIZE = 190;
    const rawParticles = [];

    // Form 3D Octahedron / Diamond / Crystal geometry
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        // Random point on 3D Octahedron surface (|x| + |y| + |z| = 1)
        let x = Math.random() * 2 - 1;
        let y = Math.random() * 2 - 1;
        let z = Math.random() * 2 - 1;

        const norm = Math.abs(x) + Math.abs(y) + Math.abs(z);
        if (norm > 0) {
            x = (x / norm) * CUBE_SIZE;
            y = (y / norm) * CUBE_SIZE;
            z = (z / norm) * CUBE_SIZE;
        }

        const colors = ["#d946ef", "#a855f7", "#38bdf8", "#ffffff", "#f472b6"];
        rawParticles.push({
            tx: x,
            ty: y,
            tz: z,

            // Scattered position for spring physics
            x: (Math.random() - 0.5) * 600,
            y: (Math.random() - 0.5) * 600,
            z: (Math.random() - 0.5) * 600,

            vx: 0,
            vy: 0,
            vz: 0,

            size: Math.random() * 2.2 + 1.2,
            color: colors[Math.floor(Math.random() * colors.length)]
        });
    }

    let rotX = 0.4;
    let rotY = 0.4;
    let mouseX = -9999;
    let mouseY = -9999;
    let isExploding = false;

    canvas.addEventListener("mousemove", (e) => {
        const rect = canvas.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;
    });

    canvas.addEventListener("mouseleave", () => {
        mouseX = -9999;
        mouseY = -9999;
    });

    canvas.addEventListener("click", () => {
        isExploding = true;
        rawParticles.forEach(p => {
            p.vx = (Math.random() - 0.5) * 35;
            p.vy = (Math.random() - 0.5) * 35;
            p.vz = (Math.random() - 0.5) * 35;
        });
        setTimeout(() => { isExploding = false; }, 1200);
    });

    function render() {
        ctx.clearRect(0, 0, width, height);

        rotY += 0.012;
        rotX += 0.006;

        const cosY = Math.cos(rotY);
        const sinY = Math.sin(rotY);
        const cosX = Math.cos(rotX);
        const sinX = Math.sin(rotX);

        const projected = [];

        rawParticles.forEach(p => {
            // Rotate 3D target coordinates
            let rx = p.tx * cosY - p.tz * sinY;
            let rz = p.tx * sinY + p.tz * cosY;

            let ry = p.ty * cosX - rz * sinX;
            rz = p.ty * sinX + rz * cosX;

            if (!isExploding) {
                p.vx += (rx - p.x) * 0.05;
                p.vy += (ry - p.y) * 0.05;
                p.vz += (rz - p.z) * 0.05;

                p.vx *= 0.85;
                p.vy *= 0.85;
                p.vz *= 0.85;
            }

            p.x += p.vx;
            p.y += p.vy;
            p.z += p.vz;

            const perspective = 550 / (550 + p.z);
            const sx = centerX + p.x * perspective;
            const sy = centerY + p.y * perspective;

            // Mouse dispersion forcefield
            const dx = sx - mouseX;
            const dy = sy - mouseY;
            const dist = Math.hypot(dx, dy);
            const forceRadius = 130;

            let finalSx = sx;
            let finalSy = sy;

            if (dist < forceRadius && dist > 0) {
                const force = (1 - dist / forceRadius) * 40;
                finalSx += (dx / dist) * force;
                finalSy += (dy / dist) * force;
            }

            projected.push({
                sx: finalSx,
                sy: finalSy,
                size: p.size * perspective,
                color: p.color,
                alpha: Math.min(1, Math.max(0.18, perspective * 0.85)),
                z: p.z
            });
        });

        projected.sort((a, b) => b.z - a.z);

        // Constellation mesh lines
        ctx.lineWidth = 0.5;
        for (let i = 0; i < projected.length; i += 8) {
            const p1 = projected[i];
            for (let j = i + 1; j < projected.length; j += 16) {
                const p2 = projected[j];
                const d = Math.hypot(p1.sx - p2.sx, p1.sy - p2.sy);
                if (d < 38) {
                    ctx.strokeStyle = `rgba(217, 70, 239, ${0.22 * (1 - d / 38)})`;
                    ctx.beginPath();
                    ctx.moveTo(p1.sx, p1.sy);
                    ctx.lineTo(p2.sx, p2.sy);
                    ctx.stroke();
                }
            }
        }

        // Draw particles
        projected.forEach(p => {
            ctx.save();
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = p.color;
            ctx.shadowBlur = 10;
            ctx.shadowColor = p.color;

            ctx.beginPath();
            ctx.arc(p.sx, p.sy, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });

        requestAnimationFrame(render);
    }

    render();
}

/* --------------------------------------------------------------------------
   3D Dual-Particle Engine (Inner Core Ball & Outer Orbiting Shell)
   -------------------------------------------------------------------------- */
function initParticleOrbEngine() {
    const canvas = document.getElementById("particleOrbCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;

    const INNER_COUNT = 320;
    const INNER_RADIUS = 68;

    const OUTER_COUNT = 360;
    const OUTER_RADIUS = 140;

    const particles = [];
    const goldenRatio = (1 + Math.sqrt(5)) / 2;

    // 1. Inner Core Particles (Swirling 3D Core Sphere)
    for (let i = 0; i < INNER_COUNT; i++) {
        const theta = (2 * Math.PI * i) / goldenRatio;
        const phi = Math.acos(1 - (2 * (i + 0.5)) / INNER_COUNT);

        particles.push({
            type: "inner",
            r: INNER_RADIUS * (0.4 + 0.6 * Math.random()),
            nx: Math.sin(phi) * Math.cos(theta),
            ny: Math.sin(phi) * Math.sin(theta),
            nz: Math.cos(phi),
            radius: Math.random() * 2.5 + 1.2,
            baseColor: i % 2 === 0 ? "#f472b6" : "#d946ef"
        });
    }

    // 2. Outer Orbiting Ring Shell Particles
    for (let i = 0; i < OUTER_COUNT; i++) {
        const theta = (2 * Math.PI * i) / goldenRatio;
        const phi = Math.acos(1 - (2 * (i + 0.5)) / OUTER_COUNT);

        particles.push({
            type: "outer",
            r: OUTER_RADIUS,
            nx: Math.sin(phi) * Math.cos(theta),
            ny: Math.sin(phi) * Math.sin(theta),
            nz: Math.cos(phi),
            radius: Math.random() * 2 + 1,
            baseColor: i % 3 === 0 ? "#d946ef" : (i % 3 === 1 ? "#38bdf8" : "#a855f7")
        });
    }

    let angleX = 0;
    let angleY = 0;
    let pulseOffset = 0;

    function render() {
        ctx.clearRect(0, 0, width, height);

        // State dependent speed & pulse
        let rotSpeed = 0.014;
        let targetPulse = 0;
        let activeColorOverride = null;

        if (STATE === "recording") {
            rotSpeed = 0.038;
            targetPulse = Math.sin(Date.now() * 0.012) * 22 + 12;
            activeColorOverride = "#f43f5e";
        } else if (STATE === "speaking") {
            rotSpeed = 0.028;
            targetPulse = Math.cos(Date.now() * 0.009) * 16;
            activeColorOverride = "#38bdf8";
        }

        pulseOffset += (targetPulse - pulseOffset) * 0.1;
        angleY += rotSpeed;
        angleX += rotSpeed * 0.5;

        const cosY = Math.cos(angleY);
        const sinY = Math.sin(angleY);
        const cosX = Math.cos(angleX);
        const sinX = Math.sin(angleX);

        // Ambient center core radial light gradient
        const coreGrad = ctx.createRadialGradient(centerX, centerY, 5, centerX, centerY, INNER_RADIUS + 30);
        coreGrad.addColorStop(0, "rgba(244, 114, 182, 0.45)");
        coreGrad.addColorStop(0.6, "rgba(217, 70, 239, 0.25)");
        coreGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(centerX, centerY, INNER_RADIUS + 30, 0, Math.PI * 2);
        ctx.fill();

        const projected = [];

        particles.forEach(p => {
            const currentR = p.type === "outer" ? (p.r + pulseOffset) : (p.r + pulseOffset * 0.3);
            const px = p.nx * currentR;
            const py = p.ny * currentR;
            const pz = p.nz * currentR;

            // Reverse rotation for inner core vs outer ring
            const dir = p.type === "inner" ? -1.5 : 1.0;
            const ay = angleY * dir;
            const ax = angleX * dir;

            const cY = Math.cos(ay);
            const sY = Math.sin(ay);
            const cX = Math.cos(ax);
            const sX = Math.sin(ax);

            // Rotate Y
            let rx = px * cY - pz * sY;
            let rz = px * sY + pz * cY;

            // Rotate X
            let ry = py * cX - rz * sX;
            rz = py * sX + rz * cX;

            const perspective = 420 / (420 + rz);
            const sx = centerX + rx * perspective;
            const sy = centerY + ry * perspective;

            projected.push({
                sx,
                sy,
                type: p.type,
                radius: Math.max(0.6, p.radius * perspective),
                color: activeColorOverride || p.baseColor,
                alpha: Math.min(1, Math.max(0.2, perspective * (p.type === "inner" ? 0.95 : 0.85))),
                z: rz
            });
        });

        projected.sort((a, b) => b.z - a.z);

        // Draw connecting particle constellation lines
        ctx.lineWidth = 0.6;
        for (let i = 0; i < projected.length; i += 6) {
            const p1 = projected[i];
            for (let j = i + 1; j < projected.length; j += 14) {
                const p2 = projected[j];
                if (p1.type === p2.type) {
                    const d = Math.hypot(p1.sx - p2.sx, p1.sy - p2.sy);
                    const maxDist = p1.type === "inner" ? 30 : 42;
                    if (d < maxDist) {
                        ctx.strokeStyle = `rgba(217, 70, 239, ${0.3 * (1 - d / maxDist)})`;
                        ctx.beginPath();
                        ctx.moveTo(p1.sx, p1.sy);
                        ctx.lineTo(p2.sx, p2.sy);
                        ctx.stroke();
                    }
                }
            }
        }

        // Draw glowing particles
        projected.forEach(p => {
            ctx.save();
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = p.color;
            ctx.shadowBlur = p.type === "inner" ? 14 : 10;
            ctx.shadowColor = p.color;

            ctx.beginPath();
            ctx.arc(p.sx, p.sy, p.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });

        requestAnimationFrame(render);
    }

    render();
}

/* --------------------------------------------------------------------------
   3D Particle Assembly & Continuous Rotating Cube Canvas Engine
   -------------------------------------------------------------------------- */
function initParticleCubeEngine() {
    const canvas = document.getElementById("particleCubeCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;

    const PARTICLE_COUNT = 1250; // Massively increased particle count!
    const CUBE_SIZE = 210;       // Much bigger 3D cube bounding box!

    const particles = [];
    const cubeVertices = [];

    // Create 3D target coordinates for the 6 faces of a dense solid isometric cube grid
    const steps = 13;
    const half = CUBE_SIZE / 2;

    for (let i = 0; i <= steps; i++) {
        for (let j = 0; j <= steps; j++) {
            const u = (i / steps - 0.5) * CUBE_SIZE;
            const v = (j / steps - 0.5) * CUBE_SIZE;

            // Top & Bottom faces
            cubeVertices.push({ x: u, y: -half, z: v });
            cubeVertices.push({ x: u, y: half, z: v });

            // Front & Back faces
            cubeVertices.push({ x: u, y: v, z: -half });
            cubeVertices.push({ x: u, y: v, z: half });

            // Left & Right faces
            cubeVertices.push({ x: -half, y: u, z: v });
            cubeVertices.push({ x: half, y: u, z: v });
        }
    }

    const colors = [
        "#d946ef", // Electric Magenta
        "#a855f7", // Glowing Purple
        "#38bdf8", // Neon Cyan
        "#ffffff", // Starburst White
        "#f472b6", // Hot Pink
        "#c084fc"  // Soft Violet
    ];

    // Initialize 1,250 particles floating randomly in ambient 3D space
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const target = cubeVertices[i % cubeVertices.length];
        particles.push({
            // Current 3D position (spawn scattered in space)
            x: (Math.random() - 0.5) * 800,
            y: (Math.random() - 0.5) * 800,
            z: (Math.random() - 0.5) * 800,

            // Base Target 3D Position in cube frame
            tx: target.x,
            ty: target.y,
            tz: target.z,

            // Velocity
            vx: 0,
            vy: 0,
            vz: 0,

            // Styling
            color: colors[Math.floor(Math.random() * colors.length)],
            radius: Math.random() * 2.4 + 1.2,
            alpha: Math.random() * 0.5 + 0.5
        });
    }

    let angleX = 0.3;
    let angleY = 0.5;
    let mouseX = -1000;
    let mouseY = -1000;
    let isHovered = false;

    // Track Mouse Coordinates on Canvas
    canvas.addEventListener("mousemove", (e) => {
        const rect = canvas.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;
        isHovered = true;
    });

    canvas.addEventListener("mouseleave", () => {
        mouseX = -1000;
        mouseY = -1000;
        isHovered = false;
    });

    canvas.addEventListener("click", () => {
        // Supernova explosion burst effect on click
        particles.forEach(p => {
            p.vx += (Math.random() - 0.5) * 45;
            p.vy += (Math.random() - 0.5) * 45;
            p.vz += (Math.random() - 0.5) * 45;
        });
    });

    function render() {
        ctx.clearRect(0, 0, width, height);

        // Update rotation angles continuously
        angleY += isHovered ? 0.024 : 0.012;
        angleX += 0.006;

        const cosY = Math.cos(angleY);
        const sinY = Math.sin(angleY);
        const cosX = Math.cos(angleX);
        const sinX = Math.sin(angleX);

        // Render ambient core light aura
        const radGrad = ctx.createRadialGradient(centerX, centerY, 10, centerX, centerY, 220);
        radGrad.addColorStop(0, "rgba(217, 70, 239, 0.32)");
        radGrad.addColorStop(0.5, "rgba(168, 85, 247, 0.15)");
        radGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = radGrad;
        ctx.beginPath();
        ctx.arc(centerX, centerY, 220, 0, Math.PI * 2);
        ctx.fill();

        // Projected 2D particles array for z-sorting
        const projectedParticles = [];

        particles.forEach(p => {
            // 1. Rotate 3D target coordinates
            let rx = p.tx * cosY - p.tz * sinY;
            let rz = p.tx * sinY + p.tz * cosY;
            let ry = p.ty * cosX - rz * sinX;
            rz = p.ty * sinX + rz * cosX;

            // 2. Spring Physics towards rotated 3D target (Assembly Action)
            const dx = rx - p.x;
            const dy = ry - p.y;
            const dz = rz - p.z;

            p.vx = p.vx * 0.84 + dx * 0.04;
            p.vy = p.vy * 0.84 + dy * 0.04;
            p.vz = p.vz * 0.84 + dz * 0.04;

            p.x += p.vx;
            p.y += p.vy;
            p.z += p.vz;

            // 3. Perspective Projection to 2D Screen
            const perspective = 550 / (550 + p.z);
            const sx = centerX + p.x * perspective;
            const sy = centerY + p.y * perspective;

            // 4. Interactive Mouse Dispersion Force
            if (isHovered) {
                const mdx = sx - mouseX;
                const mdy = sy - mouseY;
                const mdist = Math.sqrt(mdx * mdx + mdy * mdy);
                if (mdist < 140) {
                    const force = (140 - mdist) * 0.18;
                    p.vx += (mdx / mdist) * force;
                    p.vy += (mdy / mdist) * force;
                }
            }

            projectedParticles.push({
                sx,
                sy,
                radius: Math.max(0.6, p.radius * perspective),
                color: p.color,
                alpha: Math.min(1, Math.max(0.2, perspective * p.alpha)),
                z: p.z
            });
        });

        // Sort by Z for realistic 3D depth rendering
        projectedParticles.sort((a, b) => b.z - a.z);

        // Draw connecting 3D particle constellation lines
        ctx.lineWidth = 0.5;
        for (let i = 0; i < projectedParticles.length; i += 8) {
            const p1 = projectedParticles[i];
            for (let j = i + 1; j < projectedParticles.length; j += 18) {
                const p2 = projectedParticles[j];
                const dist2d = Math.hypot(p1.sx - p2.sx, p1.sy - p2.sy);
                if (dist2d < 50) {
                    ctx.strokeStyle = `rgba(217, 70, 239, ${0.3 * (1 - dist2d / 50)})`;
                    ctx.beginPath();
                    ctx.moveTo(p1.sx, p1.sy);
                    ctx.lineTo(p2.sx, p2.sy);
                    ctx.stroke();
                }
            }
        }

        // Draw glowing particles
        projectedParticles.forEach(p => {
            ctx.save();
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = p.color;
            ctx.shadowBlur = 14;
            ctx.shadowColor = p.color;

            ctx.beginPath();
            ctx.arc(p.sx, p.sy, p.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });

        requestAnimationFrame(render);
    }

    render();
}

