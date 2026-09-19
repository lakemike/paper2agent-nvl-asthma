import test from "node:test";
import assert from "node:assert/strict";
import { extractAnswer, modelCredentialConfigured, validateAnswerCitations } from "../lib/openrouter.mjs";

const chunks = [
  { page_start: 42, page_end: 42 },
  { page_start: 57, page_end: 58 },
];

test("mock mode does not require a provider credential", () => {
  assert.equal(modelCredentialConfigured({ LLM_MODE: "mock" }), true);
  assert.equal(modelCredentialConfigured({ LLM_MODE: "openrouter" }), false);
  assert.equal(modelCredentialConfigured({ LLM_MODE: "invalid", OPENROUTER_API_KEY: "secret" }), false);
});

test("answers may cite only retrieved pages", () => {
  assert.doesNotThrow(() => validateAnswerCitations("Aussage [S. 42]. Ergänzung [S. 57-58].", chunks));
  assert.throws(() => validateAnswerCitations("Aussage ohne Beleg.", chunks), /no page citation/);
  assert.throws(() => validateAnswerCitations("Falscher Beleg [S. 99].", chunks), /outside the retrieved evidence/);
  assert.throws(() => validateAnswerCitations("Falscher Bereich [S. 58-57].", chunks), /invalid page range/);
});

test("provider responses must contain a complete answer", () => {
  assert.equal(extractAnswer({
    choices: [{ finish_reason: "stop", message: { content: " Vollständige Antwort [S. 42]. " } }],
  }), "Vollständige Antwort [S. 42].");
  assert.throws(() => extractAnswer({
    choices: [{ finish_reason: "length", message: { content: "Abgebrochene Antwort" } }],
  }), /truncated/);
  assert.throws(() => extractAnswer({ choices: [{ finish_reason: "stop", message: {} }] }), /no answer text/);
});
