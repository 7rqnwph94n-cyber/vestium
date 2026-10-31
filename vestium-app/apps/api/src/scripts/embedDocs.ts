// ─── Regulatory Document Embedder ────────────────────────────────────────────
// Three-phase script:
//   Phase 1 — Seed:  upsert all source_documents from the 17 regulatory schemas.
//   Phase 2 — Embed: fetch legislation.gov.uk XML for each SI/Act, parse into
//                    regulation-level chunks, embed via Gemini gemini-embedding-001
//                    (768 dims via outputDimensionality), upsert to document_chunks.
//   Phase 3 — Embed: fetch HSE PDFs (ACOPs + guidance) by URL, parse with pdf-parse,
//                    chunk the extracted text, embed, upsert. Skips docs that return
//                    a non-200 or non-PDF response (some publications are still priced).
//
// Run: pnpm --filter @complianceforge/api run db:embed-docs
//
// Requirements:
//   GEMINI_API_KEY — already in .env; used for both generation and embeddings
//   DATABASE_URL   — Neon connection string
//
// Idempotent: safe to re-run. Existing chunks are deleted and replaced per source doc.

import { neon } from '@neondatabase/serverless';
import { PDFParse } from 'pdf-parse';

// ─── Schema imports ───────────────────────────────────────────────────────────

import { MHSWR_1999 }            from '../regulatory/schemas/mhswr.js';
import { COSHH_2002 }            from '../regulatory/schemas/coshh.js';
import { PUWER_1998 }            from '../regulatory/schemas/puwer.js';
import { LOLER_1998 }            from '../regulatory/schemas/loler.js';
import { MANUAL_HANDLING_1992 }  from '../regulatory/schemas/manualHandling.js';
import { DSEAR_2002 }            from '../regulatory/schemas/dsear.js';
import { CDM_2015 }              from '../regulatory/schemas/cdm.js';
import { PPE_1992 }              from '../regulatory/schemas/ppe.js';
import { WORK_AT_HEIGHT_2005 }   from '../regulatory/schemas/workAtHeight.js';
import { WORKPLACE_1992 }        from '../regulatory/schemas/workplace.js';
import { DSE_1992 }              from '../regulatory/schemas/dse.js';
import { ELECTRICITY_AT_WORK_1989 } from '../regulatory/schemas/electricityAtWork.js';
import { CONFINED_SPACES_1997 }  from '../regulatory/schemas/confinedSpaces.js';
import { ASBESTOS_2012 }         from '../regulatory/schemas/asbestos.js';
import { NOISE_2005 }            from '../regulatory/schemas/noise.js';
import { VIBRATION_2005 }        from '../regulatory/schemas/vibration.js';
import { WAREHOUSING_STORAGE }   from '../regulatory/schemas/warehousing.js';
import type { RegulatorySchema, RegulatorySourceDocument } from '../regulatory/types.js';

// ─── Config ───────────────────────────────────────────────────────────────────

const CHUNK_TARGET_WORDS  = 600;  // ~800 tokens (gemini-embedding-001 handles up to 2048)
const CHUNK_OVERLAP_WORDS = 80;
const EMBED_BATCH_SIZE    = 5;    // concurrent embedContent calls — free tier: 100 RPM
const EMBED_MODEL         = 'gemini-embedding-001';
const EMBED_DIMS          = 768;  // truncated via outputDimensionality (native: 3072, Neon index cap: 2000)
const RATE_LIMIT_DELAY_MS = 4000; // 4s between batches of 5 = 75 RPM (under 100 RPM free-tier limit)

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is required');

const sql = neon(process.env.DATABASE_URL);

// ─── All schemas ──────────────────────────────────────────────────────────────

const ALL_SCHEMAS: RegulatorySchema[] = [
  MHSWR_1999, COSHH_2002, PUWER_1998, LOLER_1998, MANUAL_HANDLING_1992,
  DSEAR_2002, CDM_2015, PPE_1992, WORK_AT_HEIGHT_2005, WORKPLACE_1992,
  DSE_1992, ELECTRICITY_AT_WORK_1989, CONFINED_SPACES_1997, ASBESTOS_2012,
  NOISE_2005, VIBRATION_2005, WAREHOUSING_STORAGE,
];

// ─── Phase 1: Seed source_documents ──────────────────────────────────────────

