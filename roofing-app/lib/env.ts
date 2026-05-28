/** Read env vars safely in client and server bundles (no Node.js fs). */
export function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  if (value.includes("paste_") || value.includes("your_key_here")) return undefined;
  return value;
}
