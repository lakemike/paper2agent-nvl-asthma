import { statSync } from "node:fs";

export function permissionStatus(paper, env = process.env) {
  if (!paper.rights.requiresWrittenPermission) {
    return { granted: true, reason: "Für diese Quelle ist keine zusätzliche Rechtefreigabe erforderlich." };
  }
  if (String(env.SOURCE_USE_PERMISSION_GRANTED).toLowerCase() !== "true") {
    return { granted: false, reason: "Die schriftliche Nutzungserlaubnis wurde noch nicht bestätigt." };
  }
  const evidencePath = env.PERMISSION_EVIDENCE_FILE;
  if (!evidencePath) return { granted: false, reason: "Der Nachweis der Nutzungserlaubnis ist nicht konfiguriert." };
  try {
    const stat = statSync(evidencePath);
    if (!stat.isFile() || stat.size === 0) throw new Error("empty or not a file");
  } catch {
    return { granted: false, reason: "Der konfigurierte Nachweis der Nutzungserlaubnis fehlt oder ist leer." };
  }
  return { granted: true, reason: "Die schriftliche Nutzungserlaubnis ist bestätigt und ihr Nachweis eingebunden." };
}
