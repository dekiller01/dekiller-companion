import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 3040);
const OLLAMA_URL = (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen3:1.7b";
const DATA_DIR = path.join(__dirname, "data");
const MEMORY_FILE = path.join(DATA_DIR, "memory.json");
const MAX_BODY = 32 * 1024;
const MAX_MESSAGE = 4000;

await fs.mkdir(DATA_DIR, { recursive: true });
try {
  await fs.access(MEMORY_FILE);
} catch {
  await fs.writeFile(MEMORY_FILE, JSON.stringify({ messages: [], facts: [] }, null, 2), { mode: 0o600 });
}

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'self'; connect-src 'self' https://cdn.jsdelivr.net; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; base-uri 'none'; frame-ancestors 'none'"
  });
  res.end(type.startsWith("application/json") ? JSON.stringify(body) : body);
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw) > MAX_BODY) throw Object.assign(new Error("Solicitud demasiado grande"), { status: 413 });
  }
  try { return JSON.parse(raw || "{}"); }
  catch { throw Object.assign(new Error("JSON inválido"), { status: 400 }); }
}

async function readMemory() {
  try {
    const parsed = JSON.parse(await fs.readFile(MEMORY_FILE, "utf8"));
    return {
      messages: Array.isArray(parsed.messages) ? parsed.messages.slice(-80) : [],
      facts: Array.isArray(parsed.facts) ? parsed.facts.slice(-100) : []
    };
  } catch {
    return { messages: [], facts: [] };
  }
}

async function writeMemory(memory) {
  const temp = MEMORY_FILE + ".tmp";
  await fs.writeFile(temp, JSON.stringify(memory, null, 2), { mode: 0o600 });
  await fs.rename(temp, MEMORY_FILE);
}

async function ollamaChat(messages) {
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(120000),
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      think: false,
      messages,
      options: { temperature: 0.65, num_predict: 450 }
    })
  });
  if (!response.ok) throw new Error(`Ollama respondió HTTP ${response.status}`);
  const data = await response.json();
  const reply = data?.message?.content?.trim();
  if (!reply) throw new Error("Ollama devolvió una respuesta vacía");
  return reply;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
    if (req.method === "GET" && ["/", "/index.html"].includes(url.pathname)) {
      const html = await fs.readFile(path.join(__dirname, "public", "index.html"), "utf8");
      return send(res, 200, html, "text/html; charset=utf-8");
    }
    if (req.method === "GET" && url.pathname === "/app.js") {
      const js = await fs.readFile(path.join(__dirname, "public", "app.js"), "utf8");
      return send(res, 200, js, "text/javascript; charset=utf-8");
    }
    if (req.method === "GET" && url.pathname === "/style.css") {
      const css = await fs.readFile(path.join(__dirname, "public", "style.css"), "utf8");
      return send(res, 200, css, "text/css; charset=utf-8");
    }
    if (req.method === "GET" && url.pathname === "/avatar.js") {
      const js = await fs.readFile(path.join(__dirname, "public", "avatar.js"), "utf8");
      return send(res, 200, js, "text/javascript; charset=utf-8");
    }
    if (req.method === "GET" && url.pathname === "/api/health") {
      let ollama = false;
      try {
        const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(1800) });
        ollama = r.ok;
      } catch {}
      return send(res, 200, { status: "ok", companion: "Dekiller Companion", provider: ollama ? "ollama" : "offline", model: OLLAMA_MODEL });
    }
    if (req.method === "GET" && url.pathname === "/api/memory") {
      const memory = await readMemory();
      return send(res, 200, { facts: memory.facts, messages: memory.messages.slice(-30) });
    }
    if (req.method === "POST" && url.pathname === "/api/memory/facts") {
      const body = await readJson(req);
      const fact = String(body.fact || "").trim().slice(0, 300);
      if (!fact) return send(res, 400, { error: "Escribe un recuerdo primero." });
      const memory = await readMemory();
      if (!memory.facts.some(f => f.text.toLowerCase() === fact.toLowerCase())) {
        memory.facts.push({ id: Date.now().toString(36), text: fact, createdAt: new Date().toISOString() });
        memory.facts = memory.facts.slice(-100);
        await writeMemory(memory);
      }
      return send(res, 200, { ok: true, facts: memory.facts });
    }
    if (req.method === "DELETE" && url.pathname === "/api/memory/facts") {
      const body = await readJson(req);
      const id = String(body.id || "");
      const memory = await readMemory();
      memory.facts = id === "*" ? [] : memory.facts.filter(f => f.id !== id);
      await writeMemory(memory);
      return send(res, 200, { ok: true, facts: memory.facts });
    }
    if (req.method === "POST" && url.pathname === "/api/chat") {
      const body = await readJson(req);
      const message = String(body.message || "").trim();
      if (!message) return send(res, 400, { error: "El mensaje está vacío." });
      if (message.length > MAX_MESSAGE) return send(res, 413, { error: `Máximo ${MAX_MESSAGE} caracteres por mensaje.` });

      const memory = await readMemory();
      const factContext = memory.facts.map(f => `- ${f.text}`).join("\n");
      const history = memory.messages.slice(-12).map(m => ({ role: m.role, content: m.content }));
      const messages = [
        { role: "system", content: "Eres Dekiller Companion, una compañera virtual cálida, respetuosa y honesta. Habla en español salvo que te pidan otro idioma. No afirmes tener sentimientos humanos ni inventes recuerdos. Usa los recuerdos solo cuando sean pertinentes. Si no sabes algo, dilo. Recuerdos guardados por el usuario:\n" + (factContext || "(sin recuerdos guardados)") },
        ...history,
        { role: "user", content: message }
      ];
      let reply;
      try {
        reply = await ollamaChat(messages);
      } catch (err) {
        return send(res, 503, {
          error: "No puedo conectar con Ollama ahora. Abre otra sesión de Termux y ejecuta: ollama serve",
          detail: String(err?.message || "error").slice(0, 160),
          provider: "offline"
        });
      }
      memory.messages.push({ role: "user", content: message, at: new Date().toISOString() });
      memory.messages.push({ role: "assistant", content: reply, at: new Date().toISOString() });
      memory.messages = memory.messages.slice(-80);
      await writeMemory(memory);
      return send(res, 200, { reply, provider: "ollama", model: OLLAMA_MODEL });
    }
    return send(res, 404, { error: "No encontrado" });
  } catch (err) {
    return send(res, err.status || 500, { error: err.status ? err.message : "Error interno del servidor" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Dekiller Companion listo en http://${HOST}:${PORT}`);
  console.log(`Modelo configurado: ${OLLAMA_MODEL}`);
  console.log("Solo escucha en el propio teléfono; no publiques este puerto en Internet.");
});
