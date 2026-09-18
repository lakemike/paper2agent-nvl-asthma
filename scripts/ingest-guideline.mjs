import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createReadStream, lstatSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chunkPages } from "../lib/chunking.mjs";
import { openDatabase, replacePaperChunks } from "../lib/database.mjs";
import { loadPaperConfigs } from "../lib/papers.mjs";
import { permissionStatus } from "../lib/rights.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) continue;
    args[key.slice(2)] = argv[index + 1];
    index += 1;
  }
  return args;
}

async function sha256(filename) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest("hex");
}

function textHash(text) {
  return createHash("sha256").update(text).digest("hex");
}

const args = parseArgs(process.argv.slice(2));
const paperId = args.paper || "nvl-asthma-2024";
if (!args.pdf) {
  console.error("Usage: npm run ingest:nvl -- --pdf /absolute/path/to/source.pdf");
  process.exit(2);
}
const paper = loadPaperConfigs(join(ROOT, "config", "papers")).get(paperId);
if (!paper) throw new Error(`Unknown paper config: ${paperId}`);
const rights = permissionStatus(paper);
if (!rights.granted) throw new Error(`Ingestion refused: ${rights.reason} See RIGHTS.md.`);

const pdf = resolve(args.pdf);
const stat = lstatSync(pdf);
if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("PDF input must be a regular file");
if (stat.size === 0 || stat.size > 100 * 1024 * 1024) throw new Error("PDF input has an invalid size");
const digest = await sha256(pdf);
if (paper.expectedSha256 && digest !== paper.expectedSha256) throw new Error(`Source SHA-256 mismatch for ${paper.id}`);
const info = execFileSync("pdfinfo", [pdf], { encoding: "utf8", maxBuffer: 1024 * 1024 });
const pages = Number(info.match(/^Pages:\s+(\d+)$/m)?.[1]);
if (!pages || (paper.expectedPages && pages !== paper.expectedPages)) throw new Error(`Unexpected PDF page count: ${pages || "unknown"}`);
const extracted = execFileSync("pdftotext", ["-layout", pdf, "-"], {
  encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
});
const chunks = chunkPages(extracted.split("\f").slice(0, pages));
if (chunks.length < pages) throw new Error("Extraction produced too few page-anchored chunks");
const dbPath = args.db || join(process.env.DATA_DIR || join(ROOT, "data"), "paper2agent.sqlite");
const db = openDatabase(resolve(dbPath));
replacePaperChunks(db, paper, digest, pages, chunks, textHash);
db.close();
console.log(JSON.stringify({ paper: paper.id, pages, chunks: chunks.length, database: resolve(dbPath) }));
