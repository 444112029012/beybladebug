import { stamp } from './util.js';

export function log(message) {
  console.log(`[${stamp()}] ${message}`);
}

export async function sendTelegram(config, text) {
  if (!config.telegramToken || !config.telegramChatId) {
    return { ok: false, message: 'Telegram not configured' };
  }
  const response = await fetch(`https://api.telegram.org/bot${config.telegramToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: config.telegramChatId,
      text,
      disable_web_page_preview: false,
    }),
  });
  const json = await response.json().catch(() => ({}));
  return json.ok ? { ok: true } : { ok: false, message: json.description || `HTTP ${response.status}` };
}

export async function notify(config, text) {
  log(text.replace(/\n/g, ' | '));
  const result = await sendTelegram(config, text);
  if (!result.ok && result.message !== 'Telegram not configured') {
    log(`Telegram failed: ${result.message}`);
  }
  return result;
}
