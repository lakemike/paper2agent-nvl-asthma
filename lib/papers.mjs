import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function validatePaper(paper, filename) {
  const required = ["id", "title", "shortTitle", "sourceUrl", "rights"];
  for (const field of required) {
    if (!paper[field]) throw new Error(`Paper config ${filename} is missing ${field}`);
  }
  if (typeof paper.rights.requiresWrittenPermission !== "boolean") {
    throw new Error(`Paper config ${filename} has an invalid rights gate`);
  }
  return Object.freeze(paper);
}

export function loadPaperConfigs(directory) {
  const papers = new Map();
  for (const filename of readdirSync(directory).filter((name) => name.endsWith(".json")).sort()) {
    const paper = validatePaper(JSON.parse(readFileSync(join(directory, filename), "utf8")), filename);
    if (papers.has(paper.id)) throw new Error(`Duplicate paper id: ${paper.id}`);
    papers.set(paper.id, paper);
  }
  return papers;
}
