// ─── Certificate routes ────────────────────────────────────────────────────────
// Phase 4: Certificate Infrastructure
//
// Authenticated (registered under /api/certs after clerkPlugin):
//   POST /api/certs/module/:moduleId       — generate (or return existing) module cert
//   GET  /api/certs/module/:moduleId       — get current module cert
//   POST /api/certs/learner/:moduleId      — issue learner cert
//   GET  /api/certs/module/:moduleId/pdf   — module cert PDF download
//   GET  /api/certs/learner/:certNumber/pdf — learner cert PDF download
//
// Public (registered before clerkPlugin in index.ts):
//   GET  /verify/:certNumber               — chain verification (no auth required)

import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from '../db/client.js';
import { writeAuditLog } from '../db/audit.js';
import { getLatestSnapshotVersion } from '../services/moduleSnapshots.js';
import { PDFDocument, degrees, rgb, StandardFonts, type PDFPage, type PDFFont, type PDFImage } from 'pdf-lib';
import QRCode from 'qrcode';
import type { ModuleCertRecord, LearnerCertRecord } from '@complianceforge/types';
import { assembleModule } from '../pipeline/orchestrator.js';
import type { GenerationJob } from '../pipeline/types.js';
import { updateDistilledOrgContext } from '../services/orgContextBuilder.js';
import { requireRole } from '../plugins/rbac.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Schemas ──────────────────────────────────────────────────────────────────

