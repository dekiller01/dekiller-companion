const $ = (id) => document.getElementById(id);
const messages = $("messages");
const input = $("messageInput");
const sendButton = $("sendButton");
const statusText = $("status");
const memoryDialog = $("memoryDialog");
const micButton = $("micButton");
const voiceStatus = $("voiceStatus");
const voiceSelect = $("voiceSelect");
const autoSpeak = $("autoSpeak");

let availableVoices = [];
let recognition = null;
let isListening = false;
let recognitionSupported = false;

function addBubble(text, who = "assistant", isError = false) {
  const el = document.createElement("article");
  el.className = `bubble ${who}${isError ? " error" : ""}`;
  el.textContent = text;
  messages.appendChild(el);
  messages.scrollTop = messages.scrollHeight;
  return el;
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.detail || `HTTP ${response.status}`);
  return data;
}

async function checkHealth() {
  try {
    const h = await api("/api/health");
    statusText.textContent = h.provider === "ollama"
      ? `Conectada · ${h.model}`
      : "Interfaz lista · Ollama apagado";
  } catch {
    statusText.textContent = "Servidor local";
  }
}

/* Texto a voz: usa voces instaladas/disponibles en Android o Chrome. */
function loadVoices() {
  if (!("speechSynthesis" in window)) {
    voiceSelect.replaceChildren(new Option("Síntesis de voz no disponible", ""));
    voiceStatus.textContent = "Este navegador no ofrece síntesis de voz. Prueba Chrome actualizado.";
    $("testVoiceButton").disabled = true;
    return;
  }

  availableVoices = window.speechSynthesis.getVoices() || [];
  const previous = voiceSelect.value;
  voiceSelect.replaceChildren();

  const spanishVoices = availableVoices.filter(v => /^es([_-]|$)/i.test(v.lang));
  const list = spanishVoices.length ? spanishVoices : availableVoices;

  if (!list.length) {
    voiceSelect.add(new Option("Voz predeterminada de Android", ""));
    voiceStatus.textContent = "Android aún no ha entregado la lista de voces. Pulsa «Probar voz» para comprobar.";
    return;
  }

  for (const voice of list) {
    const label = `${voice.name} (${voice.lang})${voice.default ? " · predeterminada" : ""}`;
    voiceSelect.add(new Option(label, voice.voiceURI));
  }

  if (previous && list.some(v => v.voiceURI === previous)) {
    voiceSelect.value = previous;
  } else {
    const preferred = list.find(v => /^es-NI$/i.test(v.lang))
      || list.find(v => /^es-MX$/i.test(v.lang))
      || list.find(v => /^es-ES$/i.test(v.lang))
      || list.find(v => /^es/i.test(v.lang))
      || list[0];
    voiceSelect.value = preferred ? preferred.voiceURI : "";
  }

  voiceStatus.textContent = spanishVoices.length
    ? `${spanishVoices.length} voz/ voces en español disponibles. La selección femenina/anime depende de las voces instaladas.`
    : "No se detectaron voces en español. Revisa las voces de texto a voz en Ajustes de Android.";
}

function speak(text) {
  if (!("speechSynthesis" in window)) {
    voiceStatus.textContent = "Síntesis de voz no disponible en este navegador.";
    return;
  }
  const clean = String(text || "").trim();
  if (!clean) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(clean.slice(0, 2500));
  const selected = availableVoices.find(v => v.voiceURI === voiceSelect.value);
  if (selected) {
    utterance.voice = selected;
    utterance.lang = selected.lang || "es-ES";
  } else {
    utterance.lang = "es-ES";
  }
  /* Tono un poco elevado y ritmo calmado: efecto suave, no una voz anime real. */
  utterance.rate = 0.94;
  utterance.pitch = 1.12;
  utterance.volume = 1;
  utterance.onstart = () => {
    voiceStatus.textContent = "Dekiller está hablando…";
    window.dispatchEvent(new CustomEvent("dekiller:talking", { detail: { talking: true } }));
  };
  utterance.onend = () => {
    voiceStatus.textContent = "Voz lista.";
    window.dispatchEvent(new CustomEvent("dekiller:talking", { detail: { talking: false } }));
  };
  utterance.onerror = (event) => {
    window.dispatchEvent(new CustomEvent("dekiller:talking", { detail: { talking: false } }));
    voiceStatus.textContent = `No se pudo reproducir la voz (${event.error || "error"}). Revisa el motor de voz de Android.`;
  };
  window.speechSynthesis.speak(utterance);
}

if ("speechSynthesis" in window) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
  /* Algunos motores tardan en publicar las voces al cargar la página. */
  setTimeout(loadVoices, 900);
}

