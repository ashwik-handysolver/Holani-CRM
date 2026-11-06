// Turns Word, Excel and CSV files into something the viewer can show.
// The libraries are loaded only when such a file is opened.

export interface Sheet {
  name: string;
  rows: string[][];
  truncated: boolean;
}

const MAX_ROWS = 2000;

const ext = (name: string) => name.toLowerCase().split('.').pop() || '';

export type PreviewKind = 'pdf' | 'image' | 'text' | 'word' | 'sheet' | 'csv';

/** How a file can be shown inside the app, or null if it can't. */
export function previewKind(mime: string, name: string): PreviewKind | null {
  const e = ext(name);
  if (mime === 'application/pdf' || mime.startsWith('application/vnd.google-apps.')) return 'pdf'; // Google files arrive as PDF
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'text/csv' || e === 'csv') return 'csv';
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || e === 'docx') return 'word';
  if (mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || e === 'xlsx') return 'sheet';
  if (mime.startsWith('text/') || mime === 'application/json') return 'text';
  return null; // e.g. old .doc / .xls, which browsers can't read
}

/** Word (.docx) → simple HTML (headings, paragraphs, lists, tables, bold/italic). */
export async function wordToHtml(buf: ArrayBuffer): Promise<string> {
  const mammoth = await import('mammoth/mammoth.browser.js');
  const { value } = await mammoth.convertToHtml({ arrayBuffer: buf });
  return value;
}

/** Excel (.xlsx) → one table per sheet, as the cells display in Excel. */
export async function sheetToTables(buf: ArrayBuffer): Promise<Sheet[]> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb.worksheets.map((ws) => {
    const rows: string[][] = [];
    const width = ws.actualColumnCount || ws.columnCount;
    ws.eachRow({ includeEmpty: true }, (row, n) => {
      if (n > MAX_ROWS) return;
      rows.push(Array.from({ length: width }, (_, i) => row.getCell(i + 1).text ?? ''));
    });
    return { name: ws.name, rows, truncated: ws.rowCount > MAX_ROWS };
  });
}

/** CSV text → rows (handles quoted values with commas and line breaks). */
export function csvToRows(text: string): Sheet {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const delimiter = (text.split('\n')[0].match(/;/g)?.length || 0) > (text.split('\n')[0].match(/,/g)?.length || 0) ? ';' : ',';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) row.push(cell), (cell = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      if (rows.length > MAX_ROWS) break;
    } else cell += c;
  }
  if (cell || row.length) row.push(cell), rows.push(row);
  const truncated = rows.length > MAX_ROWS;
  return { name: 'Sheet', rows: rows.slice(0, MAX_ROWS), truncated };
}
