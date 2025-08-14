// let ttsWaveform, recWaveform;
// let mediaRecorder;
// let audioChunks = [];

// function initTTSWaveform() {
//   ttsWaveform = WaveSurfer.create({
//     container: "#waveformTTS",
//     waveColor: "#ff00ff",
//     progressColor: "#ff6600",
//     height: 60,
//   });
// }

// function initRecWaveform() {
//   recWaveform = WaveSurfer.create({
//     container: "#waveformEcho",
//     waveColor: "#ff00ff",
//     progressColor: "#ff6600",
//     height: 80,
//   });
// }

// // DOM Ready==
// document.addEventListener("DOMContentLoaded", () => {
//   initTTSWaveform();
//   initRecWaveform();

// //   document.getElementById("startBtn").addEventListener("click", startRecording);
// //   document.getElementById("stopBtn").addEventListener("click", stopRecording);
//   document
//     .getElementById("clearHistoryBtn")
//     .addEventListener("click", clearChatHistory);
//   document.getElementById("generateBtn").addEventListener("click", sendText);
// });

// // Generate TTS (text input)
// async function sendText() {
//   const text = document.getElementById("textInput").value.trim();
//   const language = document.getElementById("languageSelect").value;

//   if (!text) {
//     alert("Please enter some text.");
//     return;
//   }

//   try {
//     const formData = new FormData();
//     formData.append("text", text);
//     formData.append("language_code", language);

//     const response = await fetch("/generate-tts", {
//       method: "POST",
//       body: formData,
//     });

//     if (!response.ok) throw new Error(await response.text());
//     const data = await response.json();

//     const audio = document.getElementById("audioPlayer");
//     const audioSource = document.getElementById("audioSource");
//     audioSource.src = data.audio_url;
//     audio.load();
//     audio.play();
//     ttsWaveform.load(data.audio_url);
//   } catch (err) {
//     console.error("TTS Error:", err);
//     alert("Voice generation failed.");
//   }
// }

// =============================
// Day 12: single toggle record button
// =============================
let recWaveform;
let mediaRecorder;
let audioChunks = [];
let STATE = "idle"; // 'idle' | 'recording' | 'playing'
let SESSION_ID = null;

function initRecWaveform() {
  try {
    recWaveform = WaveSurfer.create({
      container: '#waveformEcho',
      waveColor: '#ff00ff',
      progressColor: '#ff6600',
      height: 80
    });
  } catch (e) { console.warn("WaveSurfer REC init failed:", e); }
}

function setState(next) {
  STATE = next;
  const btn = document.getElementById("recordToggleBtn");
  const label = document.getElementById("recordBtnLabel");
  const status = document.getElementById("statusText");
  const dot = status?.querySelector(".status-dot");

  if (!btn || !label || !status || !dot) return;

  if (STATE === "idle") {
    btn.classList.remove("is-recording");
    btn.setAttribute("aria-pressed", "false");
    label.textContent = "Start Recording";
    status.innerHTML = `<span class="status-dot idle"></span> Idle`;
  } else if (STATE === "recording") {
    btn.classList.add("is-recording");
    btn.setAttribute("aria-pressed", "true");
    label.textContent = "Stop & Send";
    status.innerHTML = `<span class="status-dot recording"></span> Recording...`;
  } else if (STATE === "playing") {
    btn.classList.remove("is-recording");
    btn.setAttribute("aria-pressed", "false");
    label.textContent = "Playing...";
    status.innerHTML = `<span class="status-dot playing"></span> Playing reply`;
  }
}

async function toggleRecording() {
  if (STATE === "idle") {
    await startRecording();
  } else if (STATE === "recording") {
    stopRecording();
  }
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      const blob = new Blob(audioChunks, { type: "audio/webm" });
      if (recWaveform) recWaveform.load(URL.createObjectURL(blob));
      await sendAudioToChat(blob);
    };

    mediaRecorder.start();
    setState("recording");
  } catch (err) {
    console.error("startRecording error:", err);
    alert("Microphone access denied or not available.");
    setState("idle");
  }
}

function stopRecording() {
  try {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
  } catch (e) { /* no-op */ }
}