const IssueLearnerCertSchema = z.object({
  learnerName: z.string().min(1),
  learnerUserId: z.string().min(1),
  score: z.number().int().min(0).max(100),
  passThreshold: z.number().int().min(0).max(100),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCertNumber(prefix: string, id: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const hex = id.replace(/-/g, '').slice(0, 8);
  return `VS-${prefix}-${date}-${hex}`;
}

function rowToModuleCert(row: Record<string, unknown>): ModuleCertRecord {
  return {
    id: row.id as string,
    moduleId: row.module_id as string,
    attestationId: row.attestation_id as string,
    orgId: row.org_id as string,
    certNumber: row.cert_number as string,
    contentHash: row.content_hash as string,
    sourceDocVersions: row.source_doc_versions as Record<string, string>,
    regulatorySchemas: row.regulatory_schemas as string[],
    moduleTitle: row.module_title as string,
    reviewerName: row.reviewer_name as string,
    reviewerRole: row.reviewer_role as string,
    issuedAt: row.issued_at as string,
    snapshotVersion: (row.snapshot_version as number | null) ?? undefined,
  };
}

function rowToLearnerCert(row: Record<string, unknown>): LearnerCertRecord {
  return {
    id: row.id as string,
    moduleCertId: row.module_cert_id as string,
    moduleId: row.module_id as string,
    orgId: row.org_id as string,
    certNumber: row.cert_number as string,
    learnerName: row.learner_name as string,
    learnerUserId: row.learner_user_id as string,
    score: row.score as number,
    passThreshold: row.pass_threshold as number,
    passed: row.passed as boolean,
    issuedAt: row.issued_at as string,
  };
}

// ─── PDF builders ─────────────────────────────────────────────────────────────

// Shared color palette — exported for audit pack PDF reuse
export const CERT_COLORS = {
  darkNavy:  rgb(0.05, 0.09, 0.19),
  gold:      rgb(0.74, 0.61, 0.21),
  goldLight: rgb(0.87, 0.74, 0.32),
  sealGold:  rgb(0.83, 0.68, 0.22),
  ink:       rgb(0.11, 0.11, 0.11),
  muted:     rgb(0.44, 0.44, 0.44),
  pale:      rgb(0.85, 0.85, 0.85),
  amber:     rgb(0.78, 0.52, 0.08),
  white:     rgb(1, 1, 1),
  watermark: rgb(0.92, 0.92, 0.92),
  rule:      rgb(0.75, 0.75, 0.75),
};

export function formatIssuedAtUtc(iso: string): string {
  const dt = new Date(iso);
  const date = dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  const time = dt.toISOString().slice(11, 19);
  return `${date} ${time} UTC`;
}

export function wrapText(text: string, maxWidth: number, font: PDFFont, size: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return ['-'];
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function drawWrappedText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
  lineGap = 12
): number {
  const lines = wrapText(text, maxWidth, font, size);
  let yy = y;
  for (const line of lines) {
    page.drawText(line, { x, y: yy, size, font, color });
    yy -= lineGap;
  }
  return yy;
}

export function drawField(
  page: PDFPage,
  label: string,
  value: string,
  x: number,
  y: number,
  labelFont: PDFFont,
  valueFont: PDFFont,
  labelColor: ReturnType<typeof rgb>,
  valueColor: ReturnType<typeof rgb>,
  maxWidth: number,
  valueSize = 8.5
): number {
  page.drawText(label.toUpperCase(), { x, y, size: 6.5, font: labelFont, color: labelColor });
  return drawWrappedText(page, value || '-', x, y - 11, maxWidth, valueFont, valueSize, valueColor, 10.5);
}

export function drawRosetteCorner(
  page: PDFPage,
  cx: number,
  cy: number,
  ringColor: ReturnType<typeof rgb>,
  detailColor: ReturnType<typeof rgb>
): void {
  page.drawCircle({ x: cx, y: cy, size: 9, borderColor: ringColor, borderWidth: 0.9 });
  page.drawCircle({ x: cx, y: cy, size: 6.2, borderColor: detailColor, borderWidth: 0.6 });
  for (let i = 0; i < 12; i++) {
    const a = (i * 30) * (Math.PI / 180);
    const r1 = 3.8;
    const r2 = 7.6;
    page.drawLine({
      start: { x: cx + Math.cos(a) * r1, y: cy + Math.sin(a) * r1 },
      end: { x: cx + Math.cos(a) * r2, y: cy + Math.sin(a) * r2 },
      thickness: 0.45,
      color: detailColor,
    });
  }
}

export function drawPill(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  color: ReturnType<typeof rgb>,
): void {
  const radius = height / 2;
  page.drawRectangle({ x: x + radius, y, width: width - (radius * 2), height, color });
  page.drawCircle({ x: x + radius, y: y + radius, size: radius, color });
  page.drawCircle({ x: x + width - radius, y: y + radius, size: radius, color });
}

export function drawCenteredImageInBox(
  page: PDFPage,
  image: PDFImage,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  inset = 0,
): void {
  const fit = image.scaleToFit(Math.max(1, boxW - inset * 2), Math.max(1, boxH - inset * 2));
  const x = boxX + (boxW - fit.width) / 2;
  const y = boxY + (boxH - fit.height) / 2;
  page.drawImage(image, { x, y, width: fit.width, height: fit.height });
}

export function getPillWidthForImage(
  image: PDFImage,
  pillH: number,
  inset = 0,
  minW = 0,
  maxW = 320,
): number {
  const targetH = Math.max(1, pillH - inset * 2);
  const scaled = image.scale(targetH / image.height);
  return Math.max(minW, Math.min(maxW, Math.ceil(scaled.width + inset * 2)));
}

export function drawDiagonalWatermark(
  page: PDFPage,
  width: number,
  height: number,
  font: PDFFont,
  text: string,
  color: ReturnType<typeof rgb>
): void {
  for (let y = 80; y < height - 80; y += 62) {
    for (let x = -20; x < width + 40; x += 150) {
      page.drawText(text, {
        x,
        y,
        size: 18,
        font,
        color,
        rotate: degrees(25),
      });
    }
  }
}

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

export async function embedOptionalImage(
  doc: PDFDocument,
  relativePaths: string[]
): Promise<import('pdf-lib').PDFImage | null> {
  for (const rel of relativePaths) {
    const abs = join(__dirname, '..', '..', 'public', 'assets', rel);
    if (!existsSync(abs)) continue;
    const bytes = readFileSync(abs);
    try {
      if (rel.toLowerCase().endsWith('.png')) return await doc.embedPng(bytes);
      if (rel.toLowerCase().endsWith('.jpg') || rel.toLowerCase().endsWith('.jpeg')) return await doc.embedJpg(bytes);
    } catch {
      // try next candidate
    }
  }
  return null;
}

export async function buildModuleCertPdf(cert: ModuleCertRecord): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const { width, height } = page.getSize();
  const timesBold   = await doc.embedFont(StandardFonts.TimesRomanBold);
  const times       = await doc.embedFont(StandardFonts.TimesRoman);
  const timesItalic = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const helv        = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold    = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono        = await doc.embedFont(StandardFonts.Courier);

  const darkNavy  = rgb(0.05, 0.09, 0.19);
  const gold      = rgb(0.74, 0.61, 0.21);
  const goldLight = rgb(0.87, 0.74, 0.32);
  const sealGold  = rgb(0.83, 0.68, 0.22);
  const ink       = rgb(0.11, 0.11, 0.11);
  const muted     = rgb(0.44, 0.44, 0.44);
  const pale      = rgb(0.85, 0.85, 0.85);
  const white     = rgb(1, 1, 1);

  const margin   = 30;
  const headerH  = 102;
  const footerH  = 54;
  const contentW = width - margin * 2;
  const colGap   = 18;
  const colW     = (contentW - colGap) / 2;
  const leftX    = margin;
  const rightX   = margin + colW + colGap;
  const bodyTop  = height - headerH - 18;

  // ── Background + double border ────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: 0, width, height, color: white });
  drawDiagonalWatermark(page, width, height, timesItalic, 'VESTIUM', rgb(0.92, 0.92, 0.92));
  page.drawRectangle({ x: 7,  y: 7,  width: width - 14, height: height - 14, borderColor: gold,      borderWidth: 1.6 });
  page.drawRectangle({ x: 12, y: 12, width: width - 24, height: height - 24, borderColor: goldLight, borderWidth: 0.5 });

  // ── Corner ornaments ──────────────────────────────────────────────────────
  // (cx,cy) = corner point on inner border; xd/yd = direction toward center
  function drawCorner(cx: number, cy: number, xd: number, yd: number) {
    const len = 26; const gap = 5;
    const ix = cx + xd * gap; const iy = cy + yd * gap;
    page.drawLine({ start: { x: cx, y: cy }, end: { x: cx + len * xd, y: cy }, thickness: 1.6, color: gold });
    page.drawLine({ start: { x: cx, y: cy }, end: { x: cx, y: cy + len * yd }, thickness: 1.6, color: gold });
    page.drawLine({ start: { x: ix, y: iy }, end: { x: cx + (len - 2) * xd, y: iy }, thickness: 0.6, color: goldLight });
    page.drawLine({ start: { x: ix, y: iy }, end: { x: ix, y: cy + (len - 2) * yd }, thickness: 0.6, color: goldLight });
    page.drawCircle({ x: ix, y: iy, size: 2, color: gold });
    page.drawCircle({ x: cx + len * xd, y: cy, size: 1.5, color: gold });
    page.drawCircle({ x: cx, y: cy + len * yd, size: 1.5, color: gold });
  }
  drawCorner(12, height - 12,  1, -1);
  drawCorner(width - 12, height - 12, -1, -1);
  drawCorner(12, 12,  1,  1);
  drawCorner(width - 12, 12, -1,  1);
  drawRosetteCorner(page, 14, height - 14, gold, goldLight);
  drawRosetteCorner(page, width - 14, height - 14, gold, goldLight);
  drawRosetteCorner(page, 14, 14, gold, goldLight);
  drawRosetteCorner(page, width - 14, 14, gold, goldLight);

  // ── Header ────────────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: height - headerH, width, height: headerH, color: darkNavy });
  page.drawLine({ start: { x: 0, y: height - headerH }, end: { x: width, y: height - headerH }, thickness: 2.5, color: gold });
  const headerLogoImage = await embedOptionalImage(doc, ['brand/vestium-pill.png']);
  if (headerLogoImage) {
    const fit = headerLogoImage.scaleToFit(320, 96);
    page.drawImage(headerLogoImage, {
      x: (width - fit.width) / 2,
      y: height - fit.height - 2,
      width: fit.width,
      height: fit.height,
    });
  } else {
    const brand = 'VESTIUM';
    page.drawText(brand, { x: (width - helvBold.widthOfTextAtSize(brand, 16)) / 2, y: height - 30, size: 16, font: helvBold, color: white });
  }
  const certTitle = 'MODULE LEGAL ATTESTATION CERTIFICATE';
  page.drawText(certTitle, { x: (width - helvBold.widthOfTextAtSize(certTitle, 10)) / 2, y: height - 49, size: 10, font: helvBold, color: white });
  const sub = 'MHSWR 1999 REGULATION 7 — COMPETENT PERSON REVIEW RECORD';
  page.drawText(sub, { x: (width - helv.widthOfTextAtSize(sub, 7)) / 2, y: height - 65, size: 7, font: helv, color: pale });
  const cnW = mono.widthOfTextAtSize(cert.certNumber, 7.8);
  page.drawText(cert.certNumber, { x: width - margin - cnW, y: height - 83, size: 7.8, font: mono, color: gold });

  // ── Body ──────────────────────────────────────────────────────────────────
  let y = bodyTop;
  const declaration = 'This certifies that the competent person named below has completed review and attestation of the generated module in accordance with documented reviewer disposition workflow.';
  y = drawWrappedText(page, declaration, margin, y, contentW, times, 9.2, ink, 12) - 8;

  const textW = contentW - 110;
  page.drawText(cert.reviewerName, { x: margin, y, size: 22, font: timesBold, color: darkNavy });
  y -= 17;
  page.drawText(cert.reviewerRole, { x: margin, y, size: 9.5, font: timesItalic, color: muted });
  y -= 16;
  y = drawField(page, 'Module title', cert.moduleTitle, margin, y, helvBold, times, muted, ink, textW) - 6;

  // ATTESTATION RECORDED badge
  page.drawRectangle({ x: margin, y: y - 20, width: 184, height: 18, color: darkNavy });
  page.drawText('ATTESTATION RECORDED', { x: margin + 12, y: y - 14, size: 8.5, font: helvBold, color: white });
  y -= 30;

  // ── Attested seal (top-right of body) ────────────────────────────────────
  const sealCX = width - margin - 44;
  const sealCY = bodyTop - 58;
  const sealR  = 38;
  const attestedSealImage = await embedOptionalImage(doc, [
    'certs/seal-attested.png',
    'certs/seal-attested.jpg',
  ]);
  if (attestedSealImage) {
    const size = 94;
    page.drawImage(attestedSealImage, {
      x: sealCX - size / 2,
      y: sealCY - size / 2,
      width: size,
      height: size,
    });
  } else {
    for (let i = 0; i < 24; i++) {
      const ang = (i * 15) * (Math.PI / 180);
      const r1 = sealR + 2; const r2 = sealR + (i % 2 === 0 ? 8 : 5);
      page.drawLine({
        start: { x: sealCX + Math.cos(ang) * r1, y: sealCY + Math.sin(ang) * r1 },
        end:   { x: sealCX + Math.cos(ang) * r2, y: sealCY + Math.sin(ang) * r2 },
        thickness: i % 2 === 0 ? 1.4 : 0.7, color: sealGold,
      });
    }
    page.drawCircle({ x: sealCX, y: sealCY, size: sealR, color: sealGold });
    page.drawCircle({ x: sealCX, y: sealCY, size: sealR - 5, borderColor: darkNavy, borderWidth: 1.2, color: sealGold });
    const aw = helvBold.widthOfTextAtSize('ATTESTED', 9.5);
    const bw = helvBold.widthOfTextAtSize('REVIEWED', 9.5);
    page.drawText('ATTESTED', { x: sealCX - aw / 2, y: sealCY + 3,  size: 9.5, font: helvBold, color: darkNavy });
    page.drawText('REVIEWED', { x: sealCX - bw / 2, y: sealCY - 11, size: 9.5, font: helvBold, color: darkNavy });
  }

  // ── Gold divider ──────────────────────────────────────────────────────────
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.8, color: gold });
  y -= 14;

  // ── Two-column data fields ────────────────────────────────────────────────
  let leftY = y; let rightY = y;
  leftY  = drawField(page, 'Issue datetime',    formatIssuedAtUtc(cert.issuedAt), leftX,  leftY,  helvBold, times, muted, ink, colW) - 6;
  rightY = drawField(page, 'Certificate number', cert.certNumber,                 rightX, rightY, helvBold, mono,  muted, ink, colW, 7.8) - 6;
  leftY  = drawField(page, 'Module ID',          cert.moduleId,                   leftX,  leftY,  helvBold, mono,  muted, ink, colW, 7.8) - 6;
  rightY = drawField(page, 'Attestation ID',     cert.attestationId,              rightX, rightY, helvBold, mono,  muted, ink, colW, 7.8) - 6;
  leftY  = drawField(page, 'Organisation ID',    cert.orgId,                      leftX,  leftY,  helvBold, mono,  muted, ink, colW, 7.8) - 6;
  rightY = drawField(page, 'Regulatory schemas', cert.regulatorySchemas.length ? cert.regulatorySchemas.join(', ') : '-', rightX, rightY, helvBold, times, muted, ink, colW) - 6;
  y = Math.min(leftY, rightY) - 6;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.4, color: rgb(0.75, 0.75, 0.75) });
  y -= 14;

  // ── Content integrity ─────────────────────────────────────────────────────
  page.drawText('CONTENT INTEGRITY', { x: margin, y, size: 6.5, font: helvBold, color: muted });
  y -= 11;
  page.drawText(`SHA-256: ${cert.contentHash.slice(0, 32)}`, { x: margin, y, size: 8, font: mono, color: ink });
  y -= 10.5;
  page.drawText(`         ${cert.contentHash.slice(32)}`,    { x: margin, y, size: 8, font: mono, color: ink });
  y -= 14;

  // ── Source doc versions ───────────────────────────────────────────────────
  page.drawText('SOURCE DOCUMENT VERSION SNAPSHOT', { x: margin, y, size: 6.5, font: helvBold, color: muted });
  y -= 11;
  const sourceRows = Object.entries(cert.sourceDocVersions);
  if (sourceRows.length === 0) {
    page.drawText('- No schema version snapshot recorded', { x: margin, y, size: 8, font: times, color: ink });
    y -= 11;
  } else {
    const shown = sourceRows.slice(0, 8);
    for (const [docId, version] of shown) {
      page.drawText(`${docId} | ${version}`, { x: margin, y, size: 7.8, font: mono, color: ink });
      y -= 10.5;
    }
    if (sourceRows.length > shown.length) {
      page.drawText(`+${sourceRows.length - shown.length} additional entries`, { x: margin, y, size: 7.5, font: timesItalic, color: muted });
      y -= 10;
    }
  }

  // ── QR code ───────────────────────────────────────────────────────────────
  try {
    const qrBuf = await QRCode.toBuffer(`${getVerifyBaseUrl().replace(/\/$/, '')}/verify/${cert.certNumber}`, { width: 80, margin: 1, color: { dark: '#0d1621', light: '#ffffff' } });
    const qrImg = await doc.embedPng(qrBuf);
    page.drawImage(qrImg, { x: width - margin - 62, y: footerH + 10, width: 62, height: 62 });
  } catch { /* QR optional */ }

  // ── Footer ────────────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: 0, width, height: footerH, color: darkNavy });
  page.drawLine({ start: { x: 0, y: footerH }, end: { x: width, y: footerH }, thickness: 1.5, color: gold });
  const vl = `VERIFY: ${getVerifyDisplayHost()}/verify/${cert.certNumber}`;
  page.drawText(vl, { x: (width - helvBold.widthOfTextAtSize(vl, 7.8)) / 2, y: 33, size: 7.8, font: helvBold, color: gold });
  const ll = 'Immutable issuance record. Hash-linked to attestation and source-version snapshot.';
  page.drawText(ll, { x: (width - helv.widthOfTextAtSize(ll, 6.5)) / 2, y: 18, size: 6.5, font: helv, color: pale });

  return doc.save();
}

