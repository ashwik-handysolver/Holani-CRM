import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, FileText, Loader2, X } from 'lucide-react';
import { Sheet, csvToRows, previewKind, sheetToTables, wordToHtml } from '../lib/docPreview';

interface Doc {
  id: string;
  name: string;
  mimeType: string;
}

/** Spreadsheet view with a tab per sheet. The first row is treated as the header. */
const SheetView: React.FC<{ sheets: Sheet[] }> = ({ sheets }) => {
  const [i, setI] = useState(0);
  const sheet = sheets[i];
  if (!sheet) return <div className="p-6 text-sm text-slate-500">This spreadsheet is empty.</div>;
  const [head, ...body] = sheet.rows.length ? sheet.rows : [[]];
  return (
    <div className="h-full flex flex-col bg-white">
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="min-w-full text-sm border-separate border-spacing-0">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="sticky left-0 z-20 w-10 px-2 py-2 bg-slate-100 border-b border-r border-slate-200 text-[11px] font-medium text-slate-400" />
              {head.map((h, c) => (
                <th key={c} className="px-3 py-2 bg-slate-100 border-b border-r border-slate-200 text-left font-semibold text-slate-800 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((r, n) => (
              <tr key={n} className="hover:bg-amber-50/50">
                <td className="sticky left-0 bg-slate-50 px-2 py-1.5 border-b border-r border-slate-200 text-[11px] text-slate-400 text-right tabular-nums">{n + 2}</td>
                {head.map((_, c) => (
                  <td key={c} className="px-3 py-1.5 border-b border-r border-slate-100 text-slate-700 whitespace-nowrap max-w-[24rem] truncate" title={r[c]}>
                    {r[c]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {sheet.truncated && <p className="p-3 text-xs text-slate-500">Showing the first 2,000 rows. Download the file to see everything.</p>}
      </div>
      {sheets.length > 1 && (
        <div className="flex gap-1 overflow-x-auto border-t border-slate-200 bg-slate-50 px-2 py-1.5 shrink-0" role="tablist" aria-label="Sheets">
          {sheets.map((s, n) => (
            <button
              key={s.name + n}
              role="tab"
              aria-selected={n === i}
              onClick={() => setI(n)}
              className={`px-3 h-7 rounded-md text-xs font-medium whitespace-nowrap ${n === i ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-900'}`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/** Full-screen viewer for a Google Drive document, inside the app. */
export const DocumentViewer: React.FC<{ doc: Doc; onClose: () => void }> = ({ doc, onClose }) => {
  const src = `/api/drive/files/${encodeURIComponent(doc.id)}/content`;
  const kind = previewKind(doc.mimeType, doc.name);
  const [text, setText] = useState<string | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [loaded, setLoaded] = useState(kind === null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // PDFs and images load in their own element; everything else is fetched and converted here.
  useEffect(() => {
    if (kind === 'pdf' || kind === 'image' || kind === null) return;
    let alive = true;
    (async () => {
      try {
        const r = await fetch(src);
        if (!r.ok) throw new Error('Could not load the document.');
        if (kind === 'text') {
          const t = await r.text();
          if (alive) setText(t);
        } else if (kind === 'csv') {
          const s = csvToRows(await r.text());
          if (alive) setSheets([s]);
        } else if (kind === 'word') {
          const h = await wordToHtml(await r.arrayBuffer());
          if (alive) setHtml(h);
        } else if (kind === 'sheet') {
          const s = await sheetToTables(await r.arrayBuffer());
          if (alive) setSheets(s);
        }
      } catch (e) {
        if (alive) setError(`Couldn’t open this file here (${(e as Error).message}). You can download it instead.`);
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [src, kind]);

  // Rendered at the top of the page so nothing (like the sticky header) can sit above it.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-6" role="dialog" aria-modal="true" aria-label={doc.name}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex flex-col w-full h-full sm:h-[90vh] sm:max-w-5xl bg-white sm:rounded-2xl border border-slate-200 shadow-2xl overflow-hidden view-enter">
        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 h-14 border-b border-slate-200 shrink-0">
          <FileText className="w-5 h-5 text-sky-500 shrink-0" />
          <div className="min-w-0 flex-1 text-sm font-semibold text-slate-900 truncate">{doc.name}</div>
          <a
            href={`${src}?download=1`}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          >
            <Download className="w-4 h-4" /> <span className="max-sm:sr-only">Download</span>
          </a>
          <button onClick={onClose} className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Document */}
        <div className="relative flex-1 min-h-0 bg-slate-100">
          {!loaded && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading document…
            </div>
          )}
          {error && <div className="p-6 text-sm text-rose-600">{error}</div>}

          {kind === 'pdf' && <iframe src={src} title={doc.name} className="w-full h-full border-0 bg-white" onLoad={() => setLoaded(true)} />}
          {kind === 'image' && (
            <div className="w-full h-full overflow-auto flex items-center justify-center p-4">
              <img src={src} alt={doc.name} className="max-w-full max-h-full object-contain rounded-lg shadow" onLoad={() => setLoaded(true)} onError={() => (setError('Could not load the image.'), setLoaded(true))} />
            </div>
          )}
          {kind === 'text' && text != null && <pre className="w-full h-full overflow-auto p-5 bg-white text-sm text-slate-800 whitespace-pre-wrap font-mono">{text}</pre>}
          {(kind === 'csv' || kind === 'sheet') && sheets && <SheetView sheets={sheets} />}
          {kind === 'word' && html != null && (
            <div className="w-full h-full overflow-auto py-6 px-3 sm:px-6">
              {/* mammoth builds this HTML itself from the document's text, escaping it, so it contains no scripts. */}
              <article className="doc-page mx-auto max-w-3xl bg-white rounded-lg shadow-sm border border-slate-200 px-6 sm:px-12 py-10" dangerouslySetInnerHTML={{ __html: html || '<p>This document is empty.</p>' }} />
            </div>
          )}

          {kind === null && (
            <div className="h-full flex flex-col items-center justify-center text-center px-6">
              <FileText className="w-10 h-10 text-slate-300 mb-3" />
              <div className="text-sm font-semibold text-slate-900">This file type can’t be previewed here</div>
              <p className="text-sm text-slate-500 mt-1 max-w-sm">
                Old-format .doc and .xls files can’t be shown in the app. Save them as .docx or .xlsx (or open them in Google Drive as Docs/Sheets) and they’ll preview here.
              </p>
              <a href={`${src}?download=1`} className="mt-4 inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium">
                <Download className="w-4 h-4 text-amber-400" /> Download instead
              </a>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};
