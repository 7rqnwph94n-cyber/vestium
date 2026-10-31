// ─── ISO 7010 SVG Fetcher ─────────────────────────────────────────────────────
// Downloads ISO 7010 safety symbol SVGs from Wikimedia Commons and stores them
// in public/assets/iso7010/. Updates proxy_assets.svg_path after each download.
//
// Source: Wikimedia Commons — most ISO 7010 symbols are public domain.
//   Verify individual file licences at:
//   https://commons.wikimedia.org/wiki/Category:ISO_7010_safety_signs
//
// Run: pnpm --filter @complianceforge/api run assets:fetch-svgs
//
// Safe to re-run: skips any symbol where svg_path is already set.
// IEC 60417 symbols are never fetched (commercial licence — metadata only).

import { writeFile, mkdir, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from '../db/client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '../../public/assets/iso7010');

const WIKI_API = 'https://commons.wikimedia.org/w/api.php';
// Wikimedia asks for a descriptive User-Agent identifying your tool + contact.
const USER_AGENT = 'Vestium SVG Fetcher/1.0 (compliance training platform; contact via github.com/richbrotherton87-svg/vestium)';
// Polite inter-request delay — Wikimedia media download servers rate-limit aggressively.
const DELAY_MS = 2500;
// On 429, wait this long then retry once before giving up.
const RETRY_DELAY_MS = 30000;

// ─── Wikimedia API ────────────────────────────────────────────────────────────

interface WikiResult {
  url: string;
  licenceShortName: string;
}

async function resolveWikiSvg(code: string): Promise<WikiResult | null> {
  const filename = `ISO_7010_${code}.svg`;
  const params = new URLSearchParams({
    action:        'query',
    titles:        `File:${filename}`,
    prop:          'imageinfo',
    iiprop:        'url|extmetadata',
    iiextmetadatafilter: 'LicenseShortName',
    format:        'json',
    formatversion: '2',
  });

  const res = await fetch(`${WIKI_API}?${params}`, {
    headers: { 'User-Agent': USER_AGENT },
  });

  if (!res.ok) {
    throw new Error(`Wikimedia API HTTP ${res.status} for ${code}`);
  }

  const data = await res.json() as {
    query: { pages: Array<{ missing?: boolean; imageinfo?: Array<{ url: string; extmetadata?: { LicenseShortName?: { value: string } } }> }> }
  };

  const page = data?.query?.pages?.[0];
  if (!page || page.missing || !page.imageinfo?.length) return null;

  const info = page.imageinfo[0];
  return {
    url: info.url,
    licenceShortName: info.extmetadata?.LicenseShortName?.value ?? 'unknown',
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  // Fetch all ISO 7010 symbols and check for physical file existence.
  // The seed script pre-populates svg_path so we cannot rely on svg_path IS NULL.
  const allRows = (await sql`
    SELECT symbol_code
    FROM proxy_assets
    WHERE standard = 'iso7010'
    ORDER BY symbol_code
  `) as { symbol_code: string }[];

  // Filter to those whose SVG file does not yet exist on disk
  const rows: { symbol_code: string }[] = [];
  for (const row of allRows) {
    const filePath = join(OUT_DIR, `${row.symbol_code}.svg`);
    const exists = await access(filePath).then(() => true).catch(() => false);
    if (!exists) rows.push(row);
  }

  if (rows.length === 0) {
    console.log('All ISO 7010 SVGs already downloaded. Nothing to do.');
    return;
  }

  console.log(`Fetching ${rows.length} ISO 7010 symbols from Wikimedia Commons...\n`);

  const missing: string[] = [];
  let ok = 0, errors = 0;

  for (const { symbol_code } of rows) {
    await new Promise(r => setTimeout(r, DELAY_MS));

    try {
      const result = await resolveWikiSvg(symbol_code);

      if (!result) {
        console.log(`  MISSING   ${symbol_code}  (not on Commons as ISO_7010_${symbol_code}.svg)`);
        missing.push(symbol_code);
        continue;
      }

      let svgRes = await fetch(result.url, { headers: { 'User-Agent': USER_AGENT } });
      if (svgRes.status === 429) {
        console.log(`  RETRY     ${symbol_code}  (429 — waiting ${RETRY_DELAY_MS / 1000}s)`);
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        svgRes = await fetch(result.url, { headers: { 'User-Agent': USER_AGENT } });
      }
      if (!svgRes.ok) {
        console.log(`  ERROR     ${symbol_code}  (download HTTP ${svgRes.status})`);
        errors++;
        continue;
      }

      const svgText = await svgRes.text();
      const outFile = `${symbol_code}.svg`;
      await writeFile(join(OUT_DIR, outFile), svgText, 'utf8');

      const svgPath = `iso7010/${outFile}`;
      await sql`
        UPDATE proxy_assets
        SET svg_path = ${svgPath}
        WHERE symbol_code = ${symbol_code} AND standard = 'iso7010'
      `;

      console.log(`  OK        ${symbol_code}  (${result.licenceShortName})`);
      ok++;

    } catch (err) {
      console.log(`  ERROR     ${symbol_code}`, err instanceof Error ? err.message : err);
      errors++;
    }
  }

  console.log(`\n─────────────────────────────────────────────`);
  console.log(`Downloaded:  ${ok}`);
  console.log(`Not on Commons: ${missing.length}${missing.length ? '  → ' + missing.join(', ') : ''}`);
  console.log(`Errors:      ${errors}`);
  console.log(`─────────────────────────────────────────────`);

  if (missing.length > 0) {
    console.log(`\nFor missing symbols, check Commons manually:`);
    console.log(`  https://commons.wikimedia.org/wiki/Category:ISO_7010_safety_signs`);
    console.log(`Some codes use alternate naming (e.g. ISO_7010_W017_(2011).svg).`);
    console.log(`Place the SVG manually at public/assets/iso7010/{CODE}.svg then run:`);
    console.log(`  UPDATE proxy_assets SET svg_path = 'iso7010/{CODE}.svg' WHERE symbol_code = '{CODE}';`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