async function seedSourceDocuments(): Promise<RegulatorySourceDocument[]> {
  console.log('\n── Phase 1: Seeding source_documents ──');
  const seen = new Set<string>();
  const all: RegulatorySourceDocument[] = [];

  for (const schema of ALL_SCHEMAS) {
    for (const doc of schema.sourceDocuments) {
      if (seen.has(doc.id)) continue;
      seen.add(doc.id);
      all.push(doc);
    }
  }

  // Map schema IDs: doc ID → schema ID (first schema that lists this doc)
  const docToSchema = new Map<string, string>();
  for (const schema of ALL_SCHEMAS) {
    for (const doc of schema.sourceDocuments) {
      if (!docToSchema.has(doc.id)) docToSchema.set(doc.id, schema.id);
    }
  }

  let inserted = 0;
  let updated  = 0;

  for (const doc of all) {
    const schemaId = docToSchema.get(doc.id) ?? 'unknown';
    const result = await sql`
      INSERT INTO source_documents
        (id, schema_id, title, url, publisher, doc_type, year, version,
         effective_date, is_current, created_at, updated_at)
      VALUES (
        ${doc.id},
        ${schemaId},
        ${doc.title},
        ${doc.url},
        ${doc.publisher},
        ${doc.docType},
        ${doc.year},
        ${doc.version ?? null},
        ${doc.versionDate ?? null}::date,
        ${doc.currentVersion},
        now(),
        now()
      )
      ON CONFLICT (id) DO UPDATE SET
        title        = EXCLUDED.title,
        url          = EXCLUDED.url,
        publisher    = EXCLUDED.publisher,
        doc_type     = EXCLUDED.doc_type,
        year         = EXCLUDED.year,
        version      = EXCLUDED.version,
        effective_date = EXCLUDED.effective_date,
        is_current   = EXCLUDED.is_current,
        updated_at   = now()
      RETURNING (xmax = 0) AS was_inserted
    `;
    const wasInserted = (result[0] as Record<string, unknown>)['was_inserted'];
    if (wasInserted) inserted++; else updated++;
  }

  console.log(`  ${all.length} source docs processed: ${inserted} inserted, ${updated} updated`);
  return all;
}

// ─── URL → XML data URL ────────────────────────────────────────────────────────
// legislation.gov.uk convention:
//   https://www.legislation.gov.uk/uksi/1999/3242/contents/made
//   → https://www.legislation.gov.uk/uksi/1999/3242/data.xml

function toXmlDataUrl(url: string): string | null {
  const m = url.match(/(https:\/\/www\.legislation\.gov\.uk\/[a-z]+\/\d{4}\/[^/]+)/);
  if (!m) return null;
  return `${m[1]}/data.xml`;
}

// ─── XML utilities ────────────────────────────────────────────────────────────

