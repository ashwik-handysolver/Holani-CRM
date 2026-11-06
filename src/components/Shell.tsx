import React, { useEffect, useRef, useState } from 'react';
import { LayoutDashboard, PhoneCall, UploadCloud, ListChecks, Users, Package, AudioLines, Loader2, Moon, Sun, UserPlus, FolderSync } from 'lucide-react';
import { View } from '../types';
import { navigate } from '../lib/router';
import { useTheme } from '../lib/theme';
import { useStore } from '../store';
import { GlobalSearch } from './GlobalSearch';
import { HeaderActionsSlot } from './ui';
// import { UsageMeter } from './UsageMeter'; // hidden for now
import { UploadDialog, UploadRequest, openUpload } from './UploadDialog';
import { NewCustomerReview } from './NewFromRecording';

const NAV: { id: View; label: string; short: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: 'Dashboard', short: 'Home', icon: LayoutDashboard },
  { id: 'customers', label: 'Customers', short: 'Customers', icon: Users },
  { id: 'calls', label: 'Calls', short: 'Calls', icon: PhoneCall },
  { id: 'followups', label: 'Follow-ups', short: 'Tasks', icon: ListChecks },
  { id: 'products', label: 'Products & catalogue', short: 'Products', icon: Package },
  { id: 'drive', label: 'Google Drive', short: 'Drive', icon: FolderSync },
];

const TITLES: Record<View, string> = {
  dashboard: 'Overview',
  customers: 'Customers',
  calls: 'Calls',
  followups: 'Follow-ups',
  products: 'Products & catalogue',
  drive: 'Google Drive',
  upload: 'Uploads',
};
const DETAIL_TITLES: Partial<Record<View, string>> = { customers: 'Customer profile', calls: 'Call details' };

// Sidebar text: hidden while the sidebar is collapsed, fades in as it opens.
const REVEAL =
  'whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover/side:opacity-100 group-hover/side:delay-100 group-has-[:focus-visible]/side:opacity-100 motion-reduce:transition-none';

const LogoMark = () => (
  <div className="w-8 h-8 rounded-lg bg-amber-400 flex items-center justify-center shrink-0">
    <AudioLines className="w-[18px] h-[18px] text-slate-950" />
  </div>
);