// ---- session id helper (unchanged if you already have it) ----
function getSessionId() {
  const params = new URLSearchParams(window.location.search);
  let sessionId = params.get("session");
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    params.set("session", sessionId);
    window.history.replaceState({}, "", `${location.pathname}?${params}`);
  }
  return sessionId;
}

// ---- DOM Ready ----
document.addEventListener("DOMContentLoaded", () => {
  initRecWaveform();

  SESSION_ID = getSessionId();

  const toggleBtn = document.getElementById("recordToggleBtn");
  if (toggleBtn) toggleBtn.addEventListener("click", toggleRecording);

  // keep your existing New Chat / Clear History listeners
  const newChatBtn = document.getElementById("newChatBtn");
  const clearHistoryBtn = document.getElementById("clearHistoryBtn");

  if (newChatBtn) {
    newChatBtn.addEventListener("click", () => {
      SESSION_ID = crypto.randomUUID();
      const params = new URLSearchParams(window.location.search);
      params.set("session", SESSION_ID);
      window.history.replaceState({}, "", `${location.pathname}?${params}`);
      document.getElementById("historyList").innerHTML = "";
      document.getElementById("transcript").innerHTML =
        `<p class="placeholder">New conversation started...</p>`;
      setState("idle");
    });
  }

  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener("click", async () => {
      if (!confirm("Clear history for this session?")) return;
      try {
        await fetch(`/agent/clear/${SESSION_ID}`, { method: "POST" });
        document.getElementById("historyList").innerHTML = "";
        document.getElementById("transcript").innerHTML =
          `<p class="placeholder">History cleared.</p>`;
      } catch (err) {
        console.error("Error clearing history:", err);
      } finally {
        setState("idle");
      }
    });
  }

  setState("idle");
});

// ---- sendAudioToChat (reuse your working version; only minor tweaks below) ----
async function sendAudioToChat(audioBlob) {
  const fd = new FormData();
  const file = new File([audioBlob], `recording_${Date.now()}.webm`, { type: 'audio/webm' });
  fd.append("file", file);

  try {
    const res = await fetch(`/agent/chat/${SESSION_ID}`, { method: "POST", body: fd });
    if (!res.ok) {
      const txt = await res.text().catch(()=>null);
      throw new Error(txt || `Server returned ${res.status}`);
    }
    const data = await res.json();

    // update transcript
    const transcriptBox = document.getElementById("transcript");
    transcriptBox.innerHTML = `
      <p><strong>You said:</strong> ${escapeHtml(data.transcript || "[no transcript]")}</p>
      <p><strong>LLM replied:</strong> ${escapeHtml(data.llm_response || "[no reply]")}</p>
    `;

    // update sidebar
    if (Array.isArray(data.history)) updateChatHistorySidebar(data.history);

    // play LLM audio automatically
    const audioPlayer = document.getElementById("llmAudioPlayer");
    if (data.audio_url) {
      audioPlayer.src = data.audio_url;
      setState("playing");
      try { await audioPlayer.play(); } catch (e) { console.warn("Autoplay blocked:", e); setState("idle"); }
      audioPlayer.onended = () => {
        setState("idle");
        // optional: auto re-start for next user turn
        setTimeout(() => startRecording(), 250);
      };
    } else {
      setState("idle");
      console.warn("No audio URL returned from server.");
    }
  } catch (err) {
    console.error("sendAudioToChat error:", err);
    alert("Conversation error: " + (err.message || err));
    setState("idle");
  }
}

