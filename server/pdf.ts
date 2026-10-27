import PDFDocument from 'pdfkit';
import { BRAND } from '../lib/brand';

export interface PdfSection {
  title: string;
  paragraphs?: string[];
  lines?: string[];
  table?: { columns: string[]; rows: string[][] };
}

export interface PdfInput {
  title: string;
  organizationName: string;
  reference?: string;
  subtitle?: string;
  preparedBy?: string;
  generatedAt?: string;
  body?: string;
  sections?: PdfSection[];
  footerNote?: string;
}

const NAVY = '#0B1F3A';
const GOLD = '#C3912A';
const MUTED = '#5B6778';

function safe(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

export async function buildPdf(input: PdfInput): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 54, bufferPages: true, info: { Title: input.title, Author: input.organizationName } });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  doc.rect(0, 0, doc.page.width, 12).fill(NAVY);
  doc.moveDown(1.2);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(GOLD).text(input.organizationName.toUpperCase(), { characterSpacing: 0.6 });
  doc.moveDown(0.15);
  doc.font('Helvetica').fontSize(8).fillColor(MUTED).text('OFFICIAL RECORD • SRC SECRETARIAT PRO');
  doc.moveDown(1);
  doc.font('Helvetica-Bold').fontSize(19).fillColor(NAVY).text(input.title, { lineGap: 3 });
  if (input.subtitle) {
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(input.subtitle);
  }
  const metadata = [
    input.reference ? `Reference: ${input.reference}` : '',
    input.preparedBy ? `Prepared by: ${input.preparedBy}` : '',
    `Issued: ${input.generatedAt || new Date().toISOString().slice(0, 10)}`,
  ].filter(Boolean);
  if (metadata.length) {
    doc.moveDown(0.45);
    doc.fontSize(8.5).fillColor(MUTED).text(metadata.join('   |   '));
  }
  doc.moveDown(0.8);
  doc.moveTo(54, doc.y).lineTo(doc.page.width - 54, doc.y).strokeColor('#D9E0EA').lineWidth(1).stroke();
  doc.moveDown(0.9);

  if (input.body) {
    doc.font('Helvetica').fontSize(10.5).fillColor('#1B2638').text(input.body, { lineGap: 3, align: 'left' });
    doc.moveDown(0.8);
  }

  const tableWidth = doc.page.width - 108;

  for (const section of input.sections || []) {
    if (doc.y > doc.page.height - 130) doc.addPage();
    doc.font('Helvetica-Bold').fontSize(12).fillColor(NAVY).text(section.title);
    doc.moveDown(0.35);
    for (const paragraph of section.paragraphs || []) {
      doc.font('Helvetica').fontSize(10).fillColor('#1B2638').text(paragraph, { lineGap: 2 });
      doc.moveDown(0.35);
    }
    for (const line of section.lines || []) {
      if (doc.y > doc.page.height - 90) doc.addPage();
      doc.font('Helvetica').fontSize(9.5).fillColor('#1B2638').text(`•  ${line}`, { lineGap: 2, indent: 6 });
    }
    if (section.lines?.length) doc.moveDown(0.35);

    if (section.table?.columns.length) {
      const columns = section.table.columns;
      const columnWidth = tableWidth / columns.length;
      const drawHeader = () => {
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#FFFFFF');
        let x = 54;
        const y = doc.y;
        doc.rect(54, y, tableWidth, 20).fill(NAVY);
        columns.forEach((column, index) => {
          doc.text(column.toUpperCase(), x + 5, y + 6, { width: columnWidth - 10, height: 12, ellipsis: true });
          x += columnWidth;
        });
        doc.y = y + 22;
      };
      drawHeader();
      section.table.rows.forEach((row, rowIndex) => {
        const estimatedHeight = Math.max(20, ...row.map((cell) => Math.ceil(safe(cell).length / Math.max(18, columnWidth / 5)) * 11));
        if (doc.y + estimatedHeight > doc.page.height - 75) {
          doc.addPage();
          drawHeader();
        }
        const y = doc.y;
        if (rowIndex % 2 === 0) doc.rect(54, y, tableWidth, estimatedHeight).fill('#F4F6FA');
        let x = 54;
        doc.font('Helvetica').fontSize(8.5).fillColor('#1B2638');
        columns.forEach((_, index) => {
          doc.text(safe(row[index] || ''), x + 5, y + 5, { width: columnWidth - 10, height: estimatedHeight - 8, ellipsis: true });
          x += columnWidth;
        });
        doc.y = y + estimatedHeight;
      });
      doc.moveDown(0.7);
    }
  }

  if (input.footerNote) {
    doc.moveDown(0.6);
    doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(MUTED).text(input.footerNote, { lineGap: 2 });
  }

  const range = doc.bufferedPageRange();
  for (let page = range.start; page < range.start + range.count; page += 1) {
    doc.switchToPage(page);
    doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(
      `${BRAND.shortName} Secretariat  •  Page ${page - range.start + 1} of ${range.count}`,
      54,
      doc.page.height - 45,
      { align: 'center', width: doc.page.width - 108, lineBreak: false },
    );
  }

  doc.end();
  return done;
}

export function pdfResponse(buffer: Buffer, filename: string): Response {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]+/g, '_');
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${safeName}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export function rowsToTable(
  columns: Array<{ key: string; label: string }>,
  records: Array<Record<string, string | number | null>>,
): { columns: string[]; rows: string[][] } {
  return {
    columns: columns.map((column) => column.label),
    rows: records.map((record) => columns.map((column) => safe(record[column.key]))),
  };
}
