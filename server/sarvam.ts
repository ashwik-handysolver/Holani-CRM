import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { SarvamAIClient } from 'sarvamai';
import { recordTokens } from './usage';

// Sarvam pipeline:
// 1. Saaras v4 batch speech-to-text (22 Indian languages, up to 2h audio, speaker diarization)
// 2. Sarvam-105B reads the transcript and returns the call analysis as JSON
// 3. Sarvam-105B translates transcript lines to English (in chunks)

const STT_MODEL = process.env.SARVAM_STT_MODEL || 'saaras:v4';
const CHAT_MODEL = process.env.SARVAM_CHAT_MODEL || 'sarvam-105b';
const MAX_TOKENS = Number(process.env.SARVAM_MAX_TOKENS) || 16384;
const REASONING = process.env.SARVAM_REASONING || 'low';
const TRANSLATE_CHUNK = 40;
const TIMEOUT_SECONDS = Number(process.env.SARVAM_TIMEOUT_SECONDS) || 300;

const LANGUAGE_NAMES: Record<string, string> = {
  'hi-IN': 'Hindi', 'bn-IN': 'Bengali', 'mr-IN': 'Marathi', 'gu-IN': 'Gujarati', 'pa-IN': 'Punjabi', 'ta-IN': 'Tamil',
  'te-IN': 'Telugu', 'kn-IN': 'Kannada', 'ml-IN': 'Malayalam', 'od-IN': 'Odia', 'as-IN': 'Assamese', 'ur-IN': 'Urdu',
  'en-IN': 'English', 'ne-IN': 'Nepali', 'mai-IN': 'Maithili', 'kok-IN': 'Konkani', 'sd-IN': 'Sindhi', 'ks-IN': 'Kashmiri',
  'doi-IN': 'Dogri', 'mni-IN': 'Manipuri', 'brx-IN': 'Bodo', 'sat-IN': 'Santali', 'sa-IN': 'Sanskrit',
};

function client() {
  const key = process.env.SARVAM_API_KEY;
  if (!key) throw Object.assign(new Error('SARVAM_API_KEY is not set. Add it to the .env file.'), { status: 500 });
  // The SDK gives up after 60s by default, but the 105B model often needs longer to analyse a full call.
  return new SarvamAIClient({ apiSubscriptionKey: key, timeoutInSeconds: TIMEOUT_SECONDS });
}

const EXT: Record<string, string> = {
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav',
  'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/ogg': 'ogg', 'audio/opus': 'opus',
  'audio/flac': 'flac', 'audio/amr': 'amr', 'audio/webm': 'webm', 'audio/x-ms-wma': 'wma', 'audio/aiff': 'aiff',
};

const mmss = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

interface Segment { speaker: string; start: number; text: string }

