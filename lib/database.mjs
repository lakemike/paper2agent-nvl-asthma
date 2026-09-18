import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

const STOPWORDS = new Set([
  "aber", "alle", "auch", "auf", "aus", "bei", "das", "dass", "dem", "den", "der", "des",
  "die", "ein", "eine", "einer", "eines", "für", "hat", "ich", "ist", "mit", "nach", "nicht",
  "oder", "sich", "sind", "und", "von", "vor", "was", "welche", "welcher", "welches", "wie", "wird",
  "zu", "zum", "zur", "the", "and", "for", "from", "how", "what", "when", "with",
]);

export function openDatabase(filename) {
  mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS papers (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source_url TEXT NOT NULL,
      source_sha256 TEXT NOT NULL,
      page_count INTEGER NOT NULL,
      indexed_at TEXT NOT NULL,
      config_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY,
      paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
      chunk_no INTEGER NOT NULL,
      page_start INTEGER NOT NULL,
      page_end INTEGER NOT NULL,
      heading TEXT NOT NULL,
      text TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      UNIQUE(paper_id, chunk_no)
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
      paper_id UNINDEXED,
      heading,
      text,
      tokenize='unicode61 remove_diacritics 2'
    );
  `);
  return db;
}

export function replacePaperChunks(db, paper, sourceSha256, pageCount, chunks, hashText) {
  const oldIds = db.prepare("SELECT id FROM chunks WHERE paper_id = ?").all(paper.id);
  const deleteFts = db.prepare("DELETE FROM chunks_fts WHERE rowid = ?");
  const insertPaper = db.prepare(`
    INSERT INTO papers(id, title, source_url, source_sha256, page_count, indexed_at, config_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title=excluded.title,
      source_url=excluded.source_url,
      source_sha256=excluded.source_sha256,
      page_count=excluded.page_count,
      indexed_at=excluded.indexed_at,
      config_json=excluded.config_json
  `);
  const insertChunk = db.prepare(`
    INSERT INTO chunks(paper_id, chunk_no, page_start, page_end, heading, text, content_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertFts = db.prepare("INSERT INTO chunks_fts(rowid, paper_id, heading, text) VALUES (?, ?, ?, ?)");

  db.exec("BEGIN IMMEDIATE");
  try {
    for (const row of oldIds) deleteFts.run(row.id);
    db.prepare("DELETE FROM chunks WHERE paper_id = ?").run(paper.id);
    insertPaper.run(paper.id, paper.title, paper.sourceUrl, sourceSha256, pageCount,
      new Date().toISOString(), JSON.stringify(paper));
    chunks.forEach((chunk, index) => {
      const result = insertChunk.run(paper.id, index + 1, chunk.pageStart, chunk.pageEnd,
        chunk.heading, chunk.text, hashText(chunk.text));
      insertFts.run(Number(result.lastInsertRowid), paper.id, chunk.heading, chunk.text);
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function chunkCount(db, paperId) {
  return Number(db.prepare("SELECT count(*) AS count FROM chunks WHERE paper_id = ?").get(paperId).count);
}

export function extractSearchTerms(question) {
  const tokens = question.match(/[\p{L}\p{N}][\p{L}\p{N}-]*/gu) ?? [];
  const terms = [];
  const seen = new Set();
  for (const original of tokens) {
    const term = original.toLocaleLowerCase("de-DE");
    const keepShortAcronym = original.length >= 2 && original === original.toUpperCase();
    if ((!keepShortAcronym && term.length < 3) || STOPWORDS.has(term) || seen.has(term)) continue;
    seen.add(term);
    terms.push(term);
    if (terms.length === 20) break;
  }
  return terms;
}

function ftsQuery(terms) {
  return terms.map((term) => `"${term.replaceAll('"', '""')}"`).join(" OR ");
}

function fallbackRetrieve(db, paperId, terms, limit) {
  const rows = db.prepare("SELECT id, page_start, page_end, heading, text FROM chunks WHERE paper_id = ?").all(paperId);
  return rows.map((row) => {
    const text = row.text.toLocaleLowerCase("de-DE");
    const heading = row.heading.toLocaleLowerCase("de-DE");
    const score = terms.reduce((total, term) => total + text.split(term).length - 1 +
      (heading.split(term).length - 1) * 3, 0);
    return { ...row, score };
  }).filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.page_start - b.page_start)
    .slice(0, limit);
}

export function retrieveChunks(db, paperId, question, limit = 8) {
  const terms = extractSearchTerms(question);
  if (!terms.length) return [];
  const rows = db.prepare(`
    SELECT c.id, c.page_start, c.page_end, c.heading, c.text,
           bm25(chunks_fts, 0.0, 2.5, 1.0) AS rank
      FROM chunks_fts
      JOIN chunks c ON c.id = chunks_fts.rowid
     WHERE chunks_fts MATCH ? AND chunks_fts.paper_id = ?
     ORDER BY rank
     LIMIT ?
  `).all(ftsQuery(terms), paperId, limit);
  return rows.length ? rows : fallbackRetrieve(db, paperId, terms, limit);
}
