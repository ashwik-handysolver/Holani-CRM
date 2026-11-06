import React, { useEffect, useRef } from 'react';
import { navigate } from '../lib/router';
import { toast } from './Toast';
import { openUpload } from './UploadDialog';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
  createdTime: string;
  kind: 'recording' | 'document' | 'other';
  status: 'existing' | 'pending' | 'imported';
  importedAt?: string;
}
export interface DriveStatus {
  configured: boolean;
  folderId: string | null;
  serviceEmail: string | null;
  lastSync: string | null;
  error: string | null;
  files: DriveFile[];
}

const POLL_MS = 20000;

export const fetchDriveStatus = async (): Promise<DriveStatus | null> => {
  const r = await fetch('/api/drive/status').catch(() => null);
  return r?.ok ? r.json() : null;
};
export const setDriveFileStatus = (id: string, status: 'imported' | 'pending' | 'removed') =>
  fetch(`/api/drive/files/${encodeURIComponent(id)}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });

/**
 * Runs in the background: picks up files that appeared in the Google Drive folder,
 * shows a toast, and for recordings opens the upload pop-up so the user picks a new or existing customer.
 */
export const DriveWatcher: React.FC = () => {
  const busy = useRef(new Set<string>());
  // Recordings already shown in the pop-up this session. If the pop-up is closed without
  // choosing, they wait in the Google Drive tab instead of popping up again every 20 seconds.
  const asked = useRef(new Set<string>());

  useEffect(() => {
    let alive = true;

    const importFile = async (f: DriveFile) => {
      busy.current.add(f.id);
      try {
        if (f.kind === 'recording') {
          asked.current.add(f.id);
          toast({ tone: 'success', title: 'New recording from Google Drive', message: f.name });
          // Same choice as a manual upload: new customer, or add to an existing one.
          // Only a reference is passed on: the server fetches the audio from Drive when it analyses it.
          openUpload({
            file: { id: f.id, name: f.name, mimeType: f.mimeType, size: f.size },
            source: 'Google Drive',
            onChosen: () => {
              setDriveFileStatus(f.id, 'imported').then(() => window.dispatchEvent(new Event('callsense:drive')));
            },
          });
        } else {
          await setDriveFileStatus(f.id, 'imported');
          toast({
            tone: 'document',
            title: 'New document from Google Drive',
            message: f.name,
            action: { label: 'View document', onClick: () => navigate(`drive?open=${encodeURIComponent(f.id)}`) },
          });
        }
        window.dispatchEvent(new Event('callsense:drive'));
      } catch (err) {
        asked.current.delete(f.id);
        toast({ tone: 'error', title: 'Couldn’t import from Google Drive', message: `${f.name}: ${(err as Error).message}` });
      } finally {
        busy.current.delete(f.id);
      }
    };

    const check = async () => {
      const s = await fetchDriveStatus();
      if (!alive || !s?.configured) return;
      for (const f of s.files) if (f.status === 'pending' && !busy.current.has(f.id) && !asked.current.has(f.id)) await importFile(f);
    };

    // "Choose customer" in the Google Drive tab: show a waiting recording's pop-up again.
    const askAgain = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      if (id) asked.current.delete(id);
      check();
    };

    check();
    const t = setInterval(check, POLL_MS);
    window.addEventListener('callsense:drive-check', check);
    window.addEventListener('callsense:drive-ask', askAgain);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener('callsense:drive-check', check);
      window.removeEventListener('callsense:drive-ask', askAgain);
    };
  }, []);

  return null;
};