async function transcribe(sarvam: SarvamAIClient, audio: Buffer, mimeType: string, fileName: string, languageCode?: string) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'callsense-'));
  try {
    const ext = path.extname(fileName).slice(1) || EXT[mimeType] || 'mp3';
    const input = path.join(dir, `call.${ext}`);
    await fs.writeFile(input, audio);

    const job = await sarvam.speechToTextJob.createJob({
      model: STT_MODEL as any,
      mode: 'transcribe' as any,
      languageCode: (languageCode || 'unknown') as any,
      withDiarization: true,
      withTimestamps: true,
      numSpeakers: 2,
      keyterms: ['BLDC', 'ceiling fan', 'exhaust fan', 'pedestal fan', 'table fan', 'wall fan', 'dealer', 'distributor', 'invoice', 'GST'],
    });
    await job.uploadFiles([input]);
    await job.start();
    const status: any = await job.waitUntilComplete(3, 1800);
    if (status?.job_state === 'Failed') throw new Error(`Sarvam transcription failed: ${status?.error_message || 'unknown error'}`);

    const results = await job.getFileResults();
    if (!results.successful.length) {
      throw new Error(`Sarvam transcription failed: ${results.failed[0]?.error_message || 'no output'}`);
    }

    const outDir = path.join(dir, 'out');
    await fs.mkdir(outDir);
    await job.downloadOutputs(outDir);
    const file = (await fs.readdir(outDir)).find((f) => f.endsWith('.json'));
    if (!file) throw new Error('Sarvam returned no transcript file.');
    const out = JSON.parse(await fs.readFile(path.join(outDir, file), 'utf8'));

    const entries: any[] = out?.diarized_transcript?.entries || [];
    const segments: Segment[] = entries.length
      ? entries.map((e) => ({ speaker: String(e.speaker_id ?? '0'), start: Number(e.start_time_seconds) || 0, text: String(e.transcript || '').trim() }))
      : [{ speaker: '0', start: 0, text: String(out?.transcript || '').trim() }];

    return { segments: segments.filter((s) => s.text), language: out?.language_code as string | undefined };
  } finally {
    fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

const ANALYSIS_SHAPE = `{
  "speakers": [{ "id": string (exactly as in the transcript, e.g. "0"), "role": "Company" | "Caller", "name": string | null }],
  "callerName": string | null (the caller's name, never our staff),
  "companyName": string | null (the CALLER's shop/business name, never our own company),
  "city": string | null (the caller's city), "phone": string | null,
  "callerType": "Dealer" | "Distributor" | "Retailer" | "End Customer" | "Supplier" | "Other",
  "category": "New Order" | "Price Inquiry" | "Product Inquiry" | "Complaint" | "Service Request" | "Payment" | "Dealership Inquiry" | "Follow-up" | "Other",
  "language": string,
  "summary": string (English, 2-4 sentences),
  "keyPoints": string[] (English),
  "products": [{ "name": string, "quantity": string | null, "notes": string | null }],
  "orderValue": number | null (INR),
  "sentiment": "Positive" | "Neutral" | "Negative",
  "priority": "High" | "Medium" | "Low",
  "leadQuality": "Hot" | "Warm" | "Cold" | "Not a lead",
  "complaint": { "issue": string, "product": string | null, "severity": "High" | "Medium" | "Low" } | null,
  "actionItems": [{ "task": string (English), "owner": "Company" | "Caller", "dueDate": "YYYY-MM-DD" | null }]
}`;

const SYSTEM = `You analyse phone call transcripts for an Indian fan manufacturing company
(ceiling fans, BLDC fans, table/wall/pedestal fans, exhaust fans, fan parts and spares).
Callers are usually dealers, distributors, retailers, end customers or suppliers.
The transcript may be in any Indian language. Write all your output in English.
Only report facts stated in the call. Use null or empty lists when something is not mentioned. Never invent names, numbers or prices.
Decide which speaker id is our company staff ("Company") and which is the "Caller". Our staff usually greets with our company name;
that name is OUR company and must not be used as companyName. Return one "speakers" entry for every speaker id in the transcript.
Reply with a single JSON object only, in exactly this shape:
${ANALYSIS_SHAPE}`;

function parseJson(text: string) {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  return JSON.parse(cleaned.slice(start, end + 1));
}

let maxTokens = MAX_TOKENS;

const isTimeout = (err: any) => /timeout|timed out|aborted/i.test(`${err?.name} ${err?.message} ${err?.constructor?.name}`);

async function chatJson(sarvam: SarvamAIClient, system: string, user: string) {
  const send = () =>
    sarvam.chat.completions({
      model: CHAT_MODEL as any,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.2,
      max_tokens: maxTokens,
      // sarvam-105b reasons before answering, and reasoning counts toward max_tokens.
      reasoning_effort: REASONING,
      response_format: { type: 'json_object' } as any,
    } as any);

  let res: any;
  try {
    res = await send();
  } catch (err: any) {
    // Smaller plans cap max_tokens (Starter = 4096). Drop to that once and remember it.
    const text = JSON.stringify(err?.body || err?.message || '');
    if (maxTokens > 4096 && (err?.statusCode === 400 || err?.statusCode === 422) && /max_tokens|token/i.test(text)) {
      console.warn('[sarvam] plan rejected max_tokens', maxTokens, '- falling back to 4096');
      maxTokens = 4096;
      res = await send();
    } else if (isTimeout(err) || [429, 500, 502, 503, 504].includes(err?.statusCode)) {
      // Slow or busy: try once more before giving up.
      console.warn('[sarvam] chat request', isTimeout(err) ? 'timed out' : `failed (${err?.statusCode})`, '- retrying once');
      try {
        res = await send();
      } catch (again: any) {
        if (isTimeout(again)) throw new Error(`Sarvam took longer than ${TIMEOUT_SECONDS}s to analyse this call. Try again, or raise SARVAM_TIMEOUT_SECONDS in .env.`);
        throw again;
      }
    } else throw err;
  }
  recordTokens('sarvam', res?.usage?.total_tokens);
  const choice = res?.choices?.[0];
  const content = choice?.message?.content;
  if (!content) {
    throw new Error(
      choice?.finish_reason === 'length'
        ? 'Sarvam ran out of reply space for this call. Set SARVAM_MAX_TOKENS higher in .env if your plan allows.'
        : 'Sarvam returned an empty response. Please retry.',
    );
  }
  return parseJson(content);
}

async function translate(sarvam: SarvamAIClient, segments: Segment[]): Promise<string[]> {
  const chunks: Segment[][] = [];
  for (let i = 0; i < segments.length; i += TRANSLATE_CHUNK) chunks.push(segments.slice(i, i + TRANSLATE_CHUNK));
  const results: string[][] = [];
  // Two chunks at a time to stay within rate limits.
  for (let i = 0; i < chunks.length; i += 2) {
    const batch = await Promise.all(
      chunks.slice(i, i + 2).map(async (chunk) => {
        try {
          const out = await chatJson(
            sarvam,
            'Translate each line of a phone call into simple English. Keep names, numbers and product names. Reply with JSON only: {"english": string[]} with exactly one entry per input line, in the same order.',
            JSON.stringify(chunk.map((s) => s.text)),
          );
          const arr: string[] = Array.isArray(out?.english) ? out.english : [];
          return chunk.map((_, j) => String(arr[j] ?? ''));
        } catch {
          return chunk.map(() => '');
        }
      }),
    );
    results.push(...batch);
  }
  return results.flat();
}

export async function analyseWithSarvam(opts: {
  audioBase64: string;
  mimeType: string;
  fileName?: string;
  callDate: string;
  languageCode?: string;
  /** Checked between steps; when true the work stops early (the user cancelled). */
  isCancelled?: () => boolean;
}) {
  const stopIfCancelled = () => {
    if (opts.isCancelled?.()) throw Object.assign(new Error('Cancelled'), { code: 'CANCELLED' });
  };
  const sarvam = client();
  const { segments, language } = await transcribe(sarvam, Buffer.from(opts.audioBase64, 'base64'), opts.mimeType, opts.fileName || 'call', opts.languageCode);
  stopIfCancelled(); // skip the (paid) analysis and translation if the user cancelled during transcription
  if (!segments.length) throw new Error('No speech was detected in this recording.');

  const transcriptText = segments.map((s) => `[${mmss(s.start)}] Speaker ${s.speaker}: ${s.text}`).join('\n');
  const isEnglish = (language || opts.languageCode || '').startsWith('en');

  const [analysis, english] = await Promise.all([
    chatJson(sarvam, SYSTEM, `Call date: ${opts.callDate}. Detected language code: ${language || 'unknown'}.\n\nTranscript:\n${transcriptText}`),
    isEnglish ? Promise.resolve(segments.map(() => '')) : translate(sarvam, segments),
  ]);

  // Accept either [{id, role, name}] or {id: {role, name}}, and ids like "0", "Speaker 0", "SPEAKER_00".
  const norm = (id: unknown) => String(id ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  const raw = analysis.speakers;
  const entries: [string, { role?: string; name?: string | null }][] = Array.isArray(raw)
    ? raw.map((s: any) => [norm(s?.id), s])
    : Object.entries(raw || {}).map(([k, v]: [string, any]) => [norm(k), v]);
  const speakers = Object.fromEntries(entries);
  const ids = [...new Set(segments.map((s) => norm(s.speaker)))];
  // With two speakers and only one identified, the other one has the opposite role.
  if (ids.length === 2) {
    const [a, b] = ids;
    if (speakers[a] && !speakers[b]) speakers[b] = { role: speakers[a].role === 'Company' ? 'Caller' : 'Company', name: null };
    if (speakers[b] && !speakers[a]) speakers[a] = { role: speakers[b].role === 'Company' ? 'Caller' : 'Company', name: null };
  }
  const label = (rawId: string) => {
    const id = norm(rawId);
    const s = speakers[id];
    if (!s) return `Speaker ${Number(id) + 1}`;
    return s.name ? `${s.name} (${s.role === 'Company' ? 'Company' : 'Caller'})` : s.role === 'Company' ? 'Company' : 'Caller';
  };

  delete analysis.speakers;
  const langRaw = String(analysis.language || language || '');
  return {
    ...analysis,
    language: LANGUAGE_NAMES[langRaw] || LANGUAGE_NAMES[language || ''] || langRaw || 'Unknown',
    transcript: segments.map((s, i) => ({
      speaker: label(s.speaker),
      timestamp: mmss(s.start),
      text: s.text,
      english: english[i] || undefined,
    })),
  };
}
