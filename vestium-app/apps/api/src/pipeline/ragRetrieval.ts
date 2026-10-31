// ─── RAG Retrieval ────────────────────────────────────────────────────────────
// Embeds a query string with gemini-embedding-001 (768 dims via outputDimensionality)
// then runs a pgvector cosine similarity search against document_chunks.
// Returns formatted statute text blocks ready for prompt injection.
//
// Non-blocking: all exported functions catch errors and return '' on failure
// so a retrieval outage never breaks a generation run.

import { sql } from '../db/client.js';

const EMBED_MODEL = 'gemini-embedding-001';
const EMBED_DIMS  = 768;

// ─── Embed a single query string ──────────────────────────────────────────────

async function embedQuery(text: string): Promise<number[]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${EMBED_MODEL}`,
      content: { parts: [{ text }] },
      outputDimensionality: EMBED_DIMS,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`Gemini embed failed: ${err}`);
  }

  const json = await res.json() as { embedding: { values: number[] } };
  return json.embedding.values;
}

// ─── Similarity search ────────────────────────────────────────────────────────

interface RagChunk {
  content: string;
  sectionLabel: string | null;
  sourceDocId: string;
  similarity: number;
}

async function similaritySearch(
  queryVec: number[],
  topK: number,
  sourceDocIds?: string[]
): Promise<RagChunk[]> {
  const vecLiteral = `[${queryVec.join(',')}]`;

  let rows: Record<string, unknown>[];

  if (sourceDocIds && sourceDocIds.length > 0) {
    rows = await sql`
      SELECT
        content,
        section_label,
        source_doc_id,
        1 - (embedding <=> ${vecLiteral}::vector) AS similarity
      FROM document_chunks
      WHERE source_doc_id = ANY(${sourceDocIds})
        AND embedding IS NOT NULL
      ORDER BY embedding <=> ${vecLiteral}::vector
      LIMIT ${topK}
    ` as Record<string, unknown>[];
  } else {
    rows = await sql`
      SELECT
        content,
        section_label,
        source_doc_id,
        1 - (embedding <=> ${vecLiteral}::vector) AS similarity
      FROM document_chunks
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> ${vecLiteral}::vector
      LIMIT ${topK}
    ` as Record<string, unknown>[];
  }

  return rows.map((r) => ({
    content: r['content'] as string,
    sectionLabel: r['section_label'] as string | null,
    sourceDocId: r['source_doc_id'] as string,
    similarity: Number(r['similarity']),
  }));
}

// ─── Source doc IDs for applicable regulatory schemas ─────────────────────────
// Looks up all legislation.gov.uk source docs whose schema_id is in the given list.

async function sourceDocIdsForSchemas(schemaIds: string[]): Promise<string[]> {
  if (schemaIds.length === 0) return [];
  const rows = await sql`
    SELECT id FROM source_documents
    WHERE schema_id = ANY(${schemaIds})
      AND publisher = 'legislation.gov.uk'
  ` as Record<string, unknown>[];
  return rows.map((r) => r['id'] as string);
}

// ─── Format retrieved chunks as a prompt block ────────────────────────────────

function formatRagBlock(chunks: RagChunk[]): string {
  if (chunks.length === 0) return '';

  const passages = chunks.map((c) => {
    const label = c.sectionLabel ? `${c.sourceDocId} — ${c.sectionLabel}` : c.sourceDocId;
    return `[${label}]\n${c.content.trim()}`;
  });

  return `<STATUTORY_SOURCE_TEXT>
The following passages are extracted verbatim from UK legislation in the regulatory corpus.
Treat these as authoritative primary sources. Do not contradict them.

${passages.join('\n\n')}
</STATUTORY_SOURCE_TEXT>`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Retrieve the top-K most relevant statutory passages for a query.
 * @param queryText   Free-text query (domain prompt, stage topic, etc.)
 * @param schemaIds   Applicable regulatory schema IDs — used to narrow search to relevant docs.
 *                    Pass [] to search across all embedded documents.
 * @param topK        Number of chunks to retrieve (default 5)
 * @returns           Formatted <STATUTORY_SOURCE_TEXT> block, or '' on failure
 */
export async function retrieveStatutoryContext(
  queryText: string,
  schemaIds: string[] = [],
  topK = 5
): Promise<string> {
  try {
    const [queryVec, sourceDocIds] = await Promise.all([
      embedQuery(queryText),
      sourceDocIdsForSchemas(schemaIds),
    ]);

    const chunks = await similaritySearch(queryVec, topK, sourceDocIds.length > 0 ? sourceDocIds : undefined);

    // Discard very low similarity results (similarity < 0.55 is noise)
    const relevant = chunks.filter((c) => c.similarity >= 0.55);
    if (relevant.length === 0) return '';

    return formatRagBlock(relevant);
  } catch (err) {
    // Non-blocking: log and return empty — never break generation
    console.warn('[RAG] retrieval failed (continuing without):', err instanceof Error ? err.message : String(err));
    return '';
  }
}
