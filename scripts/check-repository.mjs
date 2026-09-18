import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const forbidden = tracked.filter((name) => /(^|\/)(data|secrets|source)\/.*\.(pdf|sqlite|key)$/i.test(name) || /\.pdf$/i.test(name));
if (forbidden.length) throw new Error(`Protected/runtime files are tracked: ${forbidden.join(", ")}`);
const secretPattern = /(?:sk-or-v1-[A-Za-z0-9_-]{20,}|-----BEGIN (?:OPENSSH |RSA )?PRIVATE KEY-----)/;
for (const filename of tracked.filter((name) => /\.(?:md|mjs|js|json|ya?ml|example|txt)$/i.test(name))) {
  if (secretPattern.test(readFileSync(filename, "utf8"))) throw new Error(`Potential secret in tracked file: ${filename}`);
}
console.log(`Repository check passed (${tracked.length} tracked files inspected).`);