function setupRecognition() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    recognitionSupported = false;
    micButton.disabled = true;
    voiceStatus.textContent = "Este navegador no ofrece reconocimiento de voz. Puedes seguir escribiendo y escuchar las respuestas.";
    return;
  }

  recognitionSupported = true;
  recognition = new Recognition();
  recognition.lang = "es-ES";
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  let finalTranscript = "";
  recognition.onstart = () => {
    isListening = true;
    micButton.textContent = "🔴 Escuchando…";
    micButton.setAttribute("aria-pressed", "true");
    voiceStatus.textContent = "Te escucho. Habla ahora; pulsa otra vez para detener.";
  };
  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalTranscript += transcript;
      else interim += transcript;
    }
    input.value = `${finalTranscript} ${interim}`.trim();
    input.dispatchEvent(new Event("input"));
  };
  recognition.onerror = (event) => {
    const messagesByError = {
      "not-allowed": "Permite el micrófono para este sitio en Chrome y vuelve a intentarlo.",
      "service-not-allowed": "El servicio de reconocimiento de voz está bloqueado o no disponible.",
      "network": "El reconocimiento de voz necesita conexión o su servicio no respondió.",
      "no-speech": "No detecté voz. Pulsa el micrófono e inténtalo de nuevo."
    };
    voiceStatus.textContent = messagesByError[event.error] || `Error del micrófono: ${event.error}.`;
  };
  recognition.onend = () => {
    isListening = false;
    micButton.textContent = "🎙️ Hablar";
    micButton.setAttribute("aria-pressed", "false");
    const spoken = input.value.trim();
    /* Si se reconoció voz, enviar al chat automáticamente. */
    if (spoken && spoken === `${finalTranscript}`.trim()) {
      const form = $("chatForm");
      if (form.requestSubmit) form.requestSubmit();
      else form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    } else if (spoken) {
      voiceStatus.textContent = "Texto reconocido. Revísalo y pulsa Enviar si hace falta.";
    } else if (!voiceStatus.textContent.startsWith("Error") && !voiceStatus.textContent.includes("Permite")) {
      voiceStatus.textContent = "No se reconocieron palabras. Puedes escribir el mensaje.";
    }
  };
}
setupRecognition();

micButton.addEventListener("click", () => {
  if (!recognitionSupported || !recognition) return;
  if (isListening) {
    try { recognition.stop(); } catch {}
    return;
  }
  window.speechSynthesis?.cancel();
  input.value = "";
  try {
    recognition.start();
  } catch (error) {
    voiceStatus.textContent = `No se pudo iniciar el micrófono: ${error.message || error}`;
  }
});

$("stopVoiceButton").addEventListener("click", () => {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  window.dispatchEvent(new CustomEvent("dekiller:talking", { detail: { talking: false } }));
  if (isListening && recognition) {
    try { recognition.stop(); } catch {}
  }
  voiceStatus.textContent = "Voz detenida.";
});

$("testVoiceButton").addEventListener("click", () => {
  speak("Hola, soy Dekiller Companion. Me alegra conversar contigo. ¿Qué hacemos hoy?");
});

$("chatForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message) return;
  addBubble(message, "user");
  input.value = "";
  input.style.height = "auto";
  sendButton.disabled = true;
  micButton.disabled = true;
  const waiting = addBubble("Pensando…");
  try {
    const result = await api("/api/chat", { method: "POST", body: JSON.stringify({ message }) });
    waiting.textContent = result.reply;
    statusText.textContent = `Conectada · ${result.model}`;
    if (autoSpeak.checked) speak(result.reply);
  } catch (error) {
    waiting.textContent = error.message;
    waiting.classList.add("error");
    checkHealth();
  } finally {
    sendButton.disabled = false;
    micButton.disabled = !recognitionSupported;
    input.focus();
  }
});

input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 130)}px`;
});

$("memoryButton").addEventListener("click", async () => {
  try {
    await refreshFacts();
    memoryDialog.showModal();
  } catch (error) {
    addBubble(`No pude abrir la memoria: ${error.message}`, "assistant", true);
  }
});
$("closeMemory").addEventListener("click", () => memoryDialog.close());

async function refreshFacts() {
  const data = await api("/api/memory");
  const list = $("factsList");
  list.replaceChildren();
  for (const fact of data.facts) {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.textContent = fact.text;
    const remove = document.createElement("button");
    remove.textContent = "Borrar";
    remove.type = "button";
    remove.addEventListener("click", async () => {
      try {
        await api("/api/memory/facts", { method: "DELETE", body: JSON.stringify({ id: fact.id }) });
        await refreshFacts();
      } catch (error) {
        alert(`No se pudo borrar el recuerdo: ${error.message}`);
      }
    });
    li.append(span, remove);
    list.appendChild(li);
  }
  if (!data.facts.length) {
    const li = document.createElement("li");
    li.textContent = "Aún no has guardado recuerdos.";
    list.appendChild(li);
  }
}

$("factForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const fact = $("factInput").value.trim();
  if (!fact) return;
  try {
    await api("/api/memory/facts", { method: "POST", body: JSON.stringify({ fact }) });
    $("factInput").value = "";
    await refreshFacts();
  } catch (error) {
    alert(`No se pudo guardar el recuerdo: ${error.message}`);
  }
});

$("forgetAll").addEventListener("click", async () => {
  if (!confirm("¿Borrar todos los recuerdos guardados? Esta acción no se puede deshacer.")) return;
  try {
    await api("/api/memory/facts", { method: "DELETE", body: JSON.stringify({ id: "*" }) });
    await refreshFacts();
  } catch (error) {
    alert(`No se pudieron borrar los recuerdos: ${error.message}`);
  }
});

checkHealth();
