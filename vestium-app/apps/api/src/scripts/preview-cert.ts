// Preview script — generates sample cert PDFs to /tmp for visual inspection.
// Run: npx tsx src/scripts/preview-cert.ts (from apps/api/)

import { writeFileSync } from 'fs';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

// ─── Mock data ────────────────────────────────────────────────────────────────

const mockModuleCert = {
  id: 'b1a2c3d4-0000-0000-0000-000000000001',
  moduleId: 'mod-mhswr-001',
  attestationId: 'att-00001',
  orgId: 'org-001',
  certNumber: 'VS-MOD-20260303-b1a2c3d4',
  contentHash: 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef12345678',
  sourceDocVersions: { mhswr_1999: '2024-01', puwer_1998: '2024-01' },
  regulatorySchemas: ['mhswr_1999', 'puwer_1998'],
  moduleTitle: 'Safe Use of Work Equipment — PUWER & MHSWR Compliance',
  reviewerName: 'Dr. Sarah J. Whitfield',
  reviewerRole: 'Principal H&S Consultant (CMIOSH)',
  issuedAt: new Date().toISOString(),
};

const mockLearnerCert = {
  id: 'c1d2e3f4-0000-0000-0000-000000000002',
  moduleCertId: mockModuleCert.id,
  moduleId: mockModuleCert.moduleId,
  orgId: 'org-001',
  certNumber: 'VS-LRN-20260303-c1d2e3f4',
  learnerName: 'James R. Thornton',
  learnerUserId: 'user_2abc123',
  score: 87,
  passThreshold: 70,
  passed: true,
  issuedAt: new Date().toISOString(),
};

const mockCompetencyRefs = [
  'MHSWR 1999 Reg 3(1)',
  'MHSWR 1999 Reg 5',
  'MHSWR 1999 Reg 13(1)',
  'PUWER 1998 Reg 4',
  'PUWER 1998 Reg 6',
  'PUWER 1998 Reg 9',
  'PUWER 1998 Reg 11',
  'PUWER 1998 Reg 22',
];

// ─── Module cert PDF ──────────────────────────────────────────────────────────