async function collectCompetencyRefs(moduleId: string): Promise<string[]> {
  const [jobRow] = (await sql`
    SELECT job_state FROM generation_jobs WHERE module_id = ${moduleId}
  `) as { job_state: GenerationJob }[];

  if (!jobRow?.job_state) return [];
  try {
    const assembled = assembleModule(jobRow.job_state);
    const refs = new Set<string>();
    for (const stage of assembled.curriculum) {
      for (const lesson of stage.lessons) {
        for (const q of lesson.quiz) {
          if (q.regulatoryRef) refs.add(q.regulatoryRef);
        }
      }
      for (const q of stage.test) {
        if (q.regulatoryRef) refs.add(q.regulatoryRef);
      }
    }
    return [...refs].sort();
  } catch {
    return [];
  }
}

export async function buildLearnerCertPdf(
  cert: LearnerCertRecord,
  moduleCert: ModuleCertRecord,
  competencyRefs: string[] = []
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const { width, height } = page.getSize();
  const timesBold   = await doc.embedFont(StandardFonts.TimesRomanBold);
  const times       = await doc.embedFont(StandardFonts.TimesRoman);
  const timesItalic = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const helv        = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold    = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono        = await doc.embedFont(StandardFonts.Courier);

  const darkNavy  = rgb(0.05, 0.09, 0.19);
  const gold      = rgb(0.74, 0.61, 0.21);
  const goldLight = rgb(0.87, 0.74, 0.32);
  const sealGold  = rgb(0.83, 0.68, 0.22);
  const ink       = rgb(0.11, 0.11, 0.11);
  const muted     = rgb(0.44, 0.44, 0.44);
  const pale      = rgb(0.85, 0.85, 0.85);
  const white     = rgb(1, 1, 1);
  const amber     = rgb(0.78, 0.52, 0.08);

  const margin   = 30;
  const headerH  = 102;
  const footerH  = 54;
  const contentW = width - margin * 2;
  const colGap   = 18;
  const colW     = (contentW - colGap) / 2;
  const leftX    = margin;
  const rightX   = margin + colW + colGap;
  const bodyTop  = height - headerH - 18;

  // ── Background + double border ────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: 0, width, height, color: white });
  drawDiagonalWatermark(page, width, height, timesItalic, 'VESTIUM', rgb(0.92, 0.92, 0.92));
  page.drawRectangle({ x: 7,  y: 7,  width: width - 14, height: height - 14, borderColor: gold,      borderWidth: 1.6 });
  page.drawRectangle({ x: 12, y: 12, width: width - 24, height: height - 24, borderColor: goldLight, borderWidth: 0.5 });

  // ── Corner ornaments ──────────────────────────────────────────────────────
  function drawCorner(cx: number, cy: number, xd: number, yd: number) {
    const len = 26; const gap = 5;
    const ix = cx + xd * gap; const iy = cy + yd * gap;
    page.drawLine({ start: { x: cx, y: cy }, end: { x: cx + len * xd, y: cy }, thickness: 1.6, color: gold });
    page.drawLine({ start: { x: cx, y: cy }, end: { x: cx, y: cy + len * yd }, thickness: 1.6, color: gold });
    page.drawLine({ start: { x: ix, y: iy }, end: { x: cx + (len - 2) * xd, y: iy }, thickness: 0.6, color: goldLight });
    page.drawLine({ start: { x: ix, y: iy }, end: { x: ix, y: cy + (len - 2) * yd }, thickness: 0.6, color: goldLight });
    page.drawCircle({ x: ix, y: iy, size: 2, color: gold });
    page.drawCircle({ x: cx + len * xd, y: cy, size: 1.5, color: gold });
    page.drawCircle({ x: cx, y: cy + len * yd, size: 1.5, color: gold });
  }
  drawCorner(12, height - 12,  1, -1);
  drawCorner(width - 12, height - 12, -1, -1);
  drawCorner(12, 12,  1,  1);
  drawCorner(width - 12, 12, -1,  1);
  drawRosetteCorner(page, 14, height - 14, gold, goldLight);
  drawRosetteCorner(page, width - 14, height - 14, gold, goldLight);
  drawRosetteCorner(page, 14, 14, gold, goldLight);
  drawRosetteCorner(page, width - 14, 14, gold, goldLight);

  // ── Header ────────────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: height - headerH, width, height: headerH, color: darkNavy });
  page.drawLine({ start: { x: 0, y: height - headerH }, end: { x: width, y: height - headerH }, thickness: 2.5, color: gold });
  const learnerHeaderLogoImage = await embedOptionalImage(doc, ['brand/vestium-pill.png']);
  if (learnerHeaderLogoImage) {
    const fit = learnerHeaderLogoImage.scaleToFit(320, 96);
    page.drawImage(learnerHeaderLogoImage, {
      x: (width - fit.width) / 2,
      y: height - fit.height - 2,
      width: fit.width,
      height: fit.height,
    });
  } else {
    const learnerBrand = 'VESTIUM';
    page.drawText(learnerBrand, { x: (width - helvBold.widthOfTextAtSize(learnerBrand, 16)) / 2, y: height - 30, size: 16, font: helvBold, color: white });
  }
  const certTitle = cert.passed ? 'CERTIFICATE OF COMPETENCY' : 'CERTIFICATE OF PARTICIPATION';
  page.drawText(certTitle, { x: (width - helvBold.widthOfTextAtSize(certTitle, 11.5)) / 2, y: height - 50, size: 11.5, font: helvBold, color: white });
  const sub = 'UK HEALTH AND SAFETY TRAINING EVIDENCE RECORD';
  page.drawText(sub, { x: (width - helv.widthOfTextAtSize(sub, 7.2)) / 2, y: height - 66, size: 7.2, font: helv, color: pale });
  const cnW = mono.widthOfTextAtSize(cert.certNumber, 7.8);
  page.drawText(cert.certNumber, { x: width - margin - cnW, y: height - 84, size: 7.8, font: mono, color: gold });

  // ── Body ──────────────────────────────────────────────────────────────────
  let y = bodyTop;
  const decl = cert.passed
    ? 'This certifies that the learner named below has demonstrated competency against the assessed criteria for the linked Vestium module.'
    : 'This certifies that the learner named below completed module participation but did not meet the configured pass threshold.';
  y = drawWrappedText(page, decl, margin, y, contentW, times, 9.2, ink, 12) - 8;

  // Name + learner ID (constrained width to leave room for seal)
  const textW = contentW - 110;
  page.drawText(cert.learnerName, { x: margin, y, size: 22, font: timesBold, color: darkNavy });
  y -= 17;
  page.drawText(`Learner ID: ${cert.learnerUserId}`, { x: margin, y, size: 8.5, font: mono, color: muted });
  y -= 16;

  // Module title
  page.drawText('MODULE TITLE', { x: margin, y, size: 6.5, font: helvBold, color: muted });
  y -= 11;
  y = drawWrappedText(page, moduleCert.moduleTitle, margin, y, textW, times, 9.2, ink, 11) - 4;

  // Score line (amber)
  const scoreText = `Score ${cert.score}% | Pass threshold ${cert.passThreshold}%`;
  page.drawText(scoreText, { x: margin, y, size: 9, font: helv, color: amber });
  y -= 6;

  // ── PASSED / NOT PASSED seal (top-right of body) ──────────────────────────
  const sealCX = width - margin - 44;
  const sealCY = bodyTop - 58;
  const sealR  = 38;
  const learnerSealImage = await embedOptionalImage(doc, cert.passed
    ? ['certs/seal-passed.png', 'certs/seal-passed.jpg']
    : ['certs/seal-not-passed.png', 'certs/seal-not-passed.jpg']
  );
  if (learnerSealImage) {
    const size = 94;
    page.drawImage(learnerSealImage, {
      x: sealCX - size / 2,
      y: sealCY - size / 2,
      width: size,
      height: size,
    });
  } else {
    for (let i = 0; i < 24; i++) {
      const ang = (i * 15) * (Math.PI / 180);
      const r1 = sealR + 2; const r2 = sealR + (i % 2 === 0 ? 8 : 5);
      page.drawLine({
        start: { x: sealCX + Math.cos(ang) * r1, y: sealCY + Math.sin(ang) * r1 },
        end:   { x: sealCX + Math.cos(ang) * r2, y: sealCY + Math.sin(ang) * r2 },
        thickness: i % 2 === 0 ? 1.4 : 0.7, color: sealGold,
      });
    }
    page.drawCircle({ x: sealCX, y: sealCY, size: sealR, color: sealGold });
    page.drawCircle({ x: sealCX, y: sealCY, size: sealR - 5, borderColor: darkNavy, borderWidth: 1.2, color: sealGold });
    if (cert.passed) {
      const pw = helvBold.widthOfTextAtSize('PASSED', 13);
      page.drawText('PASSED', { x: sealCX - pw / 2, y: sealCY - 5, size: 13, font: helvBold, color: darkNavy });
    } else {
      const nw = helvBold.widthOfTextAtSize('NOT', 11);
      const pw = helvBold.widthOfTextAtSize('PASSED', 11);
      page.drawText('NOT',    { x: sealCX - nw / 2, y: sealCY + 4,  size: 11, font: helvBold, color: darkNavy });
      page.drawText('PASSED', { x: sealCX - pw / 2, y: sealCY - 10, size: 11, font: helvBold, color: darkNavy });
    }
  }

  // ── Gold divider ──────────────────────────────────────────────────────────
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.8, color: gold });
  y -= 14;

  // ── Two-column data fields ────────────────────────────────────────────────
  let leftY = y; let rightY = y;
  leftY  = drawField(page, 'Issue date time',          formatIssuedAtUtc(cert.issuedAt),  leftX,  leftY,  helvBold, times, muted, ink, colW) - 6;
  rightY = drawField(page, 'Certificate number',       cert.certNumber,                   rightX, rightY, helvBold, mono,  muted, ink, colW, 7.8) - 6;
  leftY  = drawField(page, 'Module ID',                cert.moduleId,                     leftX,  leftY,  helvBold, mono,  muted, ink, colW, 7.8) - 6;
  rightY = drawField(page, 'Organisation ID',          cert.orgId,                        rightX, rightY, helvBold, mono,  muted, ink, colW, 7.8) - 6;
  leftY  = drawField(page, 'Linked module certificate', moduleCert.certNumber,             leftX,  leftY,  helvBold, mono,  muted, ink, colW, 7.8) - 6;
  rightY = drawField(page, 'Reviewed by',              `${moduleCert.reviewerName} | ${moduleCert.reviewerRole}`, rightX, rightY, helvBold, times, muted, ink, colW) - 6;
  leftY  = drawField(page, 'Regulatory frameworks',   moduleCert.regulatorySchemas.length ? moduleCert.regulatorySchemas.join(', ') : '-', leftX, leftY, helvBold, times, muted, ink, colW) - 6;
  rightY = drawField(page, 'Module content hash (SHA-256)', moduleCert.contentHash, rightX, rightY, helvBold, mono, muted, ink, colW, 7.2) - 6;
  y = Math.min(leftY, rightY) - 8;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.4, color: rgb(0.75, 0.75, 0.75) });
  y -= 14;

  // ── Regulatory competency refs ────────────────────────────────────────────
  page.drawText('REGULATORY COMPETENCY REFERENCES', { x: margin, y, size: 6.5, font: helvBold, color: muted });
  y -= 11;
  if (competencyRefs.length === 0) {
    page.drawText('- No question-level regulatory references captured for this module.', { x: margin, y, size: 8, font: times, color: ink });
    y -= 11;
  } else {
    const shown = competencyRefs.slice(0, 20);
    const half = Math.ceil(shown.length / 2);
    const left = shown.slice(0, half); const right = shown.slice(half);
    for (let i = 0; i < left.length;  i++) page.drawText(`- ${left[i]}`,  { x: leftX,  y: y - i * 10.5, size: 7.8, font: times, color: ink });
    for (let i = 0; i < right.length; i++) page.drawText(`- ${right[i]}`, { x: rightX, y: y - i * 10.5, size: 7.8, font: times, color: ink });
    y -= Math.max(left.length, right.length) * 10.5 + 4;
    if (competencyRefs.length > shown.length) {
      page.drawText(`+${competencyRefs.length - shown.length} additional references in system record`, { x: margin, y, size: 7.5, font: timesItalic, color: muted });
      y -= 10;
    }
  }

  // ── QR code ───────────────────────────────────────────────────────────────
  try {
    const qrBuf = await QRCode.toBuffer(`${getVerifyBaseUrl().replace(/\/$/, '')}/verify/${cert.certNumber}`, { width: 80, margin: 1, color: { dark: '#0d1621', light: '#ffffff' } });
    const qrImg = await doc.embedPng(qrBuf);
    page.drawImage(qrImg, { x: width - margin - 62, y: footerH + 10, width: 62, height: 62 });
  } catch { /* QR optional */ }

  // ── Footer ────────────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: 0, width, height: footerH, color: darkNavy });
  page.drawLine({ start: { x: 0, y: footerH }, end: { x: width, y: footerH }, thickness: 1.5, color: gold });
  const vl = `VERIFY: ${getVerifyDisplayHost()}/verify/${cert.certNumber}`;
  page.drawText(vl, { x: (width - helvBold.widthOfTextAtSize(vl, 7.8)) / 2, y: 33, size: 7.8, font: helvBold, color: gold });
  const ll = 'Linked to module certificate chain and immutable audit record.';
  page.drawText(ll, { x: (width - helv.widthOfTextAtSize(ll, 6.5)) / 2, y: 18, size: 6.5, font: helv, color: pale });

  return doc.save();
}