// ---- utilities: history + xss-escape (use your existing working ones) ----
function updateChatHistorySidebar(historyArr) {
  const list = document.getElementById("historyList");
  list.innerHTML = "";

  for (let i = historyArr.length - 2; i >= 0; i -= 2) {
    const userMsg = historyArr[i] && historyArr[i].role === "user" ? historyArr[i].content : "";
    const assistantMsg = historyArr[i+1] ? historyArr[i+1].content : "";

    const li = document.createElement("li");
    li.className = "history-item";
    const snippet = userMsg.length > 80 ? userMsg.slice(0,77) + "..." : userMsg;
    li.innerHTML = `<div class="meta">You</div><div class="snippet">${escapeHtml(snippet)}</div>`;
    li.addEventListener("click", () => {
      document.getElementById("transcript").innerHTML = `
        <p><strong>You said:</strong> ${escapeHtml(userMsg)}</p>
        <p><strong>LLM replied:</strong> ${escapeHtml(assistantMsg)}</p>
      `;
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

  list.scrollTop = 0;
}

function escapeHtml(unsafe) {
  if (!unsafe) return "";
  return String(unsafe)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


// Recording helpers
// async function startRecording() {
//   try {
//     const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
//     mediaRecorder = new MediaRecorder(stream);
//     audioChunks = [];

//     mediaRecorder.ondataavailable = (event) => {
//       if (event.data.size > 0) audioChunks.push(event.data);
//     };

//     mediaRecorder.onstop = async () => {
//       const blob = new Blob(audioChunks, { type: "audio/webm" });
//       recWaveform.load(URL.createObjectURL(blob));
//       await sendAudioToChat(blob);
//     };

//     mediaRecorder.start();
//     console.log("Recording started");
//     document.getElementById("startBtn").disabled = true;
//     document.getElementById("stopBtn").disabled = false;
//   } catch (err) {
//     console.error("Recording Error:", err);
//     alert("Could not start recording");
//   }
// }

// function stopRecording() {
//   if (mediaRecorder && mediaRecorder.state !== "inactive") {
//     mediaRecorder.stop();
//     console.log("Recording stopped");
//   }
//   document.getElementById("startBtn").disabled = false;
//   document.getElementById("stopBtn").disabled = true;
// }



// Session ID
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
// const SESSION_ID = getSessionId();

// // Send audio to conversational bot
// async function sendAudioToChat(audioBlob) {
//   const formData = new FormData();
//   formData.append("file", audioBlob, "recording.webm");

//   try {
//     const res = await fetch(`/agent/chat/${SESSION_ID}`, {
//       method: "POST",
//       body: formData,
//     });

//     if (!res.ok) throw new Error(await res.text());
//     const data = await res.json();
//     const transcriptBox = document.getElementById("transcript");
//     transcriptBox.innerHTML = `
//             <p><strong>You said:</strong> ${escapeHtml(
//               data.transcript || "[No transcript]"
//             )}</p>
//             <p><strong>LLM replied:</strong> ${escapeHtml(
//               data.llm_response || "[No reply]"
//             )}</p>
//         `;
//     if (Array.isArray(data.history)) updateChatHistorySidebar(data.history);
//     const audioPlayer = document.getElementById("llmAudioPlayer");

//     // second error find - Ishnia -> if audio_url is undefined then .play() will give error
//     try {
//       if (data.audio_url) {
//         audioPlayer.src = data.audio_url;
//         await audioPlayer.play();
//       } else {
//         console.warn("No audio URL returned from server.");
//       }
//     } catch (err) {
//       console.warn("Autoplay failed:", err);
//     }
//     audioPlayer.onended = () => {
//       console.log("Bot finished speaking. Restarting recording...");
//       setTimeout(() => startRecording(), 300);
//     };
//   } catch (err) {
//     console.error("Error in sendAudioToChat:", err);
//     alert("Error: " + (err.message || err));
//   } finally {
//     document.getElementById("startBtn").disabled = false;
//     document.getElementById("stopBtn").disabled = true;
//   }
// }

// // Clear chat history
// function clearChatHistory() {
//   const session = SESSION_ID;
//   if (confirm("Clear chat history for this session?")) {
//     fetch(`/agent/clear/${session}`, { method: "POST" }).catch(() => {});
//     document.getElementById("historyList").innerHTML = "";
//     //1st -  here the html should be in single or double inverted comma
//     document.getElementById("transcript").innerHTML =
//       '<p class="placeholder">Your transcription will appear here...</p>';
//   }
// }

// // Update Chat History Sidebar
// function updateChatHistorySidebar(historyArr) {
//   const list = document.getElementById("historyList");
//   list.innerHTML = "";

//   for (let i = historyArr.length - 2; i >= 0; i -= 2) {
//     const userMsg =
//       historyArr[i] && historyArr[i].role === "user"
//         ? historyArr[i].content
//         : "";
//     const assistantMsg = historyArr[i + 1] ? historyArr[i + 1].content : "";

//     const item = document.createElement("li");
//     item.className = "history-item";
//     const snippet =
//       userMsg.length > 60 ? userMsg.slice(0, 57) + "..." : userMsg;
//     item.innerHTML = `<div class="meta">You</div><div class="snippet">${escapeHtml(
//       snippet
//     )}</div>`;

//     item.addEventListener("click", () => {
//       document.getElementById("transcript").innerHTML = `
//                 <p><strong>You said:</strong> ${escapeHtml(userMsg)}</p>
//                 <p><strong>LLM replied:</strong> ${escapeHtml(assistantMsg)}</p>
//             `;
//     });

//     list.appendChild(item);
//   }
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
// // WaveSurfer Instances
// // =============================
// let ttsWaveform, recWaveform;
// let mediaRecorder;
// let audioChunks = [];

// // Init WaveSurfer for TTS
// function initTTSWaveform() {
//     ttsWaveform = WaveSurfer.create({
//         container: '#waveformTTS',
//         waveColor: '#ff00ff',
//         progressColor: '#ff6600',
//         height: 60
//     });
// }

// // Init WaveSurfer for Recording
// function initRecWaveform() {
//     recWaveform = WaveSurfer.create({
//         container: '#waveformEcho',
//         waveColor: '#ff00ff',
//         progressColor: '#ff6600',
//         height: 80
//     });
// }

// document.addEventListener("DOMContentLoaded", () => {
//     initTTSWaveform();
//     initRecWaveform();

//     // wire up buttons
//     document.getElementById("startBtn").addEventListener("click", startRecording);
//     document.getElementById("stopBtn").addEventListener("click", stopRecording);
//     document.getElementById("clearHistoryBtn").addEventListener("click", () => {
//         const params = new URLSearchParams(window.location.search);
//         const session = params.get("session") || "no-session";
//         if (confirm("Clear chat history for this session?")) {
//             fetch(`/agent/clear/${session}`, { method: "POST" }).catch(()=>{});
//             document.getElementById("historyList").innerHTML = "";
//             document.getElementById("transcript").innerHTML = `<p class="placeholder">Your transcription will appear here...</p>`;
//         }
//     });
// });

// // =============================
// // Generate TTS (text input)
// // =============================
// async function sendText() {
//     const text = document.getElementById("textInput").value.trim();
//     const language = document.getElementById("languageSelect").value;

//     if (!text) {
//         alert("Please enter some text.");
//         return;
//     }

//     try {
//         const response = await fetch("/generate-tts", {
//             method: "POST",
//             headers: { "Content-Type": "application/json" },
//             body: JSON.stringify({
//                 text: text,
//                 language_code: language
//             })
//         });

//         if (!response.ok) throw new Error(await response.text());
//         const data = await response.json();

//         const audio = document.getElementById("audioPlayer");
//         const audioSource = document.getElementById("audioSource");
//         audioSource.src = data.audio_url;
//         audio.load();
//         audio.play();
//         ttsWaveform.load(data.audio_url);

//     } catch (err) {
//         console.error("TTS Error:", err);
//         alert("Voice generation failed.");
//     }
// }

// // =============================
// // Recording helpers
// // =============================
// async function startRecording() {
//     try {
//         const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
//         mediaRecorder = new MediaRecorder(stream);
//         audioChunks = [];

//         mediaRecorder.ondataavailable = event => {
//             if (event.data.size > 0) audioChunks.push(event.data);
//         };

//         mediaRecorder.onstop = async () => {
//             const blob = new Blob(audioChunks, { type: "audio/webm" });
//             // show waveform
//             recWaveform.load(URL.createObjectURL(blob));

//             // send to conversational chat endpoint
//             await sendAudioToChat(blob);
//         };

//         mediaRecorder.start();
//         console.log("Recording started");
//         document.getElementById("startBtn").disabled = true;
//         document.getElementById("stopBtn").disabled = false;
//     } catch (err) {
//         console.error("Recording Error:", err);
//         alert("Could not start recording");
//     }
// }

// function stopRecording() {
//     if (mediaRecorder && mediaRecorder.state !== "inactive") {
//         mediaRecorder.stop();
//         console.log("Recording stopped");
//     }
//     document.getElementById("startBtn").disabled = false;
//     document.getElementById("stopBtn").disabled = true;
// }

// // =============================
// // Session ID (persist in URL)
// // =============================
// function getSessionId() {
//     const params = new URLSearchParams(window.location.search);
//     let sessionId = params.get("session");
//     if (!sessionId) {
//         sessionId = crypto.randomUUID();
//         params.set("session", sessionId);
//         window.history.replaceState({}, "", `${location.pathname}?${params}`);
//     }
//     return sessionId;
// }
// const SESSION_ID = getSessionId();

// // =============================
// // Send audio to conversational bot (Day 10 pipeline)
// // =============================
// async function sendAudioToChat(audioBlob) {
//     const formData = new FormData();
//     formData.append("file", audioBlob, "recording.webm");

//     try {
//         const res = await fetch(`/agent/chat/${SESSION_ID}`, {
//             method: "POST",
//             body: formData
//         });

//         if (!res.ok) {
//             const txt = await res.text();
//             throw new Error(txt || "Failed to process chat audio");
//         }

//         const data = await res.json();

//         // Update transcription box once (single place)
//         const transcriptBox = document.getElementById("transcript");
//         transcriptBox.innerHTML = `
//             <p><strong>You said:</strong> ${escapeHtml(data.transcript || "[No transcript]")}</p>
//             <p><strong>LLM replied:</strong> ${escapeHtml(data.llm_response || "[No reply]")}</p>
//         `;

//         // Update chat history sidebar
//         if (Array.isArray(data.history)) updateChatHistorySidebar(data.history);

//         // Play LLM audio then auto-restart recording
//         const audioPlayer = document.getElementById("llmAudioPlayer");
//         audioPlayer.src = data.audio_url || "";
//         try {
//             await audioPlayer.play();
//         } catch (err) {
//             console.warn("Autoplay failed, user interaction required:", err);
//         }

//         // when bot finishes speaking — restart recording automatically
//         audioPlayer.onended = () => {
//             console.log("Bot finished speaking. Restarting recording...");
//             // small delay to ensure loop isn't too tight
//             setTimeout(() => startRecording(), 300);
//         };

//     } catch (err) {
//         console.error("Error in sendAudioToChat:", err);
//         alert("Error: " + (err.message || err));
//     } finally {
//         // re-enable start/stop buttons in case
//         document.getElementById("startBtn").disabled = false;
//         document.getElementById("stopBtn").disabled = true;
//     }
// }

// // =============================
// // Update Chat History Sidebar (Newest first)
// // history is expected as an array: [{role:"user", content:"..."}, {role:"assistant", content:"..."}, ...]
// // We'll show clickable "rounds" (user + assistant)
// function updateChatHistorySidebar(historyArr) {
//     const list = document.getElementById("historyList");
//     list.innerHTML = ""; // clear

//     // build rounds in reverse: newest pair at top
//     for (let i = historyArr.length - 2; i >= 0; i -= 2) {
//         const userMsg = historyArr[i] && historyArr[i].role === "user" ? historyArr[i].content : "";
//         const assistantMsg = historyArr[i + 1] ? historyArr[i + 1].content : "";

//         const item = document.createElement("li");
//         item.className = "history-item";
//         const snippet = userMsg.length > 60 ? userMsg.slice(0, 57) + "..." : userMsg;
//         item.innerHTML = `<div class="meta">You</div><div class="snippet">${escapeHtml(snippet)}</div>`;

//         // Click to load full transcript
//         item.addEventListener("click", () => {
//             document.getElementById("transcript").innerHTML = `
//                 <p><strong>You said:</strong> ${escapeHtml(userMsg)}</p>
//                 <p><strong>LLM replied:</strong> ${escapeHtml(assistantMsg)}</p>
//             `;
//         });

//         list.appendChild(item);
//     }
// }

// // small util to avoid XSS when inserting text
// function escapeHtml(unsafe) {
//     if (!unsafe) return "";
//     return String(unsafe)
//         .replaceAll("&", "&amp;")
//         .replaceAll("<", "&lt;")
//         .replaceAll(">", "&gt;")
//         .replaceAll('"', "&quot;")
//         .replaceAll("'", "&#039;");
// }

