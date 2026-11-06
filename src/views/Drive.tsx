import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Copy, ExternalLink, Eye, FileAudio, FileText, File as FileIcon, FolderOpen, Loader2, RefreshCw } from 'lucide-react';
import { DocumentViewer } from '../components/DocumentViewer';
import { Badge, Button, Card, CardHeader } from '../components/ui';
import { DriveFile, DriveStatus, fetchDriveStatus, setDriveFileStatus } from '../components/DriveWatcher';
import { fileSize, relative } from '../lib/format';

const KIND_ICON = { recording: FileAudio, document: FileText, other: FileIcon };

const Step: React.FC<{ n: number; title: string; children: React.ReactNode }> = ({ n, title, children }) => (
  <li className="flex gap-3">
    <span className="w-6 h-6 rounded-full bg-amber-400 text-slate-950 text-xs font-semibold flex items-center justify-center shrink-0">{n}</span>
    <div className="min-w-0 pb-1">
      <div className="text-sm font-medium text-slate-900">{title}</div>
      <div className="text-sm text-slate-500 mt-0.5 leading-relaxed">{children}</div>
    </div>
  </li>
);

const Code: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <code className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 text-[12px] font-mono break-all">{children}</code>
);

const Setup: React.FC = () => (
  <Card className="p-5 sm:p-6">
    <div className="flex items-center gap-3 mb-5">
      <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
        <FolderOpen className="w-5 h-5 text-amber-600" />
      </div>
      <div>
        <h2 className="text-base font-semibold text-slate-900">Connect a Google Drive folder</h2>
        <p className="text-sm text-slate-500">Recordings and documents you add to the folder are imported automatically.</p>
      </div>
    </div>
    <ol className="space-y-4">
      <Step n={1} title="Create a service account">
        In{' '}
        <a href="https://console.cloud.google.com/iam-admin/serviceaccounts" target="_blank" rel="noreferrer" className="text-amber-600 underline">
          Google Cloud Console
        </a>
        , create a project (or pick one), turn on the <b>Google Drive API</b>, then create a service account. Under its <b>Keys</b> tab, add a JSON key and download it.
      </Step>
      <Step n={2} title="Put the key file in this project">
        Save it in the project folder, for example as <Code>google-service-account.json</Code>. Keep it private: it’s like a password.
      </Step>
      <Step n={3} title="Share your Drive folder with it">
        Open the folder in Google Drive → <b>Share</b> → add the service account’s email (it ends in <Code>.iam.gserviceaccount.com</Code>) as a <b>Viewer</b>.
      </Step>
      <Step n={4} title="Add two lines to .env and restart">
        The folder ID is the last part of the folder’s address: drive.google.com/drive/folders/<b>THIS_PART</b>
        <pre className="mt-2 p-3 rounded-lg bg-slate-900 text-slate-100 text-[12px] font-mono overflow-x-auto">
          {'GOOGLE_SERVICE_ACCOUNT_FILE=./google-service-account.json\nGOOGLE_DRIVE_FOLDER_ID=your-folder-id'}
        </pre>
        Then restart the server (<Code>npm run dev</Code>).
      </Step>
    </ol>
  </Card>
);