// ─── Authenticated cert routes ─────────────────────────────────────────────────

export const certsRoutes: FastifyPluginAsync = async (app) => {
  // POST /api/certs/module/:moduleId
  // Generate (or return existing) module cert. Requires completed attestation.
  app.post<{ Params: { moduleId: string } }>('/module/:moduleId', { preHandler: [requireRole('admin', 'reviewer')] }, async (request, reply) => {
    const { userId, orgId, role } = request.auth;
    const { moduleId } = request.params;

    if (!orgId) {
      reply.status(400);
      return { ok: false, error: 'No active org' };
    }

    // Check module belongs to org
    const moduleRows = await sql`
      SELECT m.id, m.org_id, m.content_hash, m.regulatory_classification, m.title, m.status,
             m.generation_metadata
      FROM modules m
      JOIN orgs o ON o.id = m.org_id
      WHERE m.id = ${moduleId} AND o.clerk_org_id = ${orgId}
    `;
    if (!moduleRows[0]) {
      reply.status(404);
      return { ok: false, error: 'Module not found' };
    }
    const mod = moduleRows[0] as Record<string, unknown>;
    const dbOrgId = mod.org_id as string;

    // Return existing cert if present
    const existingRows = await sql`
      SELECT * FROM module_certificates WHERE module_id = ${moduleId} ORDER BY issued_at DESC LIMIT 1
    `;
    if (existingRows[0]) {
      return { ok: true, data: rowToModuleCert(existingRows[0] as Record<string, unknown>) };
    }

    // Module must be in_review to issue a cert — blocks draft path (no completed pipeline)
    if ((mod.status as string) !== 'in_review') {
      reply.status(409);
      return { ok: false, error: `Module must be in review state before cert issuance (current status: ${mod.status as string})` };
    }

    // Require completed attestation
    const attestRows = await sql`
      SELECT id, reviewer_name, reviewer_role, content_hash_at_attestation, regulatory_frameworks_reviewed
      FROM attestations WHERE module_id = ${moduleId} ORDER BY attested_at DESC LIMIT 1
    `;
    if (!attestRows[0]) {
      reply.status(400);
      return { ok: false, error: 'Module cert requires a completed attestation.' };
    }
    const attest = attestRows[0] as Record<string, unknown>;

    // Derive content hash: prefer attestation hash, fall back to module hash.
    // No weak fallback — a real content hash must exist from generation or attestation.
    const contentHash = (attest.content_hash_at_attestation as string | null)
      ?? (mod.content_hash as string | null);
    if (!contentHash) {
      reply.status(409);
      return { ok: false, error: 'Module has no content hash. Regenerate the module to establish a cryptographic content chain.' };
    }

    // Build source_doc_versions snapshot from generation metadata
    const genMeta = mod.generation_metadata as Record<string, unknown> | null;
    const sourceDocVersions = (genMeta?.schemaVersions as Record<string, string>) ?? {};

    // Regulatory schemas from classification
    const regClass = mod.regulatory_classification as Record<string, unknown> | null;
    const regulatorySchemas = ((regClass?.applicableSchemas as Array<{ schemaId: string }>) ?? [])
      .map((s) => s.schemaId);

    const certId = crypto.randomUUID();
    const certNumber = makeCertNumber('MOD', certId);

    // Look up latest snapshot version for cert linkage (may be null if snapshots not yet created)
    const snapshotVersion = await getLatestSnapshotVersion(moduleId);

    // Serialize by module to avoid duplicate cert issuance even on drifted DBs
    // where unique index on module_certificates(module_id) may be missing.
    const upsertRows = await sql`
      WITH _lock AS (
        SELECT pg_advisory_xact_lock(hashtext(${moduleId}), 0)
      ),
      existing AS (
        SELECT * FROM module_certificates
        WHERE module_id = ${moduleId}
        LIMIT 1
      ),
      inserted AS (
        INSERT INTO module_certificates (
          id, module_id, attestation_id, org_id, cert_number,
          content_hash, source_doc_versions, regulatory_schemas,
          module_title, reviewer_name, reviewer_role, snapshot_version
        )
        SELECT
          ${certId}, ${moduleId}, ${attest.id as string}, ${dbOrgId}, ${certNumber},
          ${contentHash}, ${JSON.stringify(sourceDocVersions)}, ${regulatorySchemas},
          ${mod.title as string}, ${attest.reviewer_name as string}, ${attest.reviewer_role as string},
          ${snapshotVersion}
        WHERE NOT EXISTS (SELECT 1 FROM existing)
        RETURNING *
      )
      SELECT inserted.*, true AS was_inserted FROM inserted
      UNION ALL
      SELECT existing.*, false AS was_inserted FROM existing
      LIMIT 1
    `;

    if (!upsertRows[0]) {
      reply.status(500);
      return { ok: false, error: 'Cert issuance failed' };
    }
    const cert = upsertRows[0] as Record<string, unknown> & { was_inserted: boolean };
    const certRow: Record<string, unknown> = cert;
    if (cert.was_inserted) {

      // Mark module as deployed
      await sql`
        UPDATE modules SET status = 'deployed', deployed_at = now(), updated_at = now()
        WHERE id = ${moduleId}
      `;

      await writeAuditLog({
        orgId: dbOrgId,
        moduleId,
        userId,
        userRole: role,
        action: 'module_deployed',
        payload: { certNumber, certId, contentHash },
      });
      await writeAuditLog({
        orgId: dbOrgId,
        moduleId,
        userId,
        userRole: role,
        action: 'certificate_issued',
        payload: { type: 'module', certNumber: certRow.cert_number, certId: certRow.id },
      });

      // Distill org context — accumulate covered topics, reviewer corrections,
      // and domain insights from all deployed modules for future generation prompts.
      // Best-effort: failure here should not block cert issuance.
      try {
        await updateDistilledOrgContext(dbOrgId);
      } catch {
        // Non-critical — distilled context will be rebuilt on next deployment
      }
    }

    reply.status(201);
    return { ok: true, data: rowToModuleCert(certRow) };
  });

  // GET /api/certs/module/:moduleId
  // Get the current module cert.
  app.get<{ Params: { moduleId: string } }>('/module/:moduleId', { preHandler: [requireRole('admin', 'reviewer')] }, async (request, reply) => {
    const { orgId } = request.auth;
    const { moduleId } = request.params;

    if (!orgId) {
      reply.status(400);
      return { ok: false, error: 'No active org' };
    }

    const rows = await sql`
      SELECT mc.*
      FROM module_certificates mc
      JOIN modules m ON m.id = mc.module_id
      JOIN orgs o ON o.id = m.org_id
      WHERE mc.module_id = ${moduleId} AND o.clerk_org_id = ${orgId}
      ORDER BY mc.issued_at DESC LIMIT 1
    `;
    if (!rows[0]) {
      reply.status(404);
      return { ok: false, error: 'No module certificate found' };
    }
    return { ok: true, data: rowToModuleCert(rows[0] as Record<string, unknown>) };
  });

  // GET /api/certs/module/:moduleId/pdf
  app.get<{ Params: { moduleId: string } }>('/module/:moduleId/pdf', { preHandler: [requireRole('admin', 'reviewer')] }, async (request, reply) => {
    const { orgId } = request.auth;
    const { moduleId } = request.params;

    if (!orgId) {
      reply.status(400);
      return reply.send({ ok: false, error: 'No active org' });
    }

    const rows = await sql`
      SELECT mc.*
      FROM module_certificates mc
      JOIN modules m ON m.id = mc.module_id
      JOIN orgs o ON o.id = m.org_id
      WHERE mc.module_id = ${moduleId} AND o.clerk_org_id = ${orgId}
      ORDER BY mc.issued_at DESC LIMIT 1
    `;
    if (!rows[0]) {
      reply.status(404);
      return reply.send({ error: 'No module certificate found' });
    }

    const cert = rowToModuleCert(rows[0] as Record<string, unknown>);
    const pdfBytes = await buildModuleCertPdf(cert);
    reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="${cert.certNumber}.pdf"`)
      .send(Buffer.from(pdfBytes));
  });

  // POST /api/certs/learner/:moduleId
  // Issue a learner certificate. Module must have a module cert.
  // RBAC: admin or hr_manager only — learner cert issuance is an evidentiary act.
  app.post<{ Params: { moduleId: string } }>('/learner/:moduleId', { preHandler: [requireRole('admin', 'hr_manager')] }, async (request, reply) => {
    const { userId, orgId, role } = request.auth;
    const { moduleId } = request.params;

    if (!orgId) {
      reply.status(400);
      return { ok: false, error: 'No active org' };
    }

    const parsed = IssueLearnerCertSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return { ok: false, error: 'Invalid request body', code: parsed.error.message };
    }

    // Module cert must exist
    const moduleCertRows = await sql`
      SELECT mc.id, m.org_id
      FROM module_certificates mc
      JOIN modules m ON m.id = mc.module_id
      JOIN orgs o ON o.id = m.org_id
      WHERE mc.module_id = ${moduleId} AND o.clerk_org_id = ${orgId}
      ORDER BY mc.issued_at DESC LIMIT 1
    `;
    if (!moduleCertRows[0]) {
      reply.status(400);
      return { ok: false, error: 'Module certificate not found. Deploy the module first.' };
    }
    const moduleCertId = (moduleCertRows[0] as Record<string, unknown>).id as string;
    const dbOrgId = (moduleCertRows[0] as Record<string, unknown>).org_id as string;

    const { learnerName, learnerUserId, score, passThreshold } = parsed.data;
    const passed = score >= passThreshold;
    const certId = crypto.randomUUID();
    const certNumber = makeCertNumber('LRN', certId);

    const rows = await sql`
      INSERT INTO learner_certificates (
        id, module_cert_id, module_id, org_id, cert_number,
        learner_name, learner_user_id, score, pass_threshold, passed
      )
      VALUES (
        ${certId}, ${moduleCertId}, ${moduleId}, ${dbOrgId}, ${certNumber},
        ${learnerName}, ${learnerUserId}, ${score}, ${passThreshold}, ${passed}
      )
      RETURNING *
    `;

    await writeAuditLog({
      orgId: dbOrgId,
      moduleId,
      userId,
      userRole: role,
      action: 'certificate_issued',
      payload: { type: 'learner', certNumber, certId, learnerUserId },
    });

    reply.status(201);
    return { ok: true, data: rowToLearnerCert(rows[0] as Record<string, unknown>) };
  });

  // GET /api/certs/learner/:certNumber/pdf
  // RBAC: all authenticated roles — no role gate required.
  app.get<{ Params: { certNumber: string } }>('/learner/:certNumber/pdf', async (request, reply) => {
    const { orgId } = request.auth;
    const { certNumber } = request.params;

    if (!orgId) {
      reply.status(400);
      return reply.send({ ok: false, error: 'No active org' });
    }

    const certRows = await sql`
      SELECT lc.*
      FROM learner_certificates lc
      JOIN modules m ON m.id = lc.module_id
      JOIN orgs o ON o.id = m.org_id
      WHERE lc.cert_number = ${certNumber} AND o.clerk_org_id = ${orgId}
    `;
    if (!certRows[0]) {
      reply.status(404);
      return reply.send({ error: 'Learner certificate not found' });
    }

    const cert = rowToLearnerCert(certRows[0] as Record<string, unknown>);
    const moduleCertRows = await sql`SELECT * FROM module_certificates WHERE id = ${cert.moduleCertId}`;
    if (!moduleCertRows[0]) {
      reply.status(404);
      return reply.send({ error: 'Module certificate not found' });
    }
    const moduleCert = rowToModuleCert(moduleCertRows[0] as Record<string, unknown>);

    const competencyRefs = await collectCompetencyRefs(cert.moduleId);
    const pdfBytes = await buildLearnerCertPdf(cert, moduleCert, competencyRefs);
    reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="${cert.certNumber}.pdf"`)
      .send(Buffer.from(pdfBytes));
  });
};

