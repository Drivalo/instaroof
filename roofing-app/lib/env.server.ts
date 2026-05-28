import fs from "fs";
import path from "path";

let envLoaded = false;

function parseEnvFile(filePath: string, override: boolean) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!override && process.env[key] !== undefined) continue;
    process.env[key] = value;
  }
}

/** Load .env.local from roofing-app and parent folder (server/API routes only). */
export function ensureEnvLoaded() {
  if (envLoaded) return;
  envLoaded = true;

  const appDir = process.cwd();
  const parentDir = path.resolve(appDir, "..");

  parseEnvFile(path.join(parentDir, ".env.local"), false);
  parseEnvFile(path.join(appDir, ".env.local"), true);
}
