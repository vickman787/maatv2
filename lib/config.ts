import path from "node:path";

let envLoaded = false;

export function loadLocalEnv(): void {
  if (envLoaded) return;
  envLoaded = true;
  if (process.env.DATABASE_URL) return;
  for (const file of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(path.join(process.cwd(), file));
      return;
    } catch {
      // File missing or unsupported; Next loads env in the web process.
    }
  }
}

export function env(name: string, fallback = ""): string {
  loadLocalEnv();
  return process.env[name] ?? fallback;
}

export function envInt(name: string, fallback: number): number {
  const raw = env(name);
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function appUrl(): string {
  return env("APP_URL", "http://localhost:3200").replace(/\/+$/, "");
}

export function databaseFile(): string {
  loadLocalEnv();
  const raw = process.env.DATABASE_URL ?? "file:./data/maatv2.db";
  const withoutScheme = raw.startsWith("file:") ? raw.slice(5) : raw;
  return path.isAbsolute(withoutScheme)
    ? withoutScheme
    : path.resolve(process.cwd(), withoutScheme);
}

export function uploadDir(): string {
  loadLocalEnv();
  const raw = process.env.UPLOAD_DIR ?? "./data/uploads";
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

export function uploadMaxBytes(): number {
  return envInt("UPLOAD_MAX_MB", 5) * 1024 * 1024;
}

export function csvMaxRows(): number {
  return envInt("CSV_MAX_ROWS", 5000);
}

export function demoMaxPerHour(): number {
  return envInt("DEMO_MAX_PER_HOUR", 10);
}

export function demoTtlHours(): number {
  return envInt("DEMO_TTL_HOURS", 24);
}

export function privyAppId(): string {
  return env("PRIVY_APP_ID", env("NEXT_PUBLIC_PRIVY_APP_ID"));
}

export function aiConfig(): {
  baseUrl: string;
  apiKey: string;
  model: string;
  configured: boolean;
} {
  const baseUrl = env("AI_BASE_URL", "").trim().replace(/\/+$/, "");
  const apiKey = env("AI_API_KEY", "").trim();
  const model = env("AI_MODEL", "").trim();
  return { baseUrl, apiKey, model, configured: Boolean(baseUrl && apiKey && model) };
}
