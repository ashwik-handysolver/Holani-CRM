import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Watches one Google Drive folder and lists new files for the app to import.
//
// Setup (.env):
//   GOOGLE_SERVICE_ACCOUNT_FILE=./google-service-account.json   (key file of a Google Cloud service account)
//   GOOGLE_DRIVE_FOLDER_ID=<the id from the folder's URL>
//   DRIVE_POLL_SECONDS=60                                         (optional)
// Then share the Drive folder with the service account's email address (Viewer is enough).
//
// Files already in the folder when it's first connected are listed as "existing" and are not imported
// automatically; only files added afterwards are.

// 'removed' = deleted in the app; kept so the file isn't imported again while it's still in Drive.
type FileStatus = 'existing' | 'pending' | 'imported' | 'removed';
export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
  createdTime: string;
  kind: 'recording' | 'document' | 'other';
  status: FileStatus;
  importedAt?: string;
}
interface State {
  folderId: string | null;
  files: Record<string, DriveFile>;
}

const STATE_FILE = path.join(process.cwd(), 'data', 'drive.json');
const API = 'https://www.googleapis.com/drive/v3';

let state: State = load();
let lastSync: string | null = null;
let lastError: string | null = null;
let syncing = false;

function load(): State {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return { folderId: s.folderId ?? null, files: s.files || {} };
  } catch {
    return { folderId: null, files: {} };
  }
}
function save() {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    console.warn('[drive] could not save state:', (err as Error).message);
  }
}

const kindOf = (mime: string, name: string): DriveFile['kind'] => {
  if (mime.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|amr|opus|webm)$/i.test(name)) return 'recording';
  if (
    mime.startsWith('application/vnd.google-apps.document') ||
    mime.startsWith('application/vnd.google-apps.spreadsheet') ||
    mime.startsWith('application/vnd.google-apps.presentation') ||
    /pdf|msword|officedocument|text\/|rtf|opendocument/.test(mime)
  )
    return 'document';
  return 'other';
};

// ---------- Auth: service account → access token (signed JWT, no extra packages) ----------

interface Key {
  client_email: string;
  private_key: string;
}
let key: Key | null = null;
let token: { value: string; expires: number } | null = null;

function readKey(): Key {
  const file = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
  if (!file) throw new Error('GOOGLE_SERVICE_ACCOUNT_FILE is not set in .env.');
  if (!key) {
    const k = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), file), 'utf8'));
    if (!k.client_email || !k.private_key) throw new Error('The service account file is missing client_email or private_key.');
    key = { client_email: k.client_email, private_key: k.private_key };
  }
  return key;
}

