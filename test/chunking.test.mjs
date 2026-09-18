import test from "node:test";
import assert from "node:assert/strict";
import { chunkPages, cleanPageText } from "../lib/chunking.mjs";

test("page furniture is removed without losing content", () => {
  const cleaned = cleanPageText("NVL Asthma\nLangfassung – Version 5.0\n\n4 Therapie\nWichtiger Inhalt.\n© NVL-Programm 2024 | Seite 42");
  assert.equal(cleaned, "4 Therapie\nWichtiger Inhalt.");
});

test("chunks retain exact page anchors", () => {
  const chunks = chunkPages(["1 Einleitung\n\nText eins.", "2 Therapie\n\nText zwei."]);
  assert.equal(chunks.length, 2);
  assert.deepEqual(chunks.map(({ pageStart, heading }) => [pageStart, heading]), [
    [1, "1 Einleitung"],
    [2, "2 Therapie"],
  ]);
});