export const Drive: React.FC<{ openId?: string }> = ({ openId }) => {
  const [s, setS] = useState<DriveStatus | null>(null);
  const [viewing, setViewing] = useState<DriveFile | null>(null);
  // Opened from a toast: show that document straight away.
  useEffect(() => {
    const f = openId && s?.files.find((x) => x.id === openId);
    if (f) setViewing(f);
  }, [openId, s]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => fetchDriveStatus().then((d) => (setS(d), setLoading(false))), []);
  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    window.addEventListener('callsense:drive', load);
    return () => {
      clearInterval(t);
      window.removeEventListener('callsense:drive', load);
    };
  }, [load]);

  const syncNow = async () => {
    setSyncing(true);
    await fetch('/api/drive/sync', { method: 'POST' }).catch(() => {});
    await load();
    window.dispatchEvent(new Event('callsense:drive-check'));
    setSyncing(false);
  };


  const importOld = async (f: DriveFile) => {
    await setDriveFileStatus(f.id, 'pending');
    await load();
    window.dispatchEvent(new Event('callsense:drive-check'));
  };

  if (loading) return null;
  if (!s) {
    return (
      <Card className="p-5 flex gap-3 text-sm text-slate-600">
        <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
        Couldn’t reach the server’s Google Drive service. Restart the server (npm run dev) and refresh.
      </Card>
    );
  }
  if (!s.configured) return <Setup />;

  const recordings = s.files.filter((f) => f.kind === 'recording').length;
  const documents = s.files.filter((f) => f.kind === 'document').length;

  return (
    <div className="space-y-6">
      {/* Connection */}
      <Card className="p-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${s.error ? 'bg-rose-50' : 'bg-emerald-50'}`}>
              {s.error ? <AlertCircle className="w-5 h-5 text-rose-600" /> : <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900">{s.error ? 'Can’t read the folder' : 'Watching your Google Drive folder'}</div>
              <div className="text-xs text-slate-500 truncate">
                {s.error ? s.error : `${recordings} recording${recordings === 1 ? '' : 's'} · ${documents} document${documents === 1 ? '' : 's'} · checked ${s.lastSync ? relative(s.lastSync) : 'not yet'}`}
              </div>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <a
              href={`https://drive.google.com/drive/folders/${s.folderId}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium text-slate-700 border border-slate-200 bg-white hover:bg-slate-50"
            >
              <ExternalLink className="w-4 h-4" /> Open folder
            </a>
            <Button variant="primary" icon={syncing ? Loader2 : RefreshCw} onClick={syncNow} disabled={syncing} className={syncing ? '[&_svg]:animate-spin' : ''}>
              Check now
            </Button>
          </div>
        </div>
        {s.error && s.serviceEmail && (
          <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-600 flex flex-wrap items-center gap-2">
            Make sure the folder is shared with
            <Code>{s.serviceEmail}</Code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(s.serviceEmail!);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="inline-flex items-center gap-1 font-medium text-amber-600"
            >
              <Copy className="w-3.5 h-3.5" /> {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        )}
      </Card>

      {/* Files */}
      <Card>
        <CardHeader title="Files in the folder" />
        {s.files.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-slate-500">The folder is empty. Add a recording or document to Google Drive and it will show up here within a minute.</p>
        ) : (
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {s.files.map((f) => {
              const Icon = KIND_ICON[f.kind];
              return (
                <li key={f.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-slate-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-900 truncate">{f.name}</div>
                    <div className="text-xs text-slate-400">
                      Added {relative(f.createdTime)}
                      {f.size ? ` · ${fileSize(f.size)}` : ''}
                    </div>
                  </div>
                  {f.status === 'imported' && <Badge tone="green">Imported</Badge>}
                  {f.status === 'pending' && f.kind !== 'recording' && <Badge tone="amber">Importing…</Badge>}
                  {f.status === 'pending' && f.kind === 'recording' && (
                    <Button
                      variant="primary"
                      className="!px-2.5 !py-1.5 text-xs"
                      onClick={() => window.dispatchEvent(new CustomEvent('callsense:drive-ask', { detail: { id: f.id } }))}
                    >
                      Choose customer
                    </Button>
                  )}
                  {f.status === 'existing' && f.kind === 'recording' && (
                    <Button variant="secondary" className="!px-2.5 !py-1.5 text-xs" onClick={() => importOld(f)}>
                      Import
                    </Button>
                  )}
                  {f.kind !== 'recording' && (
                    <Button variant="secondary" icon={Eye} className="!px-2.5 !py-1.5 text-xs" onClick={() => setViewing(f)} aria-label={`View ${f.name}`}>
                      View
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {viewing && <DocumentViewer doc={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
};
