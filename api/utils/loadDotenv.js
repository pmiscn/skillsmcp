import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function tryLoadDotenv() {
  const candidates = [
    // api/.env (when running from project root)
    path.join(process.cwd(), 'api', '.env'),
    // api/dist/.env (when running compiled files in dist)
    path.join(__dirname, '.env'),
    // api/.env relative to dist directory
    path.join(__dirname, '..', '.env'),
    // project root .env
    path.join(process.cwd(), '.env'),
  ];

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        dotenv.config({ path: p });
        console.log(`[loadDotenv] Loaded env from ${p}`);
        return p;
      }
    } catch (e) {
      // ignore and continue
    }
  }

  console.log('[loadDotenv] No .env file found in candidates; skipping dotenv load');
  return null;
}

tryLoadDotenv();