// ─── Public verification handler (registered before auth in index.ts) ──────────

// ─── Simple in-memory rate limiter for /verify/ ──────────────────────────────
// 30 requests per IP per 60-second window. Single-instance safe (Railway).
const verifyRateMap = new Map<string, { count: number; resetAt: number }>();
const VERIFY_WINDOW_MS = 60_000;
const VERIFY_MAX_REQUESTS = 30;

function checkVerifyRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = verifyRateMap.get(ip);
  if (!entry || now >= entry.resetAt) {
    verifyRateMap.set(ip, { count: 1, resetAt: now + VERIFY_WINDOW_MS });
    return true;
  }
  if (entry.count >= VERIFY_MAX_REQUESTS) return false;
  entry.count += 1;
  return true;
}

export async function registerPublicCertRoutes(app: FastifyInstance): Promise<void> {
  // GET /verify/:certNumber — no auth required
  // Looks up cert_number in both tables, returns full chain.
  app.get<{ Params: { certNumber: string } }>('/verify/:certNumber', async (request, reply) => {
    const ip = request.ip ?? 'unknown';
    if (!checkVerifyRateLimit(ip)) {
      reply.status(429);
      return { error: 'Too many requests — please try again shortly' };
    }

    const { certNumber } = request.params;

    // Try module cert first
    const modRows = await sql`SELECT * FROM module_certificates WHERE cert_number = ${certNumber}`;
    if (modRows[0]) {
      return {
        type: 'module',
        moduleCert: rowToModuleCert(modRows[0] as Record<string, unknown>),
      };
    }

    // Try learner cert
    const lrnRows = await sql`SELECT * FROM learner_certificates WHERE cert_number = ${certNumber}`;
    if (lrnRows[0]) {
      const learnerCert = rowToLearnerCert(lrnRows[0] as Record<string, unknown>);
      const modCertRows = await sql`SELECT * FROM module_certificates WHERE id = ${learnerCert.moduleCertId}`;
      if (!modCertRows[0]) {
        reply.status(500);
        return { error: 'Module certificate missing from chain' };
      }
      return {
        type: 'learner',
        moduleCert: rowToModuleCert(modCertRows[0] as Record<string, unknown>),
        learnerCert,
      };
    }

    reply.status(404);
    return { error: 'Certificate not found' };
  });
}
