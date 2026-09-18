import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { openDatabase, replacePaperChunks, retrieveChunks } from "../lib/database.mjs";

test("retrieval returns the matching page before unrelated material", () => {
  const directory = mkdtempSync(join(tmpdir(), "p2a-db-"));
  const db = openDatabase(join(directory, "test.sqlite"));
  const paper = { id: "test", title: "Test", sourceUrl: "https://example.test" };
  const hash = (text) => createHash("sha256").update(text).digest("hex");
  replacePaperChunks(db, paper, "abc", 2, [
    { pageStart: 1, pageEnd: 1, heading: "Einleitung", text: "Allgemeiner Hintergrund." },
    { pageStart: 2, pageEnd: 2, heading: "Therapie", text: "Die inhalative Therapie wird kontrolliert angepasst." },
  ], hash);
  const result = retrieveChunks(db, "test", "Wie wird die inhalative Therapie angepasst?", 2);
  assert.equal(result[0].page_start, 2);
  db.close();
});