function stripTags(xml: string): string {
  return xml
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#\d+;/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

interface Section {
  label: string;
  text: string;
}

function extractSections(xml: string): Section[] {
  const sections: Section[] = [];

  // CLML uses <Regulation> for SIs, <P1group> for Act sections.
  // Try <Regulation> first, then <Article>, then <P1group>.
  const patterns = [
    /<Regulation\b[^>]*>([\s\S]*?)<\/Regulation>/g,
    /<Article\b[^>]*>([\s\S]*?)<\/Article>/g,
    /<P1group\b[^>]*>([\s\S]*?)<\/P1group>/g,
  ];

  for (const re of patterns) {
    let match: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((match = re.exec(xml)) !== null) {
      const content = match[1];
      const numM  = content.match(/<Pnumber[^>]*>([\s\S]*?)<\/Pnumber>/);
      const ttlM  = content.match(/<Title[^>]*>([\s\S]*?)<\/Title>/) ??
                    content.match(/<Heading[^>]*>([\s\S]*?)<\/Heading>/);
      const num   = numM  ? stripTags(numM[1]).trim()  : '';
      const title = ttlM  ? stripTags(ttlM[1]).trim()  : '';
      const label = num && title ? `Regulation ${num} — ${title}`
                  : num          ? `Regulation ${num}`
                  : title        ? title
                  : '';
      const text = stripTags(content).replace(/\s{2,}/g, ' ').trim();
      if (text.length > 30) sections.push({ label, text });
    }
    if (sections.length > 0) break;
  }

  // Also extract schedules
  const schedRe = /<Schedule\b[^>]*>([\s\S]*?)<\/Schedule>/g;
  let sm: RegExpExecArray | null;
  while ((sm = schedRe.exec(xml)) !== null) {
    const content = sm[1];
    const ttlM = content.match(/<Title[^>]*>([\s\S]*?)<\/Title>/) ??
                 content.match(/<Number[^>]*>([\s\S]*?)<\/Number>/);
    const label = ttlM ? `Schedule — ${stripTags(ttlM[1]).trim()}` : 'Schedule';
    const text  = stripTags(content).replace(/\s{2,}/g, ' ').trim();
    if (text.length > 30) sections.push({ label, text });
  }

  // Fallback: treat entire document body as one section
  if (sections.length === 0) {
    const bodyM = xml.match(/<Body>([\s\S]*?)<\/Body>/) ??
                  xml.match(/<Secondary>([\s\S]*?)<\/Secondary>/);
    const text = stripTags(bodyM ? bodyM[1] : xml).replace(/\s{2,}/g, ' ').trim();
    if (text.length > 30) sections.push({ label: '', text });
  }

  return sections;
}

// ─── Chunking ─────────────────────────────────────────────────────────────────
// Splits text into word-count-bounded chunks with overlap.

interface Chunk {
  chunkIndex: number;
  sectionLabel: string;
  content: string;
  tokenCount: number;  // estimated: words * 1.33
}

function chunkSection(section: Section, startIndex: number): Chunk[] {
  const words = section.text.split(' ');
  if (words.length <= CHUNK_TARGET_WORDS) {
    return [{
      chunkIndex: startIndex,
      sectionLabel: section.label,
      content: section.text,
      tokenCount: Math.ceil(words.length * 1.33),
    }];
  }

  const chunks: Chunk[] = [];
  let offset = 0;
  let idx = startIndex;

  while (offset < words.length) {
    const slice = words.slice(offset, offset + CHUNK_TARGET_WORDS).join(' ');
    chunks.push({
      chunkIndex: idx++,
      sectionLabel: section.label,
      content: slice,
      tokenCount: Math.ceil(Math.min(CHUNK_TARGET_WORDS, words.length - offset) * 1.33),
    });
    offset += CHUNK_TARGET_WORDS - CHUNK_OVERLAP_WORDS;
  }

  return chunks;
}

// ─── Embedding (gemini-embedding-001 via embedContent, concurrent batch) ──────
// gemini-embedding-001 uses embedContent (not batchEmbedContents).
// We fan out EMBED_BATCH_SIZE concurrent requests per wave.

async function embedOne(text: string, attempt = 1): Promise<number[]> {
  const key = process.env.GEMINI_API_KEY!;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${encodeURIComponent(key)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: `models/${EMBED_MODEL}`,
        content: { parts: [{ text }] },
        outputDimensionality: EMBED_DIMS,
      }),
    });
  } catch (networkErr) {
    // ECONNRESET / transient network failure — retry up to 3 times with backoff
    if (attempt <= 3) {
      const delay = attempt * 5000;
      process.stdout.write(`\n  [network error, retry ${attempt}/3 in ${delay / 1000}s] `);
      await new Promise((r) => setTimeout(r, delay));
      return embedOne(text, attempt + 1);
    }
    throw networkErr;
  }

  if (response.status === 429) {
    // Parse retryDelay from response or fall back to 60s
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    const details = ((body as Record<string, unknown>)['error'] as Record<string, unknown> | undefined)?.['details'] as Array<Record<string, unknown>> | undefined;
    let retryAfterMs = 60_000;
    if (details) {
      for (const d of details) {
        if (d['@type'] === 'type.googleapis.com/google.rpc.RetryInfo') {
          const s = String(d['retryDelay'] ?? '').replace('s', '');
          if (s) retryAfterMs = Math.ceil(Number(s)) * 1000 + 2000;
        }
      }
    }
    process.stdout.write(`\n  [rate limited — waiting ${Math.round(retryAfterMs / 1000)}s] `);
    await new Promise((r) => setTimeout(r, retryAfterMs));
    return embedOne(text, attempt);
  }

  if (!response.ok) {
    const err = await response.text().catch(() => `HTTP ${response.status}`);
    throw new Error(`Gemini embedding failed: ${err}`);
  }

  const json = await response.json() as { embedding: { values: number[] } };
  return json.embedding.values;
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  return Promise.all(texts.map((t) => embedOne(t)));
}