async function accessToken() {
  if (token && token.expires > Date.now() + 60_000) return token.value;
  const k = readKey();
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: k.client_email,
    // Read-only: the app only lists, streams and analyses files in the folder; it never changes Drive.
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(k.private_key).toString('base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google sign-in failed: ${json.error_description || json.error || res.status}`);
  token = { value: json.access_token, expires: Date.now() + (json.expires_in || 3600) * 1000 };
  return token.value;
}

async function drive(pathAndQuery: string, init: RequestInit = {}) {
  const res = await fetch(pathAndQuery.startsWith('http') ? pathAndQuery : `${API}${pathAndQuery}`, {
    ...init,
    headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${await accessToken()}` },
  });
  if (!res.ok && res.status !== 206) {
    const json: any = await res.json().catch(() => ({}));
    const reason = json?.error?.errors?.[0]?.reason;
    throw Object.assign(new Error(json?.error?.message || `Google Drive request failed (${res.status})`), { status: res.status, reason });
  }
  return res;
}

// ---------- Sync ----------

export const isConfigured = () => !!(process.env.GOOGLE_SERVICE_ACCOUNT_FILE && process.env.GOOGLE_DRIVE_FOLDER_ID);

export async function sync() {
  if (!isConfigured() || syncing) return;
  syncing = true;
  try {
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID!;
    const firstRun = state.folderId !== folderId;
    if (firstRun) state = { folderId, files: {} };

    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`);
    const fields = encodeURIComponent('nextPageToken, files(id, name, mimeType, size, createdTime)');
    let pageToken = '';
    const inFolder = new Set<string>();
    do {
      const res = await drive(`/files?q=${q}&fields=${fields}&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true${pageToken ? `&pageToken=${pageToken}` : ''}`);
      const json: any = await res.json();
      for (const f of json.files || []) {
        inFolder.add(f.id);
        if (state.files[f.id]) continue;
        state.files[f.id] = {
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          size: f.size ? Number(f.size) : null,
          createdTime: f.createdTime,
          kind: kindOf(f.mimeType, f.name),
          // On the first connection, don't flood the app with everything already in the folder.
          status: firstRun ? 'existing' : 'pending',
        };
      }
      pageToken = json.nextPageToken || '';
    } while (pageToken);

    // Files deleted (or moved out) of the Drive folder disappear from the app too.
    for (const id of Object.keys(state.files)) if (!inFolder.has(id)) delete state.files[id];

    save();
    lastError = null;
  } catch (err) {
    lastError = (err as Error).message;
    console.warn('[drive] sync failed:', lastError);
  } finally {
    lastSync = new Date().toISOString();
    syncing = false;
  }
}

export function startWatching() {
  if (!isConfigured()) return;
  const every = Math.max(15, Number(process.env.DRIVE_POLL_SECONDS) || 60) * 1000;
  sync();
  setInterval(sync, every);
  console.log(`[drive] watching folder ${process.env.GOOGLE_DRIVE_FOLDER_ID} every ${every / 1000}s`);
}

export function status() {
  let serviceEmail: string | null = null;
  try {
    serviceEmail = isConfigured() ? readKey().client_email : null;
  } catch (err) {
    lastError ||= (err as Error).message;
  }
  return {
    configured: isConfigured(),
    folderId: process.env.GOOGLE_DRIVE_FOLDER_ID || null,
    serviceEmail,
    lastSync,
    error: lastError,
    files: Object.values(state.files)
      .filter((f) => f.status !== 'removed')
      .sort((a, b) => b.createdTime.localeCompare(a.createdTime)),
  };
}

export function setStatus(id: string, s: FileStatus) {
  const f = state.files[id];
  if (!f) return false;
  f.status = s;
  if (s === 'imported') f.importedAt = new Date().toISOString();
  save();
  return true;
}

// Name and type of a file. Uses the folder list when possible, otherwise asks Drive
// (e.g. a call's recording that was imported before the app last restarted).
async function fileInfo(id: string) {
  const known = state.files[id];
  if (known) return { name: known.name, mimeType: known.mimeType };
  const res = await drive(`/files/${encodeURIComponent(id)}?fields=name,mimeType,parents,trashed&supportsAllDrives=true`);
  const f: any = await res.json();
  if (f.trashed || !(f.parents || []).includes(process.env.GOOGLE_DRIVE_FOLDER_ID)) throw Object.assign(new Error('This file is no longer in the Google Drive folder.'), { status: 404 });
  return { name: f.name as string, mimeType: f.mimeType as string };
}

/**
 * Fetch a file's content from Drive. Google Docs/Sheets/Slides have no file to download, so they're
 * exported as PDF. `range` is passed through so audio can be streamed and seeked without downloading it all.
 */
export async function download(id: string, range?: string) {
  const info = await fileInfo(id);
  const native = info.mimeType.startsWith('application/vnd.google-apps.');
  const res = native
    ? await drive(`/files/${encodeURIComponent(id)}/export?mimeType=application/pdf`)
    : await drive(`/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`, range ? { headers: { Range: range } } : {});
  return { res, name: native ? `${info.name}.pdf` : info.name, mimeType: native ? 'application/pdf' : info.mimeType };
}

/** The whole file, e.g. to send a recording to Sarvam for analysis. */
export async function downloadBuffer(id: string) {
  const { res, name, mimeType } = await download(id);
  return { buffer: Buffer.from(await res.arrayBuffer()), name, mimeType };
}

