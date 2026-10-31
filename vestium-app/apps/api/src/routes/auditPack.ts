// ─── Audit Evidence Pack ──────────────────────────────────────────────────────
// Single multi-page A4 PDF containing the complete compliance evidence chain
// for one module: cover, classification, findings, attestation, cert chain,
// WORM audit trail, and integrity verification.
//
//   GET /api/audit-pack/:moduleId/pdf
//
// RBAC: admin or reviewer. Org-scoped via Clerk JWT.

import { createHash } from 'crypto';
import type { FastifyPluginAsync } from 'fastify';
import { sql } from '../db/client.js';
import { writeAuditLog } from '../db/audit.js';
import { requireRole } from '../plugins/rbac.js';
import { PDFDocument, StandardFonts, type PDFPage, type PDFFont, type PDFImage } from 'pdf-lib';
import QRCode from 'qrcode';
import {
  CERT_COLORS,
  formatIssuedAtUtc,
  wrapText,
  drawWrappedText,
  drawField,
  drawRosetteCorner,
  drawDiagonalWatermark,
  embedOptionalImage,
} from './certs.js';

// ─── Constants ───────────────────────────────────────────────────────────────

const WIDTH = 595;
const HEIGHT = 842;
const MARGIN = 30;
const HEADER_H = 72;
const FOOTER_H = 40;
const BODY_TOP = HEIGHT - HEADER_H - 14;
const BODY_BOTTOM = FOOTER_H + 20;
const CONTENT_W = WIDTH - MARGIN * 2;

const C = CERT_COLORS;

function getVerifyBaseUrl(): string {
  return process.env.PUBLIC_VERIFY_BASE_URL
    ?? process.env.FRONTEND_URL
    ?? 'https://vestium.app';
}

function getVerifyDisplayHost(): string {
  const base = getVerifyBaseUrl();
  try {
    return new URL(base).host;
  } catch {
    return base.replace(/^https?:\/\//, '');
  }
}

// ─── Human-readable action labels ────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  generation_started:     'Pipeline generation started',
  generation_complete:    'Generation completed successfully',
  generation_failed:      'Generation failed',
  finding_created:        'Review finding created',
  finding_disposed:       'Finding disposition recorded',
  findings_seeded:        'Findings seeded from fact-check',
  attestation_completed:  'Competent person attestation recorded',
  module_deployed:        'Module deployed to learners',
  module_deleted:         'Module deleted',
  learner_started:        'Learner commenced module',
  learner_completed:      'Learner completed module',
  certificate_issued:     'Certificate issued',
  gated_window_opened:    'Regulatory finding gated review opened',
  gated_window_unlocked:  'Gated review unlocked',
  snapshot_created:       'Module content snapshot created',
  audit_pack_generated:   'Audit evidence pack generated',
  module_stale_flagged:   'Module flagged as stale',
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/_/g, ' ');
}

function summarisePayload(action: string, payload: Record<string, unknown>): string {
  switch (action) {
    case 'finding_disposed':
      return `Severity: ${payload.severity ?? '?'} | Disposition: ${payload.disposition ?? '?'}`;
    case 'attestation_completed':
      return `Snapshot v${payload.snapshotVersion ?? '?'}`;
    case 'module_deployed':
      return `Cert: ${payload.certNumber ?? '?'}`;
    case 'certificate_issued':
      return `${payload.type ?? '?'} — ${payload.certNumber ?? '?'}`;
    case 'snapshot_created':
      return `v${payload.version ?? '?'} (${payload.triggerEvent ?? '?'})`;
    case 'finding_created':
      return `${payload.severity ?? '?'} / Cat ${payload.category ?? '?'}`;
    default: {
      const entries = Object.entries(payload).slice(0, 2);
      return entries.length ? entries.map(([k, v]) => `${k}: ${String(v)}`).join(' | ') : '';
    }
  }
}

// ─── Page frame helper ───────────────────────────────────────────────────────