async function embedAllChunks(chunks: Chunk[]): Promise<Array<Chunk & { embedding: number[] }>> {
  const result: Array<Chunk & { embedding: number[] }> = [];

  for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
    const texts  = batch.map((c) => c.content);
    const vecs   = await embedBatch(texts);
    for (let j = 0; j < batch.length; j++) {
      result.push({ ...batch[j], embedding: vecs[j] });
    }
    if (i + EMBED_BATCH_SIZE < chunks.length) {
      await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS));
    }
    process.stdout.write(`  embedded ${Math.min(i + EMBED_BATCH_SIZE, chunks.length)}/${chunks.length} chunks\r`);
  }
  console.log(); // newline after progress
  return result;
}

// ─── Phase 2: Fetch, chunk, embed, store ──────────────────────────────────────

async function processSourceDoc(doc: RegulatorySourceDocument): Promise<boolean> {
  if (doc.publisher !== 'legislation.gov.uk') return false;

  // Skip if already embedded — idempotent re-run support (avoids burning rate-limit quota)
  const existing = await sql`SELECT COUNT(*)::int AS cnt FROM document_chunks WHERE source_doc_id = ${doc.id}`;
  const existingCnt = (existing[0] as Record<string, unknown>)['cnt'] as number;
  if (existingCnt > 0) {
    console.log(`  [SKIP] Already has ${existingCnt} chunks`);
    return true;
  }

  const xmlUrl = toXmlDataUrl(doc.url);
  if (!xmlUrl) {
    console.log(`  [SKIP] Cannot build XML URL from: ${doc.url}`);
    return false;
  }

  process.stdout.write(`  Fetching ${xmlUrl} ... `);
  let xml: string;
  try {
    const res = await fetch(xmlUrl, {
      headers: { 'Accept': 'application/xml, text/xml, */*' },
    });
    if (!res.ok) {
      console.log(`HTTP ${res.status} — skipping`);
      return false;
    }
    xml = await res.text();
    console.log(`${xml.length.toLocaleString()} bytes`);
  } catch (err) {
    console.log(`fetch error: ${err instanceof Error ? err.message : String(err)} — skipping`);
    return false;
  }

  const sections = extractSections(xml);
  if (sections.length === 0) {
    console.log(`  [SKIP] No sections extracted from ${doc.id}`);
    return false;
  }

  const allChunks: Chunk[] = [];
  let idx = 0;
  for (const section of sections) {
    const cs = chunkSection(section, idx);
    allChunks.push(...cs);
    idx += cs.length;
  }

  console.log(`  ${sections.length} sections → ${allChunks.length} chunks`);

  const embedded = await embedAllChunks(allChunks);

  // Delete old chunks for this source doc, then insert fresh
  await sql`DELETE FROM document_chunks WHERE source_doc_id = ${doc.id}`;

  for (const chunk of embedded) {
    // pgvector expects the vector as a string literal '[a,b,c,...]'
    const vecLiteral = `[${chunk.embedding.join(',')}]`;
    await sql`
      INSERT INTO document_chunks
        (source_doc_id, chunk_index, content, embedding, token_count, section_label)
      VALUES (
        ${doc.id},
        ${chunk.chunkIndex},
        ${chunk.content},
        ${vecLiteral}::vector,
        ${chunk.tokenCount},
        ${chunk.sectionLabel || null}
      )
    `;
  }

  console.log(`  Stored ${embedded.length} chunks for ${doc.id}`);
  return true;
}

// ─── Phase 3: Fetch HSE PDFs, parse, chunk, embed, store ─────────────────────
// ACOPs have quasi-legal status under UK H&S law — admissible evidence of breach.
// Most are freely downloadable from hse.gov.uk under OGL v3. The /priced/ URL path
// is a legacy artifact from pre-2020 when some were sold; the HTTP response determines
// reachability. Docs that return non-200 or a non-PDF body are silently skipped.

