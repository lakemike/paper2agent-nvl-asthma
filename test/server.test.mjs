import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("liveness remains separate from launch readiness", async (context) => {
  process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "p2a-server-"));
  process.env.LLM_MODE = "mock";
  process.env.SOURCE_USE_PERMISSION_GRANTED = "false";
  delete process.env.PERMISSION_EVIDENCE_FILE;
  const { createAppServer } = await import(`../server/server.mjs?test=${Date.now()}`);
  const server = createAppServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;

  const health = await fetch(`${base}/healthz`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, "ok");
  assert.equal(health.headers.get("cross-origin-opener-policy"), "same-origin");

  const readiness = await fetch(`${base}/readyz`);
  assert.equal(readiness.status, 503);
  assert.equal((await readiness.json()).status, "not-ready");

  const papers = await fetch(`${base}/api/papers`);
  const payload = await papers.json();
  assert.equal(payload.papers[0].status, "rights-locked");
});
