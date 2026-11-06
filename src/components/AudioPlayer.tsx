import React, { useEffect, useRef, useState } from 'react';
import { Download, Loader2, Pause, Play, RotateCcw, RotateCw, VolumeX } from 'lucide-react';
import { db } from '../lib/db';

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
const SPEED_KEY = 'callsense-speed';

const fmt = (s: number) => {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

const savedSpeed = () => {
  try {
    const v = Number(localStorage.getItem(SPEED_KEY));
    return SPEEDS.includes(v) ? v : 1;
  } catch {
    return 1;
  }
};

/** Player for a call's saved recording, with seek, ±10s skip and playback speed. */
export const AudioPlayer: React.FC<{ callId: string; driveFileId?: string; fileName?: string; autoPlay?: boolean; compact?: boolean }> = ({
  callId,
  driveFileId,
  fileName,
  autoPlay,
  compact,
}) => {
  const audio = useRef<HTMLAudioElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'gone'>('loading');
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [speed, setSpeed] = useState(savedSpeed);

  useEffect(() => {
    // Recordings in Google Drive are streamed from there (with seeking); nothing is stored in the browser.
    if (driveFileId) {
      setUrl(`/api/drive/files/${encodeURIComponent(driveFileId)}/content`);
      setState('ready');
      return;
    }
    let objectUrl: string | null = null;
    db.audio
      .get(callId)
      .then((rec) => {
        if (!rec) return setState('missing');
        objectUrl = URL.createObjectURL(rec.blob);
        setUrl(objectUrl);
        setState('ready');
      })
      .catch(() => setState('missing'));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [callId, driveFileId]);

  // Transcript timestamps ask the player to jump to a moment.
  useEffect(() => {
    const onSeek = (e: Event) => {
      const { callId: target, seconds } = (e as CustomEvent<{ callId: string; seconds: number }>).detail || {};
      const a = audio.current;
      if (target !== callId || !a) return;
      a.currentTime = seconds;
      a.play().catch(() => {});
    };
    window.addEventListener('callsense:seek', onSeek);
    return () => window.removeEventListener('callsense:seek', onSeek);
  }, [callId]);

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = speed;
    try {
      localStorage.setItem(SPEED_KEY, String(speed));
    } catch {}
  }, [speed, url]);

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  };
  const skip = (s: number) => {
    const a = audio.current;
    if (a) a.currentTime = Math.min(Math.max(0, a.currentTime + s), dur || a.duration || 0);
  };

  if (state === 'missing' || state === 'gone') {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-200 px-4 py-3 text-xs text-slate-500">
        <VolumeX className="w-4 h-4 text-slate-400 shrink-0" />
        {state === 'gone'
          ? 'This recording is no longer in the Google Drive folder (or Drive can’t be reached), so it can’t be played. The analysis is still here.'
          : 'Audio isn’t available for this call. Recordings uploaded before audio saving was added can’t be played.'}
      </div>
    );
  }

  const pct = dur ? (time / dur) * 100 : 0;

  return (
    <div className={`rounded-xl border border-slate-200 bg-white ${compact ? 'p-3' : 'p-4'}`} onClick={(e) => e.stopPropagation()}>
      {url && (
        <audio
          ref={audio}
          src={url}
          preload="metadata"
          autoPlay={autoPlay}
          onLoadedMetadata={(e) => {
            setDur(e.currentTarget.duration);
            e.currentTarget.playbackRate = speed;
          }}
          onError={() => driveFileId && setState('gone')}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
        />
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={toggle}
          disabled={state !== 'ready'}
          className="w-11 h-11 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center shrink-0 shadow-sm hover:bg-amber-300 transition-colors disabled:opacity-60"
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {state === 'loading' ? <Loader2 className="w-5 h-5 animate-spin" /> : playing ? <Pause className="w-5 h-5" fill="currentColor" /> : <Play className="w-5 h-5 ml-0.5" fill="currentColor" />}
        </button>

        <div className="flex-1 min-w-0">
          {/* Seek bar */}
          <div className="relative h-5 flex items-center group">
            <div className="absolute inset-x-0 h-1.5 rounded-full bg-slate-100" />
            <div className="absolute left-0 h-1.5 rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
            <div
              className="absolute w-3.5 h-3.5 rounded-full bg-white border-2 border-amber-400 shadow -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ left: `${pct}%` }}
            />
            <input
              type="range"
              min={0}
              max={dur || 0}
              step={0.1}
              value={time}
              onChange={(e) => {
                const t = Number(e.target.value);
                if (audio.current) audio.current.currentTime = t;
                setTime(t);
              }}
              aria-label="Seek"
              className="absolute inset-0 w-full opacity-0 cursor-pointer"
            />
          </div>
          <div className="flex justify-between text-[11px] tabular-nums text-slate-400">
            <span>{fmt(time)}</span>
            <span>{fmt(dur)}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
        <div className="flex items-center gap-1">
          <button onClick={() => skip(-10)} className="h-8 px-2 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 inline-flex items-center gap-1" aria-label="Back 10 seconds">
            <RotateCcw className="w-3.5 h-3.5" /> 10s
          </button>
          <button onClick={() => skip(10)} className="h-8 px-2 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 inline-flex items-center gap-1" aria-label="Forward 10 seconds">
            10s <RotateCw className="w-3.5 h-3.5" />
          </button>
          {url && !compact && (
            <a href={url} download={fileName || 'recording'} className="h-8 px-2 rounded-lg text-slate-500 hover:bg-slate-100 inline-flex items-center" aria-label="Download recording" title="Download">
              <Download className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
        <div className="inline-flex rounded-lg bg-slate-100 p-0.5" role="group" aria-label="Playback speed">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              aria-pressed={speed === s}
              className={`px-2 h-7 rounded-md text-[11px] font-semibold tabular-nums transition-colors ${speed === s ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
