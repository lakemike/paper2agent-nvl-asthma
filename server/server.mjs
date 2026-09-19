import { createServer } from "node:http";
import { readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chunkCount, openDatabase, retrieveChunks } from "../lib/database.mjs";
import { answerWithModel, modelCredentialConfigured } from "../lib/openrouter.mjs";
import { loadPaperConfigs } from "../lib/papers.mjs";
import { permissionStatus } from "../lib/rights.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const WEB_ROOT = join(ROOT, "web");
const PAPER_ROOT = join(ROOT, "config", "papers");
const DATA_DIR = process.env.DATA_DIR || join(ROOT, "data");
const DB_PATH = join(DATA_DIR, "paper2agent.sqlite");
const HOST = process.env.HOST || "127.0.0.1";
const MAX_BODY_BYTES = 24 * 1024;

function boundedInteger(name, fallback, minimum, maximum) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

const PORT = boundedInteger("PORT", 8080, 1, 65535);
const LLM_MODE = process.env.LLM_MODE ?? "mock";
if (!["mock", "openrouter"].includes(LLM_MODE)) throw new Error("LLM_MODE must be mock or openrouter");
const MAX_REQUESTS_PER_HOUR = boundedInteger("MAX_REQUESTS_PER_HOUR", 30, 1, 1000);
const MAX_CONTEXT_CHUNKS = boundedInteger("MAX_CONTEXT_CHUNKS", 8, 3, 12);
const MAX_CONCURRENT_CHATS = boundedInteger("MAX_CONCURRENT_CHATS", 4, 1, 32);
const MAX_TRACKED_CLIENTS = boundedInteger("MAX_TRACKED_CLIENTS", 10000, 100, 100000);
boundedInteger("MODEL_MAX_TOKENS", 3000, 200, 4000);
const papers = loadPaperConfigs(PAPER_ROOT);
const db = openDatabase(DB_PATH);
const rateWindows = new Map();
let activeChats = 0;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function securityHeaders(contentType = "application/json; charset=utf-8") {
  return {
    "content-type": contentType,
    "cache-control": "no-store",
    "content-security-policy": "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-resource-policy": "same-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "strict-transport-security": "max-age=31536000; includeSubDomains",
  };
}

function sendJson(response, status, body) {
  response.writeHead(status, securityHeaders());
  response.end(JSON.stringify(body));
}

function paperView(paper) {
  const permission = permissionStatus(paper);
  const chunks = chunkCount(db, paper.id);
  const available = permission.granted && chunks > 0;
  return {
    id: paper.id,
    title: paper.title,
    shortTitle: paper.shortTitle,
    version: paper.version,
    year: paper.year,
    sourceUrl: paper.sourceUrl,
    citation: paper.citation,
    rights: paper.rights,
    indexedChunks: chunks,
    available,
    status: available ? "ready" : permission.granted ? "not-indexed" : "rights-locked",
    statusReason: available ? "Quelle indexiert und freigegeben."
      : permission.granted ? "Die Quelle ist freigegeben, aber noch nicht indexiert."
        : permission.reason,
  };
}

function clientIp(request) {
  const remote = request.socket.remoteAddress || "unknown";
  const trust = String(process.env.TRUST_PROXY_LOOPBACK).toLowerCase() === "true";
  const isLoopback = remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
  if (trust && isLoopback) {
    const forwarded = request.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0].trim();
  }
  return remote;
}

function rateAllowed(request) {
  const now = Date.now();
  const ip = clientIp(request);
  const current = rateWindows.get(ip);
  if (!current || now - current.startedAt >= 3_600_000) {
    for (const [key, window] of rateWindows) {
      if (now - window.startedAt >= 3_600_000) rateWindows.delete(key);
    }
    if (!rateWindows.has(ip) && rateWindows.size >= MAX_TRACKED_CLIENTS) return false;
    rateWindows.set(ip, { startedAt: now, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= MAX_REQUESTS_PER_HOUR;
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error("Request too large"), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("Invalid JSON"), { status: 400 });
  }
}

function sanitizeHistory(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-6).flatMap((message) => {
    if (!message || !["user", "assistant"].includes(message.role) || typeof message.content !== "string") return [];
    const content = message.content.trim().slice(0, 3000);
    return content ? [{ role: message.role, content }] : [];
  });
}