function drawPageFrame(
  page: PDFPage,
  sectionTitle: string,
  pageNum: number,
  totalPages: number,
  fonts: { helvBold: PDFFont; helv: PDFFont; mono: PDFFont; timesItalic: PDFFont },
  generatedAt: string,
  headerLogo: PDFImage | null,
): void {
  const { helvBold, helv, mono, timesItalic } = fonts;

  // Watermark
  drawDiagonalWatermark(page, WIDTH, HEIGHT, timesItalic, 'VESTIUM', C.watermark);

  // Double border
  page.drawRectangle({ x: 7, y: 7, width: WIDTH - 14, height: HEIGHT - 14, borderColor: C.gold, borderWidth: 1.6 });
  page.drawRectangle({ x: 12, y: 12, width: WIDTH - 24, height: HEIGHT - 24, borderColor: C.goldLight, borderWidth: 0.5 });

  // Corner rosettes
  drawRosetteCorner(page, 20, HEIGHT - 20, C.gold, C.goldLight);
  drawRosetteCorner(page, WIDTH - 20, HEIGHT - 20, C.gold, C.goldLight);
  drawRosetteCorner(page, 20, 20, C.gold, C.goldLight);
  drawRosetteCorner(page, WIDTH - 20, 20, C.gold, C.goldLight);

  // Header band
  page.drawRectangle({ x: MARGIN, y: HEIGHT - HEADER_H, width: CONTENT_W, height: HEADER_H - MARGIN, color: C.darkNavy });
  if (headerLogo) {
    const fit = headerLogo.scaleToFit(220, 72);
    page.drawImage(headerLogo, {
      x: MARGIN + 10,
      y: HEIGHT - fit.height - 4,
      width: fit.width,
      height: fit.height,
    });
    page.drawText('AUDIT EVIDENCE PACK', { x: MARGIN + 240, y: HEIGHT - MARGIN - 24, size: 8, font: helv, color: C.pale });
    page.drawText(sectionTitle, { x: MARGIN + 240, y: HEIGHT - MARGIN - 36, size: 7, font: helv, color: C.gold });
  } else {
    page.drawText('VESTIUM', { x: MARGIN + 12, y: HEIGHT - MARGIN - 16, size: 14, font: helvBold, color: C.white });
    page.drawText('AUDIT EVIDENCE PACK', { x: MARGIN + 12, y: HEIGHT - MARGIN - 30, size: 8, font: helv, color: C.pale });
    page.drawText(sectionTitle, { x: MARGIN + 12, y: HEIGHT - MARGIN - 40, size: 7, font: helv, color: C.gold });
  }

  // Footer band
  page.drawRectangle({ x: MARGIN, y: MARGIN, width: CONTENT_W, height: FOOTER_H - MARGIN, color: C.darkNavy });
  const footerY = MARGIN + 3;
  page.drawText('AUDIT EVIDENCE PACK', { x: MARGIN + 8, y: footerY, size: 5.5, font: helv, color: C.gold });
  const pageLabel = `Page ${pageNum} of ${totalPages}`;
  const pageLabelW = mono.widthOfTextAtSize(pageLabel, 6);
  page.drawText(pageLabel, { x: WIDTH - MARGIN - 8 - pageLabelW, y: footerY, size: 6, font: mono, color: C.gold });
  const genLabel = `Generated: ${generatedAt}`;
  const genLabelW = helv.widthOfTextAtSize(genLabel, 5);
  page.drawText(genLabel, { x: (WIDTH - genLabelW) / 2, y: footerY, size: 5, font: helv, color: C.pale });
}

// ─── Severity colors ─────────────────────────────────────────────────────────

import { rgb } from 'pdf-lib';

const SEVERITY_COLORS: Record<string, ReturnType<typeof rgb>> = {
  regulatory: rgb(0.7, 0.1, 0.1),
  high: C.amber,
  medium: C.gold,
  low: C.muted,
};

// ─── PDF builder ─────────────────────────────────────────────────────────────

export interface AuditPackData {
  moduleId: string;
  moduleTitle: string;
  moduleStatus: string;
  orgName: string;
  contentHash: string | null;
  workplaceContext: Record<string, unknown>;
  regulatoryClassification: Record<string, unknown>;
  generationMetadata: Record<string, unknown> | null;
  findings: Array<Record<string, unknown>>;
  attestation: Record<string, unknown> | null;
  moduleCert: Record<string, unknown> | null;
  learnerCerts: Array<Record<string, unknown>>;
  snapshots: Array<Record<string, unknown>>;
  auditEntries: Array<Record<string, unknown>>;
  jobStatus: string | null;
  jobStepCount: number;
  generatedAt: string;
  packContentHash: string;
}