async function buildModuleCertPdf(cert: typeof mockModuleCert): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const { width, height } = page.getSize();

  const timesBold   = await doc.embedFont(StandardFonts.TimesRomanBold);
  const times       = await doc.embedFont(StandardFonts.TimesRoman);
  const timesItalic = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const helv        = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold    = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono        = await doc.embedFont(StandardFonts.Courier);

  const burgundy  = rgb(0.45, 0.06, 0.08);
  const gold      = rgb(0.71, 0.56, 0.06);
  const silver    = rgb(0.65, 0.65, 0.65);
  const charcoal  = rgb(0.18, 0.18, 0.18);
  const midGray   = rgb(0.45, 0.45, 0.45);
  const lightGray = rgb(0.72, 0.72, 0.72);
  const white     = rgb(1, 1, 1);

  const HEADER_H = 90;
  const FOOTER_H = 48;
  const lx = 32;

  const cx = (text: string, yPos: number, size: number, font: typeof times, color: typeof burgundy) => {
    const tw = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (width - tw) / 2, y: yPos, size, font, color });
  };

  page.drawRectangle({ x: 8, y: 8, width: width - 16, height: height - 16, borderColor: burgundy, borderWidth: 1.5 });
  page.drawRectangle({ x: 15, y: 15, width: width - 30, height: height - 30, borderColor: silver, borderWidth: 0.4 });
  page.drawRectangle({ x: 8, y: FOOTER_H, width: 5, height: height - HEADER_H - FOOTER_H, color: burgundy });
  page.drawRectangle({ x: 0, y: height - HEADER_H, width, height: HEADER_H, color: burgundy });
  cx('VESTIUM', height - 34, 13, helvBold, white);
  cx('Module Creation Certificate', height - 52, 9.5, helv, rgb(0.85, 0.85, 0.85));
  cx('MHSWR Reg 7 — Competent Person Review Record', height - 65, 7.5, helv, rgb(0.7, 0.7, 0.7));
  const cnW = mono.widthOfTextAtSize(cert.certNumber, 7);
  page.drawText(cert.certNumber, { x: width - lx - cnW, y: height - 81, size: 7, font: mono, color: gold });
  page.drawLine({ start: { x: 0, y: height - HEADER_H }, end: { x: width, y: height - HEADER_H }, thickness: 2, color: gold });

  let y = height - HEADER_H - 32;
  cx('This is to attest that', y, 10, timesItalic, midGray);
  y -= 33;

  const revNameSz = cert.reviewerName.length > 30 ? 18 : 22;
  cx(cert.reviewerName, y, revNameSz, timesBold, burgundy);
  const rnW = timesBold.widthOfTextAtSize(cert.reviewerName, revNameSz);
  const rnX = (width - rnW) / 2;
  page.drawLine({ start: { x: rnX, y: y - 4 }, end: { x: rnX + rnW, y: y - 4 }, thickness: 0.8, color: gold });
  y -= revNameSz + 16;

  cx('acting as Competent Person under MHSWR 1999 Regulation 7', y, 9, timesItalic, charcoal);
  y -= 16;
  cx('has reviewed and attested to the compliance content of', y, 9, timesItalic, charcoal);
  y -= 22;

  const titleSz = 11.5;
  const titleMaxW = width - lx * 4;
  if (timesBold.widthOfTextAtSize(cert.moduleTitle, titleSz) <= titleMaxW) {
    cx(cert.moduleTitle, y, titleSz, timesBold, charcoal);
    y -= 22;
  } else {
    const words = cert.moduleTitle.split(' ');
    const mid = Math.ceil(words.length / 2);
    cx(words.slice(0, mid).join(' '), y, titleSz - 1, timesBold, charcoal);
    y -= 18;
    cx(words.slice(mid).join(' '), y, titleSz - 1, timesBold, charcoal);
    y -= 20;
  }
  y -= 16;

  const badgeW = 130;
  const badgeH = 28;
  const badgeBottomY = y - badgeH;
  page.drawRectangle({ x: (width - badgeW) / 2, y: badgeBottomY, width: badgeW, height: badgeH, color: burgundy });
  const atW = helvBold.widthOfTextAtSize('ATTESTED', 11);
  page.drawText('ATTESTED', { x: (width - atW) / 2, y: badgeBottomY + 9, size: 11, font: helvBold, color: white });
  y = badgeBottomY - 20;

  page.drawLine({ start: { x: lx + 10, y }, end: { x: width - lx - 10, y }, thickness: 0.5, color: gold });
  y -= 18;

  const col1x = lx + 14;
  const col2x = width / 2 + 10;
  const field = (label: string, value: string, x: number, yy: number, useMono = false) => {
    page.drawText(label.toUpperCase(), { x, y: yy, size: 6.5, font: helvBold, color: lightGray });
    page.drawText(value, { x, y: yy - 11, size: 8.5, font: useMono ? mono : times, color: charcoal });
  };

  const issuedStr = new Date(cert.issuedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  field('Issue Date', issuedStr, col1x, y);
  field('Cert Number', cert.certNumber, col2x, y, true);
  y -= 32;
  field('Module ID', cert.moduleId, col1x, y, true);
  field('Attestation ID', cert.attestationId, col2x, y, true);
  y -= 32;
  field('Regulatory Frameworks', cert.regulatorySchemas.join(', ') || '—', col1x, y);
  y -= 32;

  const section = (title: string) => {
    y -= 8;
    page.drawLine({ start: { x: col1x, y }, end: { x: width - lx - 14, y }, thickness: 0.3, color: lightGray });
    y -= 13;
    page.drawText(title.toUpperCase(), { x: col1x, y, size: 6.5, font: helvBold, color: lightGray });
    y -= 14;
  };

  section('Content Integrity');
  const hash = cert.contentHash;
  field('SHA-256 (1/2)', hash.slice(0, 32), col1x, y, true);
  y -= 28;
  field('SHA-256 (2/2)', hash.slice(32), col1x, y, true);
  y -= 32;

  const docEntries = Object.entries(cert.sourceDocVersions);
  if (docEntries.length > 0) {
    section('Source Document Versions');
    for (const [docId, version] of docEntries) {
      page.drawText(`${docId} · ${version}`, { x: col1x, y, size: 7.5, font: mono, color: charcoal });
      y -= 14;
    }
  }

  page.drawRectangle({ x: 0, y: 0, width, height: FOOTER_H, color: burgundy });
  cx(`Verify: vestium.app/verify/${cert.certNumber}`, 30, 7.5, helv, gold);
  cx('This certificate is immutable and hash-linked · Open Government Licence · legislation.gov.uk', 16, 6, helv, rgb(0.7, 0.7, 0.7));

  return doc.save();
}