async function processHsePdfDoc(doc: RegulatorySourceDocument): Promise<boolean> {
  if (doc.publisher !== 'hse.gov.uk') return false;

  // Skip if already embedded — idempotent re-run support
  const existing = await sql`SELECT COUNT(*)::int AS cnt FROM document_chunks WHERE source_doc_id = ${doc.id}`;
  const existingCnt = (existing[0] as Record<string, unknown>)['cnt'] as number;
  if (existingCnt > 0) {
    console.log(`  [SKIP] Already has ${existingCnt} chunks`);
    return true;
  }

  process.stdout.write(`  Fetching ${doc.url} ... `);
  let pdfBuffer: Buffer;
  try {
    const res = await fetch(doc.url, {
      headers: {
        'User-Agent': 'Vestium/1.0 regulatory corpus builder; contact rich@vestium.co.uk',
        'Accept': 'application/pdf, */*',
      },
    });
    if (!res.ok) {
      console.log(`HTTP ${res.status} — skipping`);
      return false;
    }
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('pdf')) {
      console.log(`not a PDF response (${contentType}) — skipping`);
      return false;
    }
    pdfBuffer = Buffer.from(await res.arrayBuffer());
    console.log(`${pdfBuffer.length.toLocaleString()} bytes`);
  } catch (err) {
    console.log(`fetch error: ${err instanceof Error ? err.message : String(err)} — skipping`);
    return false;
  }

  let text: string;
  let pageCount: number;
  try {
    const parser = new PDFParse({ data: new Uint8Array(pdfBuffer) });
    const parsed = await parser.getText();
    text = parsed.text;
    pageCount = parsed.total;
    await parser.destroy();
  } catch (err) {
    console.log(`  [SKIP] PDF parse failed: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }

  const cleanText = text.replace(/\s{2,}/g, ' ').trim();
  if (!cleanText) {
    console.log(`  [SKIP] No extractable text — may be a scanned image PDF`);
    return false;
  }

  // Treat the document as a single section; chunkSection handles the splitting.
  const section: Section = { label: doc.title, text: cleanText };
  const allChunks = chunkSection(section, 0);

  console.log(`  ${pageCount} pages → ${allChunks.length} chunks`);

  const embedded = await embedAllChunks(allChunks);

  await sql`DELETE FROM document_chunks WHERE source_doc_id = ${doc.id}`;

  for (const chunk of embedded) {
    const vecLiteral = `[${chunk.embedding.join(',')}]`;
    await sql`
      INSERT INTO document_chunks
        (source_doc_id, chunk_index, content, embedding, token_count, section_label)
      VALUES (
        ${doc.id},
        ${chunk.chunkIndex},
        ${chunk.content},
        ${vecLiteral}::vector,
        ${chunk.tokenCount},
        ${chunk.sectionLabel || null}
      )
    `;
  }

  console.log(`  Stored ${embedded.length} chunks for ${doc.id}`);
  return true;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const allDocs = await seedSourceDocuments();

const legislationDocs = allDocs.filter((d) => d.publisher === 'legislation.gov.uk');
console.log(`\n── Phase 2: Embedding ${legislationDocs.length} legislation.gov.uk documents ──\n`);

let processed = 0;
let skipped   = 0;

for (const doc of legislationDocs) {
  console.log(`\n[${processed + skipped + 1}/${legislationDocs.length}] ${doc.id} — ${doc.title}`);
  const ok = await processSourceDoc(doc);
  if (ok) processed++; else skipped++;
}

console.log(`\n── Phase 2 complete: ${processed} legislation docs embedded, ${skipped} skipped ──`);

// ─── Phase 3: HSE PDFs (ACOPs + guidance) ────────────────────────────────────

const hseDocs = allDocs.filter((d) => d.publisher === 'hse.gov.uk');
console.log(`\n── Phase 3: Embedding ${hseDocs.length} HSE documents (ACOPs + guidance) ──`);
console.log('   (Docs behind a paywall or returning non-PDF responses are skipped)\n');

let hseProcessed = 0;
let hseSkipped   = 0;

for (const doc of hseDocs) {
  console.log(`\n[${hseProcessed + hseSkipped + 1}/${hseDocs.length}] ${doc.id} — ${doc.title}`);
  try {
    const ok = await processHsePdfDoc(doc);
    if (ok) hseProcessed++; else hseSkipped++;
  } catch (err) {
    console.log(`  [ERROR] ${err instanceof Error ? err.message : String(err)} — skipping`);
    hseSkipped++;
  }
}

console.log(`\n── Phase 3 complete: ${hseProcessed} HSE docs embedded, ${hseSkipped} skipped ──\n`);