export const Shell: React.FC<{ view: View; id?: string; children: React.ReactNode }> = ({ view, id, children }) => {
  const { calls, queue } = useStore();
  const { theme, toggle } = useTheme();
  const pendingTasks = calls.reduce((n, c) => n + c.actionItems.filter((a) => !a.done && a.owner === 'Company').length, 0);
  const active = queue.filter((q) => q.status === 'queued' || q.status === 'processing').length;
  const badge = (v: View) => (v === 'followups' && pendingTasks ? pendingTasks : v === 'upload' && active ? active : null);
  const title = (id && DETAIL_TITLES[view]) || TITLES[view];
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  // The upload pop-up can be opened from anywhere via openUpload().
  // Requests wait in line, so several Drive recordings arriving together are shown one after another.
  const [uploads, setUploads] = useState<UploadRequest[]>([]);
  const upload = uploads[0] || null;
  const closeUpload = () => setUploads((u) => u.slice(1));
  useEffect(() => {
    const onOpen = (e: Event) => setUploads((u) => [...u, (e as CustomEvent<UploadRequest>).detail || {}]);
    window.addEventListener('callsense:upload', onOpen);
    return () => window.removeEventListener('callsense:upload', onOpen);
  }, []);

  // "New customer" recordings: when the analysis finishes, open the pre-filled form once by itself.
  // If it's closed, it waits in the sidebar reminder (or the Uploads page) until reopened.
  const toReview = calls.filter((c) => c.needsCustomer);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const autoOpened = useRef(new Set<string>());
  useEffect(() => {
    if (reviewId || upload) return;
    const justFinished = queue.find((q) => q.newCustomer && q.status === 'done' && q.callId && !autoOpened.current.has(q.callId) && toReview.some((c) => c.id === q.callId));
    if (justFinished?.callId) {
      autoOpened.current.add(justFinished.callId);
      setReviewId(justFinished.callId);
    }
  }, [queue, toReview, reviewId, upload]);
  useEffect(() => {
    const onReview = (e: Event) => setReviewId((e as CustomEvent<{ id: string }>).detail?.id ?? null);
    window.addEventListener('callsense:review', onReview);
    return () => window.removeEventListener('callsense:review', onReview);
  }, []);
  const reviewItem = reviewId ? toReview.find((q) => q.id === reviewId) : undefined;

  return (
    <div className="min-h-screen flex bg-[var(--canvas)] text-slate-900">
      {/* Floating sidebar (desktop): icons only, slides open over the page on hover or keyboard focus. */}
      <div className="group/side hidden md:block shrink-0 m-3 mr-0 w-16 hover:w-60 has-[:focus-visible]:w-60 transition-[width] duration-300 ease-out motion-reduce:transition-none">
        <aside className="sticky top-3 z-40 h-[calc(100vh-1.5rem)] w-full flex flex-col overflow-hidden rounded-2xl bg-white border border-slate-200 shadow-sm group-hover/side:shadow-md py-3 px-3 transition-shadow duration-300">

          <a href="#/dashboard" className="flex items-center gap-2.5 px-1 py-1 mb-4 rounded-lg" aria-label="CallSense home">
            <LogoMark />
            <span className={`text-sm font-bold text-slate-900 ${REVEAL}`}>CallSense</span>
          </a>
          <nav className="space-y-1 flex-1">
            {NAV.map(({ id: v, label, icon: Icon }) => {
              const on = view === v;
              const b = badge(v);
              return (
                <a
                  key={v}
                  href={`#/${v}`}
                  aria-current={on ? 'page' : undefined}
                  aria-label={label}
                  title={label}
                  className={`relative flex items-center gap-3 h-10 px-3 rounded-lg text-[13px] font-medium transition-colors ${
                    on ? 'bg-amber-50 text-slate-900' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${on ? 'text-amber-600' : 'text-slate-400'}`} />
                  <span className={`flex-1 ${REVEAL}`}>{label}</span>
                  {b != null && (
                    <>
                      {/* Collapsed: a dot on the icon. Open: the count. */}
                      <span className="absolute left-6 top-2 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white transition-opacity duration-200 group-hover/side:opacity-0 group-has-[:focus-visible]/side:opacity-0" />
                      <span
                        className={`min-w-5 h-5 px-1.5 rounded-full text-[11px] font-semibold flex items-center justify-center ${REVEAL} ${
                          on ? 'bg-amber-400 text-slate-950' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {b}
                      </span>
                    </>
                  )}
                </a>
              );
            })}
          </nav>

          {toReview.length > 0 && (
            <button
              onClick={() => setReviewId(toReview[0].id)}
              title="Confirm new customer"
              className="mb-1 flex items-center gap-3 h-10 px-3 rounded-lg bg-emerald-50 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
            >
              <UserPlus className="w-4 h-4 shrink-0" />
              <span className={REVEAL}>
                {toReview.length} new customer{toReview.length > 1 ? 's' : ''} to confirm
              </span>
            </button>
          )}
          {active > 0 && (
            <button
              onClick={() => navigate('upload')}
              title="Uploads in progress"
              className="mb-1 flex items-center gap-3 h-10 px-3 rounded-lg bg-amber-50 text-xs font-medium text-amber-700"
            >
              <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
              <span className={REVEAL}>
                Analysing {active} recording{active > 1 ? 's' : ''}
              </span>
            </button>
          )}
          <div className={`px-3 py-2 text-[11px] text-slate-400 ${REVEAL}`}>{calls.length.toLocaleString('en-IN')} calls stored</div>
        </aside>
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Floating header: page title, search, theme */}
        <header className="sticky top-3 z-30 mx-3 sm:mx-6 mt-3 rounded-2xl border border-slate-200 bg-white/85 backdrop-blur shadow-sm px-3 sm:px-4 py-2.5">
          <div className="flex items-center gap-3">
            <a href="#/dashboard" className="md:hidden" aria-label="Home">
              <LogoMark />
            </a>
            <h1 className="text-base sm:text-lg font-semibold tracking-tight text-slate-900 truncate min-w-0 sm:shrink-0 sm:pr-3 sm:mr-1 sm:border-r sm:border-slate-200">{title}</h1>
            <div className="hidden sm:block flex-1 min-w-0 max-w-md">
              <GlobalSearch />
            </div>
            <div className="flex-1" />
            {/* Token meter hidden for now. To show it again, render <UsageMeter /> here. */}
            <div ref={setSlot} className="flex items-center gap-2 shrink-0 [&_button]:h-10 [&_button]:rounded-xl max-sm:[&_button>span]:sr-only" />
            {toReview.length > 0 && (
              <button
                onClick={() => setReviewId(toReview[0].id)}
                className="md:hidden flex items-center gap-1.5 text-xs font-medium text-emerald-600"
                aria-label={`${toReview.length} new customer${toReview.length > 1 ? 's' : ''} to confirm`}
              >
                <UserPlus className="w-4 h-4" /> {toReview.length}
              </button>
            )}
            {active > 0 && (
              <button onClick={() => navigate('upload')} className="md:hidden flex items-center gap-1.5 text-xs text-amber-600">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> {active}
              </button>
            )}
            <button
              onClick={() => openUpload({ customerId: view === 'customers' ? id : undefined })}
              className="h-10 shrink-0 inline-flex items-center gap-2 px-3 sm:px-4 rounded-xl bg-slate-900 text-white text-sm font-medium shadow-sm hover:bg-slate-800"
              aria-label="Upload a recording"
            >
              <UploadCloud className="w-4 h-4 text-amber-400" />
              <span className="max-sm:hidden">Upload</span>
            </button>
            <button
              onClick={toggle}
              className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100"
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
          <div className="sm:hidden mt-2.5">
            <GlobalSearch />
          </div>
        </header>

        <HeaderActionsSlot.Provider value={slot}>
        <main key={view} className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-8 py-6 pb-28 md:pb-10 view-enter">
          {children}
        </main>
        </HeaderActionsSlot.Provider>
        {upload && (
          <UploadDialog
            key={uploads.length + (upload.file?.name || '')}
            suggestId={upload.customerId}
            initialFile={upload.file}
            source={upload.source}
            onChosen={upload.onChosen}
            onClose={closeUpload}
          />
        )}
        {!upload && reviewItem && <NewCustomerReview key={reviewItem.id} call={reviewItem} onClose={() => setReviewId(null)} />}
      </div>

      {/* Mobile bottom nav (floating) */}
      <nav
        className="md:hidden fixed bottom-3 inset-x-3 z-30 rounded-2xl bg-white/90 backdrop-blur border border-slate-200 shadow-lg flex"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      >
        {NAV.map(({ id: v, short, icon: Icon }) => {
          const on = view === v;
          return (
            <a key={v} href={`#/${v}`} className={`flex-1 flex flex-col items-center gap-1 py-2 ${on ? 'text-slate-900' : 'text-slate-400'}`}>
              <Icon className={`w-5 h-5 ${on ? 'text-amber-500' : ''}`} />
              <span className={`text-[10px] ${on ? 'font-semibold' : 'font-medium'}`}>{short}</span>
            </a>
          );
        })}
      </nav>
    </div>
  );
};
