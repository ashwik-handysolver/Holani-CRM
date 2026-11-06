import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { analyseWithSarvam } from './server/sarvam';
import { getUsage } from './server/usage';
import { Readable } from 'stream';
import {
  download as driveDownload,
  downloadBuffer as driveDownloadBuffer,
  setStatus as setDriveStatus,
  startWatching,
  status as driveStatus,
  sync as driveSync,
} from './server/drive';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '150mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/api/usage', (_req, res) => res.json(getUsage()));

// The server also analyses one call at a time, even if requests arrive together
// (e.g. the app open in two tabs). Each request waits for the one before it.
let analysisChain: Promise<unknown> = Promise.resolve();
let waiting = 0;
const oneAtATime = <T,>(job: () => Promise<T>): Promise<T> => {
  waiting++;
  const run = analysisChain.then(job, job);
  analysisChain = run.catch(() => {}).finally(() => waiting--);
  return run;
};

// The app cancels by dropping the request; track that so the work can stop.
const watchCancel = (res: express.Response) => {
  let cancelled = false;
  res.on('close', () => {
    if (!res.writableEnded) cancelled = true;
  });
  return () => cancelled;
};

// Recording sent by the browser (manual upload, kept in browser storage; a Supabase bucket later).
app.post('/api/analyze-call', async (req, res) => {
  const { audioBase64, mimeType, fileName, callDate, languageCode } = req.body || {};
  if (!audioBase64 || !mimeType) return res.status(400).json({ error: 'audioBase64 and mimeType are required.' });
  const isCancelled = watchCancel(res);
  if (waiting > 0) console.log(`[analyze-call] queued behind ${waiting}: ${fileName || ''}`);
  return oneAtATime(() => analyse(res, isCancelled, async () => ({ audioBase64, mimeType }), { fileName, callDate, languageCode }));
});

// Recording that lives in Google Drive: the server fetches it from Drive itself (in its turn),
// so the audio never passes through the browser and isn't stored anywhere else.
app.post('/api/analyze-drive', async (req, res) => {
  const { fileId, callDate, languageCode } = req.body || {};
  if (!fileId) return res.status(400).json({ error: 'fileId is required.' });
  const isCancelled = watchCancel(res);
  const fileName = req.body?.fileName || fileId;
  if (waiting > 0) console.log(`[analyze-call] queued behind ${waiting}: ${fileName}`);
  return oneAtATime(() =>
    analyse(
      res,
      isCancelled,
      async () => {
        const { buffer, mimeType } = await driveDownloadBuffer(fileId);
        return { audioBase64: buffer.toString('base64'), mimeType };
      },
      { fileName, callDate, languageCode },
    ),
  );
});

async function analyse(
  res: express.Response,
  isCancelled: () => boolean,
  load: () => Promise<{ audioBase64: string; mimeType: string }>,
  { fileName, callDate, languageCode }: { fileName?: string; callDate?: string; languageCode?: string },
) {
  if (isCancelled()) {
    console.log(`[analyze-call] cancelled before starting: ${fileName || ''}`);
    return;
  }
  const started = Date.now();
  try {
    const { audioBase64, mimeType } = await load();
    const data = await analyseWithSarvam({
      audioBase64,
      mimeType,
      fileName,
      callDate: callDate || new Date().toISOString().slice(0, 10),
      languageCode,
      isCancelled,
    });
    console.log(`[analyze-call] ok in ${Math.round((Date.now() - started) / 1000)}s: ${fileName || ''}`);
    return res.json({ data });
  } catch (err: any) {
    if (err?.code === 'CANCELLED') {
      console.log(`[analyze-call] cancelled: ${fileName || ''}`);
      return;
    }
    console.error('[analyze-call] failed:', err?.body || err?.message || err);
    const msg = err?.body?.error?.message || err?.body?.message || err?.message || 'Analysis failed. Please try again.';
    const status = err?.status || err?.statusCode;
    return res.status(status && status < 600 ? status : 502).json({ error: msg });
  }
}

// ---------- Google Drive folder import ----------
app.get('/api/drive/status', (_req, res) => res.json(driveStatus()));
app.post('/api/drive/sync', async (_req, res) => {
  await driveSync();
  res.json(driveStatus());
});
// The app marks a file "imported" once it has taken it, or "pending" to import an older file.
app.post('/api/drive/files/:id/status', (req, res) => {
  const s = req.body?.status;
  if (s !== 'imported' && s !== 'pending' && s !== 'removed') return res.status(400).json({ error: 'status must be imported, pending or removed' });
  return setDriveStatus(req.params.id, s) ? res.json({ ok: true }) : res.status(404).json({ error: 'Unknown file' });
});
// Streams a file from Drive. Range requests are passed through so the audio player can seek.
app.get('/api/drive/files/:id/content', async (req, res) => {
  try {
    const { res: file, name, mimeType } = await driveDownload(req.params.id, req.headers.range);
    res.status(file.status === 206 ? 206 : 200);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(name)}`);
    res.setHeader('Accept-Ranges', 'bytes');
    for (const h of ['content-length', 'content-range']) {
      const v = file.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    if (!file.body) return res.end();
    Readable.fromWeb(file.body as any)
      .on('error', () => res.destroy())
      .pipe(res);
  } catch (err: any) {
    res.status(err?.status && err.status < 600 ? err.status : 502).json({ error: err?.message || 'Could not download the file from Google Drive.' });
  }
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const dist = path.join(process.cwd(), 'dist');
    app.use(express.static(dist));
    app.get('*all', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.listen(PORT, '0.0.0.0', () => console.log(`CallSense running on http://localhost:${PORT}`));
  startWatching();
}

start();
