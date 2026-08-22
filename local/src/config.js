import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const text = line.trim();
    if (!text || text.startsWith('#')) continue;
    const index = text.indexOf('=');
    if (index < 0) continue;
    const key = text.slice(0, index).trim();
    let value = text.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index < 0 || index + 1 >= process.argv.length) return '';
  return process.argv[index + 1];
}

export function loadConfig() {
  loadEnvFile(join(root, '.env'));
  const rulesPath = join(root, 'watch.rules.json');
  const file = existsSync(rulesPath)
    ? JSON.parse(readFileSync(rulesPath, 'utf8'))
    : { intervalSeconds: 60, rules: [] };
  const cliInterval = Number(argValue('--interval'));
  const envInterval = Number(process.env.POLL_INTERVAL_SECONDS);
  const intervalSeconds = cliInterval > 0
    ? cliInterval
    : envInterval > 0
      ? envInterval
      : Number(file.intervalSeconds) || 60;
  return {
    root,
    once: process.argv.includes('--once'),
    intervalSeconds,
    notifyEveryInStock: file.notifyEveryInStock === true,
    telegramToken: process.env.TELEGRAM_BOT_TOKEN || '',
    telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
    rules: (file.rules || []).map((rule, index) => ({
      id: `${index + 1}`,
      enabled: rule.enabled !== false,
      platform: String(rule.platform || ''),
      url: String(rule.url || '').trim(),
      include: String(rule.include || ''),
      exclude: String(rule.exclude || ''),
      maxPrice: String(rule.maxPrice || ''),
    })),
  };
}
