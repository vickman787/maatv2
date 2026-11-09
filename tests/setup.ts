import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "maat-test-"));
process.env.APP_URL = "http://localhost:3201";
process.env.SESSION_SECRET = "test-session-secret-0123456789abcdef0123456789abcdef";
process.env.PRIVY_APP_ID = "test-app-id";
process.env.DATABASE_URL = `file:${path.join(root, "test.db")}`;
process.env.UPLOAD_DIR = path.join(root, "uploads");
process.env.AI_BASE_URL = "";
process.env.AI_API_KEY = "";
process.env.AI_MODEL = "";

