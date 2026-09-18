const paperList = document.querySelector("#paper-list");
const banner = document.querySelector("#document-banner");
const messages = document.querySelector("#messages");
const form = document.querySelector("#chat-form");
const question = document.querySelector("#question");
const sendButton = document.querySelector("#send-button");
const status = document.querySelector("#composer-status");
const starters = document.querySelector("#starter-prompts");
const welcomeCopy = document.querySelector("#welcome-copy");
let selectedPaper = null;
const history = [];

function addMessage(role, text, sources = []) {
  const article = document.createElement("article");
  article.className = `message ${role}`;
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = role === "user" ? "M" : "A";
  const body = document.createElement("div");
  const label = document.createElement("strong");
  label.textContent = role === "user" ? "Du" : "Leitlinienagent";
  const copy = document.createElement("p");
  copy.textContent = text;
  body.append(label, copy);
  if (sources.length) {
    const sourceBox = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = `${sources.length} herangezogene Abschnitte`;
    const list = document.createElement("ul");
    for (const source of sources) {
      const item = document.createElement("li");
      const pages = source.pageStart === source.pageEnd ? `S. ${source.pageStart}` : `S. ${source.pageStart}–${source.pageEnd}`;
      item.textContent = `${pages}: ${source.heading}`;
      list.append(item);
    }
    sourceBox.append(summary, list);
    body.append(sourceBox);
  }
  article.append(avatar, body);
  messages.append(article);
  article.scrollIntoView({ behavior: "smooth", block: "end" });
}

function renderPaper(paper) {
  selectedPaper = paper;
  paperList.replaceChildren();
  const card = document.createElement("button");
  card.type = "button";
  card.className = "paper-card selected";
  const title = document.createElement("strong");
  title.textContent = paper.shortTitle;
  const meta = document.createElement("span");
  meta.textContent = `Version ${paper.version} · ${paper.year}`;
  const badge = document.createElement("span");
  badge.className = `badge ${paper.status}`;
  badge.textContent = paper.available ? "Bereit" : paper.status === "rights-locked" ? "Rechtefreigabe offen" : "Nicht indexiert";
  card.append(title, meta, badge);
  paperList.append(card);

  banner.replaceChildren();
  const bannerText = document.createElement("div");
  const heading = document.createElement("strong");
  heading.textContent = paper.title;
  const detail = document.createElement("p");
  detail.textContent = paper.statusReason;
  bannerText.append(heading, detail);
  const source = document.createElement("a");
  source.href = paper.sourceUrl;
  source.rel = "noreferrer";
  source.textContent = "Offizielle Quelle";
  banner.append(bannerText, source);

  question.disabled = !paper.available;
  sendButton.disabled = !paper.available;
  starters.hidden = !paper.available;
  welcomeCopy.textContent = paper.available
    ? "Stelle eine Frage. Antworten werden nur aus indexierten Auszügen erzeugt und mit Seitenangaben belegt."
    : `${paper.rights.notice} Das öffentliche Repository enthält deshalb weder PDF, Volltext noch Suchindex.`;
  status.textContent = paper.available ? "Chats werden nicht gespeichert."
    : "Aktivierung bleibt technisch gesperrt, bis die Rechtefreigabe dokumentiert ist.";
}

async function loadPapers() {
  try {
    const response = await fetch("/api/papers");
    if (!response.ok) throw new Error("Dokumentliste konnte nicht geladen werden.");
    const payload = await response.json();
    if (!payload.papers?.length) throw new Error("Keine Dokumente konfiguriert.");
    renderPaper(payload.papers[0]);
  } catch (error) {
    welcomeCopy.textContent = error.message;
    status.textContent = "Server nicht erreichbar.";
  }
}

async function ask(text) {
  if (!selectedPaper?.available) return;
  addMessage("user", text);
  history.push({ role: "user", content: text });
  question.value = "";
  question.disabled = true;
  sendButton.disabled = true;
  sendButton.textContent = "Läuft …";
  status.textContent = "Passende Leitlinienabschnitte werden gesucht …";
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paperId: selectedPaper.id, question: text, history: history.slice(-6, -1) }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Anfrage fehlgeschlagen.");
    addMessage("assistant", payload.answer, payload.sources || []);
    history.push({ role: "assistant", content: payload.answer });
    status.textContent = "Antwort anhand der angezeigten Quellen erzeugt. Bitte am Original prüfen.";
  } catch (error) {
    addMessage("assistant", `Fehler: ${error.message}`);
    status.textContent = "Die Anfrage wurde nicht abgeschlossen.";
  } finally {
    question.disabled = false;
    sendButton.disabled = false;
    sendButton.textContent = "Senden";
    question.focus();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = question.value.trim();
  if (text.length >= 3) ask(text);
});
question.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") form.requestSubmit();
});
starters.addEventListener("click", (event) => {
  if (event.target instanceof HTMLButtonElement) ask(event.target.textContent.trim());
});
loadPapers();