async function handleChat(request, response) {
  if (!rateAllowed(request)) return sendJson(response, 429, { error: "Zu viele Anfragen. Bitte später erneut versuchen." });
  const body = await readJson(request);
  const paper = papers.get(body.paperId);
  if (!paper) return sendJson(response, 404, { error: "Unbekanntes Dokument." });
  const view = paperView(paper);
  if (!view.available) return sendJson(response, 423, { error: view.statusReason, status: view.status });
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (question.length < 3 || question.length > 2000) {
    return sendJson(response, 400, { error: "Die Frage muss zwischen 3 und 2000 Zeichen lang sein." });
  }
  const chunks = retrieveChunks(db, paper.id, question, MAX_CONTEXT_CHUNKS);
  if (!chunks.length) {
    return sendJson(response, 422, { error: "Zu dieser Frage wurden keine belastbaren Leitlinienabschnitte gefunden." });
  }
  if (activeChats >= MAX_CONCURRENT_CHATS) {
    return sendJson(response, 503, { error: "Der Dienst ist ausgelastet. Bitte gleich erneut versuchen." });
  }
  activeChats += 1;
  let answer;
  try {
    answer = await answerWithModel({
      env: process.env,
      paper,
      question,
      history: sanitizeHistory(body.history),
      chunks,
    });
  } finally {
    activeChats -= 1;
  }
  const sources = chunks.map((chunk) => ({
    pageStart: chunk.page_start,
    pageEnd: chunk.page_end,
    heading: chunk.heading,
  }));
  return sendJson(response, 200, { answer, sources, citation: paper.citation });
}

function serveStatic(pathname, response) {
  const requestPath = pathname === "/" ? "/index.html" : pathname;
  const normalized = normalize(requestPath).replace(/^([.][.][/\\])+/, "");
  const filename = join(WEB_ROOT, normalized);
  if (!filename.startsWith(WEB_ROOT)) return false;
  try {
    if (!statSync(filename).isFile()) return false;
    const type = MIME[extname(filename)] || "application/octet-stream";
    response.writeHead(200, {
      ...securityHeaders(type),
      "cache-control": extname(filename) === ".html" ? "no-store" : "public, max-age=3600",
    });
    response.end(readFileSync(filename));
    return true;
  } catch {
    return false;
  }
}

export function createAppServer() {
  return createServer(async (request, response) => {
    const startedAt = Date.now();
    const url = new URL(request.url || "/", "http://localhost");
    try {
      if (request.method === "GET" && url.pathname === "/healthz") {
        const indexedPapers = [...papers.values()].filter((paper) => chunkCount(db, paper.id) > 0).length;
        sendJson(response, 200, { status: "ok", indexedPapers, llmMode: LLM_MODE });
      } else if (request.method === "GET" && url.pathname === "/readyz") {
        const availablePapers = [...papers.values()].filter((paper) => paperView(paper).available).length;
        const ready = availablePapers > 0 && modelCredentialConfigured(process.env);
        sendJson(response, ready ? 200 : 503, {
          status: ready ? "ready" : "not-ready",
          availablePapers,
          llmMode: LLM_MODE,
          modelConfigured: modelCredentialConfigured(process.env),
        });
      } else if (request.method === "GET" && url.pathname === "/api/papers") {
        sendJson(response, 200, { papers: [...papers.values()].map(paperView) });
      } else if (request.method === "POST" && url.pathname === "/api/chat") {
        await handleChat(request, response);
      } else if (request.method === "GET" && serveStatic(url.pathname, response)) {
        // Static response sent.
      } else sendJson(response, 404, { error: "Not found" });
    } catch (error) {
      const status = Number(error.status || 500);
      if (status >= 500) console.error("request_failed", { path: url.pathname, message: error.message });
      if (!response.headersSent) sendJson(response, status, { error: status >= 500 ? "Interner Fehler." : error.message });
      else response.end();
    } finally {
      console.log("request", { method: request.method, path: url.pathname,
        status: response.statusCode, durationMs: Date.now() - startedAt });
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const server = createAppServer();
  server.listen(PORT, HOST, () => console.log(`Paper2Agent web runtime listening on http://${HOST}:${PORT}`));
  const shutdown = () => server.close(() => process.exit(0));
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
