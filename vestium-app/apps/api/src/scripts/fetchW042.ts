// Fetch W042 arc flash SVG using its non-standard Wikimedia Commons filename.
// Run: pnpm --filter @complianceforge/api exec tsx --env-file=.env src/scripts/fetchW042.ts

import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '../../public/assets/iso7010');

const W042_URL = 'https://upload.wikimedia.org/wikipedia/commons/7/73/ISO_7010_W042_warning%3B_arc_flash_hazard.svg';
const UA = 'Vestium SVG Fetcher/1.0 (compliance training platform)';

await mkdir(OUT_DIR, { recursive: true });

console.log('Fetching W042 (electric arc flash)...');
const res = await fetch(W042_URL, { headers: { 'User-Agent': UA } });
if (!res.ok) {
  console.error(`HTTP ${res.status}`);
  process.exit(1);
}
const svg = await res.text();
await writeFile(join(OUT_DIR, 'W042.svg'), svg, 'utf8');
console.log(`OK — W042.svg written (${svg.length} bytes)`);
