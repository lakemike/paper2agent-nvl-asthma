import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { permissionStatus } from "../lib/rights.mjs";

const paper = { rights: { requiresWrittenPermission: true } };

test("restricted sources stay locked without both acknowledgement and evidence", () => {
  assert.equal(permissionStatus(paper, {}).granted, false);
  assert.equal(permissionStatus(paper, { SOURCE_USE_PERMISSION_GRANTED: "true" }).granted, false);
});

test("restricted sources unlock only with non-empty evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "p2a-rights-"));
  const evidence = join(directory, "permission.txt");
  writeFileSync(evidence, "Written permission reference");
  assert.equal(permissionStatus(paper, {
    SOURCE_USE_PERMISSION_GRANTED: "true",
    PERMISSION_EVIDENCE_FILE: evidence,
  }).granted, true);
});