export async function buildAuditPackPdf(data: AuditPackData): Promise<{ pdfBytes: Uint8Array; pageCount: number }> {
  const doc = await PDFDocument.create();
  const timesBold   = await doc.embedFont(StandardFonts.TimesRomanBold);
  const times       = await doc.embedFont(StandardFonts.TimesRoman);
  const timesItalic = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const helv        = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold    = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono        = await doc.embedFont(StandardFonts.Courier);
  const fonts = { helvBold, helv, mono, timesItalic };
  const headerLogo = await embedOptionalImage(doc, ['brand/vestium-pill.png']);

  // Pre-compute total pages (estimate, then fix up after building)
  // We'll build pages into an array and set page numbers at the end.
  const pages: { page: PDFPage; title: string }[] = [];

  function addPage(title: string): { page: PDFPage; y: number } {
    const page = doc.addPage([WIDTH, HEIGHT]);
    pages.push({ page, title });
    return { page, y: BODY_TOP };
  }

  function ensureSpace(currentPage: PDFPage, y: number, needed: number, title: string): { page: PDFPage; y: number } {
    if (y - needed < BODY_BOTTOM) {
      return addPage(title + ' (continued)');
    }
    return { page: currentPage, y };
  }

  // ── Section label helper ──
  function sectionLabel(page: PDFPage, y: number, label: string): number {
    page.drawRectangle({ x: MARGIN, y: y - 14, width: CONTENT_W, height: 14, color: C.darkNavy });
    page.drawText(label, { x: MARGIN + 6, y: y - 11, size: 7, font: helvBold, color: C.gold });
    return y - 22;
  }

  // ── Gold divider ──
  function goldDivider(page: PDFPage, y: number): number {
    page.drawLine({ start: { x: MARGIN, y }, end: { x: WIDTH - MARGIN, y }, thickness: 0.6, color: C.gold });
    return y - 10;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE 1 — Cover / Executive Summary
  // ════════════════════════════════════════════════════════════════════════════

  {
    const { page, y: startY } = addPage('EXECUTIVE SUMMARY');
    let y = startY;

    // Title
    const titleText = 'AUDIT EVIDENCE PACK';
    const titleW = timesBold.widthOfTextAtSize(titleText, 26);
    page.drawText(titleText, { x: (WIDTH - titleW) / 2, y, size: 26, font: timesBold, color: C.darkNavy });
    y -= 16;

    const issuedText = `Issued: ${data.generatedAt}`;
    const issuedW = timesItalic.widthOfTextAtSize(issuedText, 9);
    page.drawText(issuedText, { x: (WIDTH - issuedW) / 2, y, size: 9, font: timesItalic, color: C.muted });
    y -= 18;

    y = goldDivider(page, y);

    // Module title
    y = drawField(page, 'MODULE TITLE', data.moduleTitle, MARGIN, y, helvBold, timesBold, C.muted, C.darkNavy, CONTENT_W, 13);
    y -= 4;
    y = drawField(page, 'ORGANISATION', data.orgName, MARGIN, y, helvBold, times, C.muted, C.ink, CONTENT_W);
    y -= 4;

    const certNumber = (data.moduleCert?.cert_number as string) ?? 'Not yet issued';
    y = drawField(page, 'MODULE CERTIFICATE', certNumber, MARGIN, y, helvBold, mono, C.muted, C.darkNavy, CONTENT_W, 9);
    y -= 4;

    // Regulatory schemas
    const schemas = (data.regulatoryClassification?.applicableSchemas as Array<{ schemaId: string; shortTitle: string }>) ?? [];
    const schemaText = schemas.map(s => `${s.schemaId} — ${s.shortTitle}`).join('\n');
    y = drawField(page, 'REGULATORY SCHEMAS COVERED', schemaText || 'None classified', MARGIN, y, helvBold, times, C.muted, C.ink, CONTENT_W, 8);
    y -= 8;

    y = sectionLabel(page, y, 'COMPLIANCE STATUS CHAIN');

    const disposedCount = data.findings.filter(f => f.disposition != null).length;
    const chainLines = [
      `Generation:         ${data.jobStatus === 'complete' ? 'Complete' : data.jobStatus ?? 'Unknown'}`,
      `Findings reviewed:  ${data.findings.length} finding${data.findings.length === 1 ? '' : 's'} / ${disposedCount} disposed`,
      `Attestation:        ${data.attestation ? `${data.attestation.reviewer_name}, ${data.attestation.reviewer_role}` : 'Not on record'}`,
      `Module certificate: ${certNumber}`,
      `Learner certs:      ${data.learnerCerts.length} issued`,
    ];
    for (const line of chainLines) {
      page.drawText(line, { x: MARGIN + 8, y, size: 8, font: mono, color: C.ink });
      y -= 13;
    }
    y -= 4;

    y = sectionLabel(page, y, 'CONTENT HASH CHAIN');

    const moduleHash = data.contentHash ?? 'Not available';
    const attestHash = (data.attestation?.content_hash_at_attestation as string) ?? 'N/A';
    const hashMatch = moduleHash === attestHash ? 'MATCH' : (data.attestation ? 'MISMATCH' : 'N/A');

    y = drawField(page, 'MODULE CONTENT HASH (SHA-256)', moduleHash, MARGIN + 8, y, helvBold, mono, C.muted, C.ink, CONTENT_W - 16, 7);
    y -= 2;
    y = drawField(page, 'HASH AT ATTESTATION', attestHash, MARGIN + 8, y, helvBold, mono, C.muted, C.ink, CONTENT_W - 16, 7);
    y -= 2;
    const matchColor = hashMatch === 'MATCH' ? rgb(0.1, 0.5, 0.2) : (hashMatch === 'MISMATCH' ? rgb(0.7, 0.1, 0.1) : C.muted);
    page.drawText(`Chain integrity: ${hashMatch}`, { x: MARGIN + 8, y, size: 8, font: helvBold, color: matchColor });
    y -= 18;

    y = goldDivider(page, y);

    // Legal boilerplate
    const boilerplate = `This audit evidence pack is generated from the live Vestium database for module ${data.moduleId}. All records are extracted from an immutable (WORM) audit log and hash-linked certificate chain. The content of this pack accurately reflects the state of the compliance record at the time of generation.`;
    drawWrappedText(page, boilerplate, MARGIN, y, CONTENT_W, timesItalic, 7, C.muted, 4);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE 2 — Module & Classification
  // ════════════════════════════════════════════════════════════════════════════

  {
    const { page, y: startY } = addPage('MODULE CLASSIFICATION RECORD');
    let y = startY;

    const wc = data.workplaceContext;
    const rc = data.regulatoryClassification;

    // Module metadata
    y = drawField(page, 'MODULE ID', data.moduleId, MARGIN, y, helvBold, mono, C.muted, C.ink, CONTENT_W, 7);
    y -= 2;

    const halfW = (CONTENT_W - 16) / 2;
    y = drawField(page, 'STATUS', data.moduleStatus.toUpperCase(), MARGIN, y, helvBold, helvBold, C.muted, C.darkNavy, halfW, 9);
    y -= 4;

    y = goldDivider(page, y);
    y = sectionLabel(page, y, 'WORKPLACE CONTEXT');

    y = drawField(page, 'INDUSTRY', `${wc.industryType ?? ''} — ${wc.industryLabel ?? ''}`.trim(), MARGIN + 8, y, helvBold, times, C.muted, C.ink, CONTENT_W - 16, 8);
    y -= 2;
    y = drawField(page, 'OPERATIONS', (wc.operations as string) ?? '-', MARGIN + 8, y, helvBold, times, C.muted, C.ink, CONTENT_W - 16, 8);
    y -= 2;
    y = drawField(page, 'WORKFORCE PROFILE', (wc.workforceProfile as string) ?? '-', MARGIN + 8, y, helvBold, times, C.muted, C.ink, CONTENT_W - 16, 8);
    y -= 2;
    const hazards = Array.isArray(wc.hazardKeywords) ? (wc.hazardKeywords as string[]).join(', ') : '-';
    y = drawField(page, 'HAZARD KEYWORDS', hazards, MARGIN + 8, y, helvBold, times, C.muted, C.ink, CONTENT_W - 16, 8);
    y -= 2;
    if (wc.additionalContext) {
      y = drawField(page, 'ADDITIONAL CONTEXT', wc.additionalContext as string, MARGIN + 8, y, helvBold, times, C.muted, C.ink, CONTENT_W - 16, 8);
      y -= 2;
    }
    y -= 6;

    y = sectionLabel(page, y, 'APPLICABLE REGULATORY SCHEMAS');

    const appSchemas = (rc.applicableSchemas as Array<Record<string, unknown>>) ?? [];
    for (const s of appSchemas) {
      const mandatory = s.mandatory ? 'MANDATORY' : 'Advisory';
      const pending = s.pending ? ' [PENDING]' : '';
      const line = `${s.schemaId} | ${s.shortTitle} | Weight: ${s.weight} | ${mandatory}${pending}`;
      page.drawText(line, { x: MARGIN + 8, y, size: 7, font: mono, color: C.ink });
      y -= 12;
    }
    y -= 6;

    y = sectionLabel(page, y, 'GENERATION RECORD');

    y = drawField(page, 'JOB STATUS', (data.jobStatus ?? 'Unknown').toUpperCase(), MARGIN + 8, y, helvBold, helvBold, C.muted, C.darkNavy, halfW, 9);
    y -= 2;
    y = drawField(page, 'PIPELINE STEPS', `${data.jobStepCount} steps in record`, MARGIN + 8, y, helvBold, mono, C.muted, C.ink, halfW, 8);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE 3+ — Review Findings Record
  // ════════════════════════════════════════════════════════════════════════════

  {
    let { page, y } = addPage('REVIEW FINDINGS RECORD');
    const title = 'REVIEW FINDINGS RECORD';

    // Summary stats bar
    const bySev: Record<string, number> = {};
    let disposedCount = 0;
    for (const f of data.findings) {
      const sev = f.severity as string;
      bySev[sev] = (bySev[sev] ?? 0) + 1;
      if (f.disposition) disposedCount++;
    }
    const dispRate = data.findings.length > 0 ? Math.round((disposedCount / data.findings.length) * 100) : 0;

    page.drawRectangle({ x: MARGIN, y: y - 16, width: CONTENT_W, height: 16, color: C.darkNavy });
    const statsText = `Total: ${data.findings.length}    Regulatory: ${bySev.regulatory ?? 0}    High: ${bySev.high ?? 0}    Medium: ${bySev.medium ?? 0}    Low: ${bySev.low ?? 0}    Disposition rate: ${dispRate}%`;
    page.drawText(statsText, { x: MARGIN + 6, y: y - 12, size: 7, font: helvBold, color: C.gold });
    y -= 28;

    if (data.findings.length === 0) {
      page.drawText('No review findings recorded for this module.', { x: MARGIN + 8, y, size: 9, font: timesItalic, color: C.muted });
    } else {
      // Column headers
      const cols = [
        { label: 'SEV', x: MARGIN, w: 52 },
        { label: 'CAT', x: MARGIN + 54, w: 20 },
        { label: 'LOCATION', x: MARGIN + 76, w: 72 },
        { label: 'DESCRIPTION', x: MARGIN + 150, w: 170 },
        { label: 'DISP', x: MARGIN + 322, w: 50 },
        { label: 'REG REF', x: MARGIN + 374, w: 80 },
        { label: 'DATE', x: MARGIN + 456, w: 79 },
      ];

      function drawTableHeader(pg: PDFPage, rowY: number): number {
        pg.drawRectangle({ x: MARGIN, y: rowY - 12, width: CONTENT_W, height: 12, color: C.darkNavy });
        for (const col of cols) {
          pg.drawText(col.label, { x: col.x + 2, y: rowY - 9, size: 6, font: helvBold, color: C.white });
        }
        return rowY - 16;
      }

      y = drawTableHeader(page, y);

      for (let i = 0; i < data.findings.length; i++) {
        const f = data.findings[i];
        const desc = (f.description as string) ?? '';
        const descLines = wrapText(desc.slice(0, 300), 168, times, 7);
        const rationale = f.disposition_rationale ? `> ${(f.disposition_rationale as string).slice(0, 120)}` : '';
        const rationaleLines = rationale ? wrapText(rationale, 168, timesItalic, 6.5) : [];
        const rowH = Math.max(14, (descLines.length + rationaleLines.length) * 10 + 4);

        ({ page, y } = ensureSpace(page, y, rowH + 16, title));
        if (y === BODY_TOP) y = drawTableHeader(page, y);

        // Alternating row background
        if (i % 2 === 1) {
          page.drawRectangle({ x: MARGIN, y: y - rowH, width: CONTENT_W, height: rowH, color: rgb(0.97, 0.97, 0.97) });
        }

        const sevColor = SEVERITY_COLORS[f.severity as string] ?? C.muted;
        page.drawText(((f.severity as string) ?? '').toUpperCase(), { x: cols[0].x + 2, y: y - 9, size: 6.5, font: helvBold, color: sevColor });
        page.drawText(`Cat ${(f.category as string) ?? '?'}`, { x: cols[1].x + 2, y: y - 9, size: 6.5, font: helv, color: C.ink });

        const loc = ((f.location as string) ?? '').slice(0, 20);
        page.drawText(loc, { x: cols[2].x + 2, y: y - 9, size: 6.5, font: mono, color: C.ink });

        let descY = y - 9;
        for (const line of descLines) {
          page.drawText(line, { x: cols[3].x + 2, y: descY, size: 7, font: times, color: C.ink });
          descY -= 10;
        }
        for (const line of rationaleLines) {
          page.drawText(line, { x: cols[3].x + 2, y: descY, size: 6.5, font: timesItalic, color: rgb(0.1, 0.5, 0.2) });
          descY -= 10;
        }

        const disp = ((f.disposition as string) ?? 'undisposed').toUpperCase();
        const dispColor = f.disposition ? rgb(0.1, 0.5, 0.2) : rgb(0.7, 0.1, 0.1);
        page.drawText(disp, { x: cols[4].x + 2, y: y - 9, size: 6.5, font: helvBold, color: dispColor });

        const ref = ((f.regulatory_ref as string) ?? '').slice(0, 28);
        page.drawText(ref, { x: cols[5].x + 2, y: y - 9, size: 6, font: times, color: C.ink });

        const date = f.disposed_at ? new Date(f.disposed_at as string).toISOString().slice(0, 10) : '-';
        page.drawText(date, { x: cols[6].x + 2, y: y - 9, size: 6, font: mono, color: C.muted });

        y -= rowH;
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE 4 — Attestation Record
  // ════════════════════════════════════════════════════════════════════════════

  {
    const { page, y: startY } = addPage('COMPETENT PERSON ATTESTATION RECORD');
    let y = startY;

    if (!data.attestation) {
      page.drawText('No attestation on record for this module.', { x: MARGIN + 8, y, size: 10, font: timesItalic, color: C.muted });
    } else {
      const att = data.attestation;

      // Declaration
      const declaration = 'The reviewer named below has completed the structured review workflow and formally attested to the content of this module in accordance with the Vestium Reviewer Portal non-bypassable workflow, fulfilling the requirements of MHSWR 1999 Regulation 7 (Competent Person).';
      y = drawWrappedText(page, declaration, MARGIN + 8, y, CONTENT_W - 16, timesItalic, 8, C.ink, 4);
      y -= 14;

      y = goldDivider(page, y);

      // Reviewer name + role
      const name = (att.reviewer_name as string) ?? 'Unknown';
      page.drawText(name, { x: MARGIN, y, size: 20, font: timesBold, color: C.darkNavy });
      y -= 14;
      page.drawText((att.reviewer_role as string) ?? '', { x: MARGIN, y, size: 9, font: timesItalic, color: C.muted });
      y -= 20;

      // Fields
      const attAt = att.attested_at ? formatIssuedAtUtc(att.attested_at as string) : 'Unknown';
      y = drawField(page, 'ATTESTED AT', attAt, MARGIN, y, helvBold, mono, C.muted, C.ink, CONTENT_W / 2, 8);
      y -= 2;
      y = drawField(page, 'SNAPSHOT VERSION', `v${att.snapshot_version ?? '?'}`, MARGIN, y, helvBold, mono, C.muted, C.ink, CONTENT_W / 2, 8);
      y -= 2;
      y = drawField(page, 'CONTENT HASH AT ATTESTATION', (att.content_hash_at_attestation as string) ?? 'N/A', MARGIN, y, helvBold, mono, C.muted, C.ink, CONTENT_W, 7);
      y -= 10;

      y = sectionLabel(page, y, 'BASIS OF COMPETENCE');
      y = drawWrappedText(page, (att.basis_of_competence as string) ?? '-', MARGIN + 8, y, CONTENT_W - 16, times, 8, C.ink, 4);
      y -= 10;

      y = sectionLabel(page, y, 'REGULATORY FRAMEWORKS REVIEWED');
      const frameworks = (att.regulatory_frameworks_reviewed as string[]) ?? [];
      for (const fw of frameworks) {
        page.drawText(`•  ${fw}`, { x: MARGIN + 8, y, size: 8, font: times, color: C.ink });
        y -= 12;
      }
      y -= 6;

      y = sectionLabel(page, y, 'EXPLICIT ACCEPTANCE DECLARATION');
      // Grey box
      const acceptance = (att.explicit_acceptance as string) ?? '-';
      const acceptLines = wrapText(acceptance, CONTENT_W - 32, times, 8);
      const boxH = acceptLines.length * 12 + 10;
      page.drawRectangle({ x: MARGIN + 4, y: y - boxH, width: CONTENT_W - 8, height: boxH, color: rgb(0.95, 0.95, 0.95) });
      let boxY = y - 10;
      for (const line of acceptLines) {
        page.drawText(line, { x: MARGIN + 12, y: boxY, size: 8, font: times, color: C.ink });
        boxY -= 12;
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE 5 — Certificate Chain
  // ════════════════════════════════════════════════════════════════════════════

  {
    const { page, y: startY } = addPage('CERTIFICATE CHAIN RECORD');
    let y = startY;

    y = sectionLabel(page, y, 'MODULE CERTIFICATE');

    if (!data.moduleCert) {
      page.drawText('MODULE CERTIFICATE NOT YET ISSUED — module has not been deployed.', { x: MARGIN + 8, y, size: 8, font: timesItalic, color: C.muted });
      y -= 16;
    } else {
      const mc = data.moduleCert;
      y = drawField(page, 'CERTIFICATE NUMBER', (mc.cert_number as string) ?? '', MARGIN + 8, y, helvBold, mono, C.muted, C.gold, CONTENT_W - 16, 10);
      y -= 2;
      y = drawField(page, 'ISSUED', mc.issued_at ? formatIssuedAtUtc(mc.issued_at as string) : '-', MARGIN + 8, y, helvBold, mono, C.muted, C.ink, CONTENT_W / 2, 8);
      y -= 2;
      y = drawField(page, 'MODULE TITLE', (mc.module_title as string) ?? '', MARGIN + 8, y, helvBold, times, C.muted, C.ink, CONTENT_W - 16, 8);
      y -= 2;
      y = drawField(page, 'REVIEWER', `${mc.reviewer_name ?? ''} | ${mc.reviewer_role ?? ''}`, MARGIN + 8, y, helvBold, times, C.muted, C.ink, CONTENT_W - 16, 8);
      y -= 2;
      const regSchemas = (mc.regulatory_schemas as string[]) ?? [];
      y = drawField(page, 'REGULATORY SCHEMAS', regSchemas.join(', '), MARGIN + 8, y, helvBold, times, C.muted, C.ink, CONTENT_W - 16, 7);
      y -= 2;
      const hash = (mc.content_hash as string) ?? '';
      y = drawField(page, 'CONTENT HASH (SHA-256)', hash, MARGIN + 8, y, helvBold, mono, C.muted, C.ink, CONTENT_W - 16, 7);
      y -= 2;

      // Source doc versions
      const sdv = (mc.source_doc_versions as Record<string, string>) ?? {};
      const sdvEntries = Object.entries(sdv);
      if (sdvEntries.length > 0) {
        y -= 4;
        page.drawText('SOURCE DOCUMENT VERSIONS', { x: MARGIN + 8, y, size: 6.5, font: helvBold, color: C.muted });
        y -= 10;
        for (const [docId, ver] of sdvEntries.slice(0, 8)) {
          page.drawText(`${docId}  |  ${ver}`, { x: MARGIN + 12, y, size: 7, font: mono, color: C.ink });
          y -= 10;
        }
      }
      y -= 8;
    }

    y = goldDivider(page, y);
    y = sectionLabel(page, y, 'MODULE SNAPSHOTS (VERSION HISTORY)');

    if (data.snapshots.length === 0) {
      page.drawText('No snapshots recorded.', { x: MARGIN + 8, y, size: 8, font: timesItalic, color: C.muted });
      y -= 14;
    } else {
      // Table header
      page.drawRectangle({ x: MARGIN, y: y - 12, width: CONTENT_W, height: 12, color: C.darkNavy });
      page.drawText('VERSION', { x: MARGIN + 4, y: y - 9, size: 6, font: helvBold, color: C.white });
      page.drawText('TRIGGER', { x: MARGIN + 60, y: y - 9, size: 6, font: helvBold, color: C.white });
      page.drawText('CONTENT HASH', { x: MARGIN + 180, y: y - 9, size: 6, font: helvBold, color: C.white });
      page.drawText('CREATED', { x: MARGIN + 380, y: y - 9, size: 6, font: helvBold, color: C.white });
      y -= 16;

      const attestedVersion = data.attestation ? (data.attestation.snapshot_version as number) : null;
      for (const s of data.snapshots) {
        const ver = s.version as number;
        const isAttested = ver === attestedVersion;
        if (isAttested) {
          page.drawRectangle({ x: MARGIN, y: y - 10, width: CONTENT_W, height: 12, color: rgb(0.9, 0.95, 1.0) });
        }
        page.drawText(`v${ver}${isAttested ? '  ATTESTED' : ''}`, { x: MARGIN + 4, y: y - 7, size: 7, font: isAttested ? helvBold : helv, color: isAttested ? C.darkNavy : C.ink });
        page.drawText((s.trigger_event as string) ?? '', { x: MARGIN + 60, y: y - 7, size: 7, font: mono, color: C.ink });
        page.drawText(((s.content_hash as string) ?? '').slice(0, 24), { x: MARGIN + 180, y: y - 7, size: 7, font: mono, color: C.ink });
        const created = s.created_at ? new Date(s.created_at as string).toISOString().slice(0, 19).replace('T', ' ') : '-';
        page.drawText(created, { x: MARGIN + 380, y: y - 7, size: 6, font: mono, color: C.muted });
        y -= 14;
      }
      y -= 6;
    }

    y = goldDivider(page, y);
    y = sectionLabel(page, y, `LEARNER CERTIFICATES (${data.learnerCerts.length} ISSUED)`);

    if (data.learnerCerts.length === 0) {
      page.drawText('No learner certificates have been issued for this module.', { x: MARGIN + 8, y, size: 8, font: timesItalic, color: C.muted });
    } else {
      for (const lc of data.learnerCerts.slice(0, 8)) {
        const passed = lc.passed as boolean;
        const passLabel = passed ? 'PASSED' : 'NOT PASSED';
        const passColor = passed ? rgb(0.1, 0.5, 0.2) : rgb(0.7, 0.1, 0.1);
        page.drawText(`${lc.cert_number}`, { x: MARGIN + 8, y, size: 8, font: mono, color: C.gold });
        page.drawText(`— ${lc.learner_name}`, { x: MARGIN + 160, y, size: 8, font: times, color: C.ink });
        y -= 12;
        page.drawText(`Score: ${lc.score}% | Threshold: ${lc.pass_threshold}% | `, { x: MARGIN + 12, y, size: 7, font: helv, color: C.muted });
        const scoreTextW = helv.widthOfTextAtSize(`Score: ${lc.score}% | Threshold: ${lc.pass_threshold}% | `, 7);
        page.drawText(passLabel, { x: MARGIN + 12 + scoreTextW, y, size: 7, font: helvBold, color: passColor });
        y -= 12;
        if (lc.issued_at) {
          page.drawText(`Issued: ${formatIssuedAtUtc(lc.issued_at as string)}`, { x: MARGIN + 12, y, size: 6.5, font: mono, color: C.muted });
          y -= 14;
        }
      }
      if (data.learnerCerts.length > 8) {
        page.drawText(`Showing 8 of ${data.learnerCerts.length}. Full record available in the platform.`, { x: MARGIN + 8, y, size: 7, font: timesItalic, color: C.muted });
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE 6+ — WORM Audit Trail
  // ════════════════════════════════════════════════════════════════════════════

  {
    let { page, y } = addPage('WORM AUDIT TRAIL');
    const title = 'WORM AUDIT TRAIL';

    if (data.auditEntries.length === 0) {
      page.drawText('No audit log entries found for this module.', { x: MARGIN + 8, y, size: 9, font: timesItalic, color: C.muted });
    } else {
      for (const entry of data.auditEntries) {
        const needed = 36;
        ({ page, y } = ensureSpace(page, y, needed, title));

        const ts = entry.created_at ? new Date(entry.created_at as string).toISOString().slice(0, 19).replace('T', ' ') + ' UTC' : '?';
        const action = (entry.action as string) ?? '?';
        const role = (entry.user_role as string) ?? '';
        const payload = (entry.payload as Record<string, unknown>) ?? {};

        // Timestamp + action
        page.drawText(ts, { x: MARGIN + 4, y, size: 7, font: mono, color: C.gold });
        page.drawText(actionLabel(action), { x: MARGIN + 164, y, size: 8, font: helvBold, color: C.darkNavy });
        y -= 11;

        // User + role + payload
        const userId = ((entry.user_id as string) ?? '').slice(0, 30);
        const roleLabel = role ? ` (${role})` : '';
        page.drawText(`${userId}${roleLabel}`, { x: MARGIN + 8, y, size: 6.5, font: helv, color: C.muted });
        const payloadSummary = summarisePayload(action, payload);
        if (payloadSummary) {
          page.drawText(payloadSummary, { x: MARGIN + 220, y, size: 6.5, font: times, color: C.ink });
        }
        y -= 12;

        // Thin rule
        page.drawLine({ start: { x: MARGIN + 4, y: y + 2 }, end: { x: WIDTH - MARGIN - 4, y: y + 2 }, thickness: 0.3, color: C.rule });
        y -= 6;
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // FINAL PAGE — Integrity Verification
  // ════════════════════════════════════════════════════════════════════════════

  {
    const { page, y: startY } = addPage('PACK INTEGRITY VERIFICATION');
    let y = startY;

    y = sectionLabel(page, y, 'PACK CONTENT HASH (SHA-256)');
    page.drawText(data.packContentHash, { x: MARGIN + 8, y, size: 8, font: mono, color: C.darkNavy });
    y -= 20;

    // QR code
    const certNum = (data.moduleCert?.cert_number as string) ?? data.moduleId;
    try {
      const qrDataUrl = await QRCode.toDataURL(`${getVerifyBaseUrl().replace(/\/$/, '')}/verify/${certNum}`, {
        width: 80, margin: 0, color: { dark: '#0d1730', light: '#ffffff' },
      });
      const qrBase64 = qrDataUrl.split(',')[1];
      const qrImage = await doc.embedPng(Buffer.from(qrBase64, 'base64'));
      page.drawImage(qrImage, { x: WIDTH - MARGIN - 90, y: y - 70, width: 80, height: 80 });
    } catch { /* QR is supplementary */ }

    y = drawField(page, 'VERIFICATION URL', `${getVerifyDisplayHost()}/verify/${certNum}`, MARGIN + 8, y, helvBold, mono, C.muted, C.gold, 300, 7);
    y -= 16;

    y = goldDivider(page, y);

    y = sectionLabel(page, y, 'IMMUTABILITY STATEMENT');
    const immutability = 'All records in this pack are extracted directly from the Vestium WORM database. The audit log is protected at the database level by INSERT-only permissions and immutability triggers — no application-level UPDATE or DELETE access exists. All attestation records are locked at creation. Certificate hashes are computed at issuance and cannot be modified.';
    y = drawWrappedText(page, immutability, MARGIN + 8, y, CONTENT_W - 16, times, 8, C.ink, 4);
    y -= 14;

    y = sectionLabel(page, y, 'LEGAL DISCLAIMER');
    const disclaimer = 'This pack is issued for evidence purposes only. Vestium assists qualified health and safety professionals — it does not constitute legal advice. The competent person attestation represents the professional judgement of the named reviewer, not a guarantee of legal compliance.';
    y = drawWrappedText(page, disclaimer, MARGIN + 8, y, CONTENT_W - 16, timesItalic, 7.5, C.muted, 4);
    y -= 14;

    y = goldDivider(page, y);

    page.drawText('GENERATED BY', { x: MARGIN + 8, y, size: 6.5, font: helvBold, color: C.muted });
    y -= 11;
    page.drawText(`Vestium  |  ${data.generatedAt}`, { x: MARGIN + 8, y, size: 7, font: mono, color: C.ink });
    y -= 11;
    page.drawText(`Module: ${data.moduleId}`, { x: MARGIN + 8, y, size: 7, font: mono, color: C.ink });
    y -= 11;
    page.drawText(`Organisation: ${data.orgName}`, { x: MARGIN + 8, y, size: 7, font: mono, color: C.ink });
    y -= 11;
    page.drawText('Pack generator version: 1.0', { x: MARGIN + 8, y, size: 7, font: mono, color: C.muted });
  }

  // ── Apply page frames (now we know total page count) ──
  const totalPages = pages.length;
  for (let i = 0; i < pages.length; i++) {
    drawPageFrame(pages[i].page, pages[i].title, i + 1, totalPages, fonts, data.generatedAt, headerLogo);
  }

  const pdfBytes = await doc.save();
  return { pdfBytes, pageCount: totalPages };
}

// ─── Route ───────────────────────────────────────────────────────────────────

export const auditPackRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { moduleId: string } }>(
    '/:moduleId/pdf',
    { preHandler: [requireRole('admin', 'reviewer')] },
    async (request, reply) => {
      const { userId, orgId, role } = request.auth;
      const { moduleId } = request.params;

      if (!orgId) {
        reply.status(400);
        return { ok: false, error: 'No active org' };
      }

      // ── Fetch all data in parallel ──
      const [moduleRows, findingsRows, attestationRows, moduleCertRows,
             learnerCertRows, snapshotRows, auditRows, jobRows] = await Promise.all([
        sql`
          SELECT m.*, o.name AS org_name
          FROM modules m JOIN orgs o ON o.id = m.org_id
          WHERE m.id = ${moduleId} AND o.clerk_org_id = ${orgId}
        `,
        sql`
          SELECT * FROM review_findings WHERE module_id = ${moduleId}
          ORDER BY CASE severity
            WHEN 'regulatory' THEN 1 WHEN 'high' THEN 2
            WHEN 'medium' THEN 3 ELSE 4 END, created_at ASC
        `,
        sql`
          SELECT * FROM attestations WHERE module_id = ${moduleId}
          ORDER BY attested_at DESC LIMIT 1
        `,
        sql`
          SELECT * FROM module_certificates WHERE module_id = ${moduleId}
          ORDER BY issued_at DESC LIMIT 1
        `,
        sql`
          SELECT lc.* FROM learner_certificates lc
          JOIN module_certificates mc ON mc.id = lc.module_cert_id
          WHERE mc.module_id = ${moduleId}
          ORDER BY lc.issued_at ASC
        `,
        sql`
          SELECT id, module_id, version, content_hash, trigger_event, created_by, created_at
          FROM module_snapshots WHERE module_id = ${moduleId}
          ORDER BY version ASC
        `,
        sql`
          SELECT id, user_id, user_role, action, payload, created_at
          FROM audit_log WHERE module_id = ${moduleId}
          ORDER BY created_at ASC
        `,
        sql`
          SELECT status, job_state FROM generation_jobs
          WHERE module_id = ${moduleId} LIMIT 1
        `,
      ]);

      const mod = moduleRows[0] as Record<string, unknown> | undefined;
      if (!mod) {
        reply.status(404);
        return { ok: false, error: 'Module not found' };
      }

      const attestation = (attestationRows[0] as Record<string, unknown>) ?? null;
      if (!attestation) {
        reply.status(409);
        return { ok: false, error: 'Evidence chain incomplete. Attestation required before pack generation.' };
      }

      const dbOrgId = mod.org_id as string;
      const generatedAt = formatIssuedAtUtc(new Date().toISOString());

      // Compute pack content hash
      const packManifest = JSON.stringify({
        moduleId,
        generatedAt,
        contentHash: (mod.content_hash as string) ?? null,
        attestationId: (attestation?.id as string) ?? null,
        moduleCertNumber: (moduleCertRows[0] as Record<string, unknown> | undefined)?.cert_number ?? null,
        findingsCount: findingsRows.length,
        auditEntriesCount: auditRows.length,
        learnerCertsCount: learnerCertRows.length,
      });
      const packContentHash = createHash('sha256').update(packManifest).digest('hex');

      const jobState = (jobRows[0] as Record<string, unknown> | undefined)?.job_state as Record<string, unknown> | undefined;
      const jobStepCount = jobState?.steps ? Object.keys(jobState.steps as Record<string, unknown>).length : 0;

      const pdfData: AuditPackData = {
        moduleId,
        moduleTitle: (mod.title as string) ?? 'Untitled',
        moduleStatus: (mod.status as string) ?? 'unknown',
        orgName: (mod.org_name as string) ?? 'Unknown',
        contentHash: (mod.content_hash as string) ?? null,
        workplaceContext: (mod.workplace_context as Record<string, unknown>) ?? {},
        regulatoryClassification: (mod.regulatory_classification as Record<string, unknown>) ?? {},
        generationMetadata: (mod.generation_metadata as Record<string, unknown>) ?? null,
        findings: findingsRows as Array<Record<string, unknown>>,
        attestation,
        moduleCert: (moduleCertRows[0] as Record<string, unknown>) ?? null,
        learnerCerts: learnerCertRows as Array<Record<string, unknown>>,
        snapshots: snapshotRows as Array<Record<string, unknown>>,
        auditEntries: auditRows as Array<Record<string, unknown>>,
        jobStatus: (jobRows[0] as Record<string, unknown> | undefined)?.status as string ?? null,
        jobStepCount,
        generatedAt,
        packContentHash,
      };

      const { pdfBytes, pageCount } = await buildAuditPackPdf(pdfData);

      // Write WORM audit entry
      await writeAuditLog({
        orgId: dbOrgId,
        moduleId,
        userId,
        userRole: role,
        action: 'audit_pack_generated',
        payload: {
          packContentHash,
          pagesGenerated: pageCount,
          findingsIncluded: findingsRows.length,
          auditEntriesIncluded: auditRows.length,
          learnerCertsIncluded: learnerCertRows.length,
        },
      });

      const certNum = (moduleCertRows[0] as Record<string, unknown> | undefined)?.cert_number ?? moduleId;
      reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="audit-pack-${certNum}.pdf"`)
        .send(Buffer.from(pdfBytes));
    },
  );
};
