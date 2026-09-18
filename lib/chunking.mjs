const FURNITURE = [
  /^NVL Asthma\s*$/i,
  /^Langfassung\s*[–-]\s*Version 5\.0\s*$/i,
  /^©\s*NVL-Programm\s*2024.*Seite\s+\d+\s*$/i,
];

function isFurniture(line) {
  return FURNITURE.some((pattern) => pattern.test(line.trim()));
}

export function cleanPageText(raw) {
  const lines = raw.replaceAll("\u00ad", "").replaceAll("\u00a0", " ").split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+$/u, "")).filter((line) => !isFurniture(line));
  const output = [];
  let blank = false;
  for (const line of lines) {
    if (!line.trim()) {
      if (!blank && output.length) output.push("");
      blank = true;
      continue;
    }
    output.push(line.trim());
    blank = false;
  }
  return output.join("\n").trim();
}

function guessHeading(text, fallback) {
  for (const line of text.split("\n").slice(0, 8)) {
    const candidate = line.trim();
    if (candidate.length >= 4 && candidate.length <= 140 &&
      (/^\d+(?:\.\d+)*\s+\S/u.test(candidate) || /^[A-ZÄÖÜ][A-ZÄÖÜ0-9\s/&(),:–-]{5,}$/u.test(candidate))) {
      return candidate;
    }
  }
  return fallback;
}

function splitLongBlock(text, maxChars) {
  if (text.length <= maxChars) return [text];
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ0-9])/u);
  const chunks = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && current.length + sentence.length + 1 > maxChars) {
      chunks.push(current.trim());
      current = "";
    }
    if (sentence.length > maxChars) {
      for (let offset = 0; offset < sentence.length; offset += maxChars) {
        const piece = sentence.slice(offset, offset + maxChars).trim();
        if (piece) chunks.push(piece);
      }
    } else current = current ? `${current} ${sentence}` : sentence;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export function chunkPages(rawPages, { maxChars = 2800 } = {}) {
  const chunks = [];
  rawPages.forEach((raw, index) => {
    const page = index + 1;
    const cleaned = cleanPageText(raw);
    if (!cleaned) return;
    const heading = guessHeading(cleaned, `Seite ${page}`);
    const blocks = cleaned.split(/\n{2,}/u).flatMap((block) => splitLongBlock(block, maxChars));
    let current = "";
    for (const block of blocks) {
      if (current && current.length + block.length + 2 > maxChars) {
        chunks.push({ pageStart: page, pageEnd: page, heading, text: current.trim() });
        current = "";
      }
      current = current ? `${current}\n\n${block}` : block;
    }
    if (current.trim()) chunks.push({ pageStart: page, pageEnd: page, heading, text: current.trim() });
  });
  return chunks;
}
