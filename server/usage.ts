import fs from 'fs';
import path from 'path';

// Keeps a running count of AI tokens used, saved to data/usage.json so it survives restarts.
// Set SARVAM_TOKEN_LIMIT in .env to also show how many tokens are left.

type Provider = 'sarvam';
interface Usage {
  total: number;
  byProvider: Record<Provider, number>;
  since: string;
}

const FILE = path.join(process.cwd(), 'data', 'usage.json');

function load(): Usage {
  try {
    const u = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return { total: Number(u.total) || 0, byProvider: { sarvam: Number(u.byProvider?.sarvam) || 0 }, since: u.since || new Date().toISOString() };
  } catch {
    return { total: 0, byProvider: { sarvam: 0 }, since: new Date().toISOString() };
  }
}

let usage = load();

export function recordTokens(provider: Provider, tokens: unknown) {
  const n = Math.round(Number(tokens) || 0);
  if (n <= 0) return;
  usage.total += n;
  usage.byProvider[provider] = (usage.byProvider[provider] || 0) + n;
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(usage, null, 2));
  } catch (err) {
    console.warn('[usage] could not save token usage:', (err as Error).message);
  }
}

// Optional budget per AI in .env.
const LIMIT_ENV: Record<Provider, string> = { sarvam: 'SARVAM_TOKEN_LIMIT' };

export function getUsage() {
  const providers = (Object.keys(LIMIT_ENV) as Provider[]).map((key) => {
    const used = usage.byProvider[key] || 0;
    const limit = Number(process.env[LIMIT_ENV[key]]) || null;
    return { key, used, limit, left: limit == null ? null : Math.max(0, limit - used) };
  });
  return { used: providers.reduce((n, p) => n + p.used, 0), providers, since: usage.since };
}