// ─── Learner cert PDF ─────────────────────────────────────────────────────────

async function buildLearnerCertPdf(
  cert: typeof mockLearnerCert,
  moduleCert: typeof mockModuleCert,
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

  const navy      = rgb(0.08, 0.15, 0.38);
  const gold      = rgb(0.71, 0.56, 0.06);
  const silver    = rgb(0.65, 0.65, 0.65);
  const charcoal  = rgb(0.18, 0.18, 0.18);
  const midGray   = rgb(0.45, 0.45, 0.45);
  const lightGray = rgb(0.72, 0.72, 0.72);
  const white     = rgb(1, 1, 1);
  const passGreen = rgb(0.04, 0.38, 0.17);
  const failAmber = rgb(0.52, 0.25, 0.03);
  const resultColor = cert.passed ? passGreen : failAmber;

  const HEADER_H = 90;
  const FOOTER_H = 48;
  const lx = 32;

  const cx = (text: string, yPos: number, size: number, font: typeof times, color: typeof navy) => {
    const tw = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (width - tw) / 2, y: yPos, size, font, color });
  };

  page.drawRectangle({ x: 8, y: 8, width: width - 16, height: height - 16, borderColor: navy, borderWidth: 1.5 });
  page.drawRectangle({ x: 15, y: 15, width: width - 30, height: height - 30, borderColor: silver, borderWidth: 0.4 });
  page.drawRectangle({ x: 8, y: FOOTER_H, width: 5, height: height - HEADER_H - FOOTER_H, color: navy });
  page.drawRectangle({ x: 0, y: height - HEADER_H, width, height: HEADER_H, color: navy });
  cx('VESTIUM', height - 34, 13, helvBold, white);
  cx(cert.passed ? 'Certificate of Competency' : 'Certificate of Participation', height - 52, 9.5, helv, rgb(0.85, 0.85, 0.85));
  cx('UK Health & Safety Regulatory Training', height - 65, 7.5, helv, rgb(0.7, 0.7, 0.7));
  const cnW = mono.widthOfTextAtSize(cert.certNumber, 7);
  page.drawText(cert.certNumber, { x: width - lx - cnW, y: height - 81, size: 7, font: mono, color: gold });
  page.drawLine({ start: { x: 0, y: height - HEADER_H }, end: { x: width, y: height - HEADER_H }, thickness: 2, color: gold });

  let y = height - HEADER_H - 32;
  cx('This is to certify that', y, 10, timesItalic, midGray);
  y -= 33;

  const nameSz = cert.learnerName.length > 30 ? 18 : 22;
  cx(cert.learnerName, y, nameSz, timesBold, navy);
  const nameW = timesBold.widthOfTextAtSize(cert.learnerName, nameSz);
  const nameX = (width - nameW) / 2;
  page.drawLine({ start: { x: nameX, y: y - 4 }, end: { x: nameX + nameW, y: y - 4 }, thickness: 0.8, color: gold });
  y -= nameSz + 16;

  cx('has successfully demonstrated competency satisfying', y, 9, timesItalic, charcoal);
  y -= 16;
  cx('the requirements of', y, 9, timesItalic, charcoal);
  y -= 22;

  const titleSz = 11.5;
  const titleMaxW = width - lx * 4;
  if (timesBold.widthOfTextAtSize(moduleCert.moduleTitle, titleSz) <= titleMaxW) {
    cx(moduleCert.moduleTitle, y, titleSz, timesBold, charcoal);
    y -= 22;
  } else {
    const words = moduleCert.moduleTitle.split(' ');
    const mid = Math.ceil(words.length / 2);
    cx(words.slice(0, mid).join(' '), y, titleSz - 1, timesBold, charcoal);
    y -= 18;
    cx(words.slice(mid).join(' '), y, titleSz - 1, timesBold, charcoal);
    y -= 20;
  }
  y -= 18;

  const badgeW = 150;
  const badgeH = 30;
  const badgeBottomY = y - badgeH;
  page.drawRectangle({ x: (width - badgeW) / 2, y: badgeBottomY, width: badgeW, height: badgeH, color: resultColor });
  const resultLabel = cert.passed ? 'PASSED' : 'NOT PASSED';
  const rlW = helvBold.widthOfTextAtSize(resultLabel, 11);
  page.drawText(resultLabel, { x: (width - rlW) / 2, y: badgeBottomY + 10, size: 11, font: helvBold, color: white });
  y = badgeBottomY - 14;

  cx(`Score: ${cert.score}% · Pass threshold: ${cert.passThreshold}%`, y, 8, helv, midGray);
  y -= 22;

  page.drawLine({ start: { x: lx + 10, y }, end: { x: width - lx - 10, y }, thickness: 0.5, color: gold });
  y -= 18;

  const col1x = lx + 14;
  const col2x = width / 2 + 10;
  const field = (label: string, value: string, x: number, yy: number, useMono = false) => {
    page.drawText(label.toUpperCase(), { x, y: yy, size: 6.5, font: helvBold, color: lightGray });
    page.drawText(value, { x, y: yy - 11, size: 8.5, font: useMono ? mono : times, color: charcoal });
  };

  const issuedStr = new Date(cert.issuedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  field('Issue Date', issuedStr, col1x, y);
  field('Cert Number', cert.certNumber, col2x, y, true);
  y -= 32;
  field('Learner ID', cert.learnerUserId, col1x, y, true);
  field('Module ID', cert.moduleId, col2x, y, true);
  y -= 32;

  const section = (title: string) => {
    y -= 8;
    page.drawLine({ start: { x: col1x, y }, end: { x: width - lx - 14, y }, thickness: 0.3, color: lightGray });
    y -= 13;
    page.drawText(title.toUpperCase(), { x: col1x, y, size: 6.5, font: helvBold, color: lightGray });
    y -= 14;
  };

  section('Certificate Chain');
  field('Module Certificate', moduleCert.certNumber, col1x, y, true);
  field('Reviewed by', `${moduleCert.reviewerName} · ${moduleCert.reviewerRole}`, col2x, y);
  y -= 32;
  field('Regulatory Frameworks', moduleCert.regulatorySchemas.join(', ') || '—', col1x, y);
  y -= 32;

  if (competencyRefs.length > 0) {
    section('Regulatory Competencies Demonstrated');
    const half = Math.ceil(competencyRefs.length / 2);
    const leftRefs  = competencyRefs.slice(0, half);
    const rightRefs = competencyRefs.slice(half);
    const refStartY = y;
    for (let i = 0; i < leftRefs.length; i++) {
      page.drawText(`• ${leftRefs[i]}`, { x: col1x, y: refStartY - i * 13, size: 8, font: times, color: charcoal });
    }
    for (let i = 0; i < rightRefs.length; i++) {
      page.drawText(`• ${rightRefs[i]}`, { x: col2x, y: refStartY - i * 13, size: 8, font: times, color: charcoal });
    }
  }

  page.drawRectangle({ x: 0, y: 0, width, height: FOOTER_H, color: navy });
  cx(`Verify: vestium.app/verify/${cert.certNumber}`, 30, 7.5, helv, gold);
  cx('UK Health & Safety Regulations · MHSWR 1999 · hse.gov.uk · legislation.gov.uk', 16, 6, helv, rgb(0.65, 0.65, 0.65));

  return doc.save();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const modPdf = await buildModuleCertPdf(mockModuleCert);
writeFileSync('/tmp/cf-module-cert-preview.pdf', modPdf);
console.log('✓ Module cert  →  /tmp/cf-module-cert-preview.pdf');

const lrnPdf = await buildLearnerCertPdf(mockLearnerCert, mockModuleCert, mockCompetencyRefs);
writeFileSync('/tmp/cf-learner-cert-preview.pdf', lrnPdf);
console.log('✓ Learner cert →  /tmp/cf-learner-cert-preview.pdf');

// Also generate a "not passed" learner cert
const failCert = { ...mockLearnerCert, score: 58, passed: false, certNumber: 'VS-LRN-20260303-fail0001' };
const failPdf = await buildLearnerCertPdf(failCert, mockModuleCert, []);
writeFileSync('/tmp/cf-learner-cert-fail-preview.pdf', failPdf);
console.log('✓ Learner cert (not passed, no refs) →  /tmp/cf-learner-cert-fail-preview.pdf');
