import { sendTelegram } from './notify.js';

function shortUrl(url) {
  return String(url || '')
    .replace(/^https?:\/\/(www\.)?/i, '')
    .replace(/[?].*$/, '');
}

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function clip(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > 160 ? `${value.slice(0, 157)}...` : value;
}

export function telegramCommand(text) {
  const value = String(text || '').trim();
  if (!value) return '';
  const command = (value.match(/^\/([a-zA-Z0-9_]+)(?:@\w+)?(?:\s|$)/) || [])[1] || '';
  if (/^status_local$/i.test(command) || /^status_local$/i.test(value) || value === 'STATUS_LOCAL') {
    return 'status_local';
  }
  if (/^(help|start)$/i.test(command) || /^(說明|幫助)$/.test(value)) return 'help';
  return '';
}

export function helpText(intervalSeconds) {
  return [
    'Beyblade local watcher 指令',
    '/status_local 或 STATUS_LOCAL — 查看本機各規則最近一次檢查',
    '/help — 顯示這段說明',
    `本地程式正在跑，約每 ${intervalSeconds} 秒檢查一次。回覆通常在數秒內。`,
    '試算表 GAS 仍用 /status。',
  ].join('\n');
}

export function buildStatusText(config, state) {
  const rules = (state.meta && state.meta.rules) || [];
  const staleAfterMs = Math.max(config.intervalSeconds * 3, 30) * 1000;
  const lines = [
    'Beyblade local watcher 運作狀況',
    `現在：${formatTime(Date.now())}`,
    `定時檢查：約每 ${config.intervalSeconds} 秒（本機 Node，規則平行抓取）`,
    '',
  ];
  const enabled = config.rules.filter((rule) => rule.enabled);
  if (!enabled.length) lines.push('沒有已啟用的規則。');
  enabled.forEach((rule) => {
    const saved = rules.find((item) => item.id === rule.id) || {};
    const lastMs = saved.lastChecked ? Date.parse(saved.lastChecked) : 0;
    const stale = lastMs && Date.now() - lastMs > staleAfterMs;
    lines.push(`${rule.platform} ${shortUrl(rule.url)}`);
    lines.push(`上次檢查：${formatTime(saved.lastChecked) || '尚未檢查'}${stale ? ' ⚠ 可能已停止' : ''}`);
    lines.push(clip(saved.summary) || '尚無狀態');
    lines.push('');
  });
  const disabled = config.rules.length - enabled.length;
  if (disabled > 0) lines.push(`另有 ${disabled} 條已停用。`);
  lines.push('在 Telegram 傳 /status_local 可再查一次。');
  return lines.join('\n').slice(0, 3900);
}

export async function ensureBotCommands(config, state) {
  if (!config.telegramToken || state.meta.commandsSet === 'status_local') return;
  await fetch(`https://api.telegram.org/bot${config.telegramToken}/setMyCommands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      commands: [
        { command: 'status_local', description: '查看本地 watcher 運作狀況' },
        { command: 'help', description: '可用指令' },
      ],
    }),
  }).catch(() => {});
  state.meta.commandsSet = 'status_local';
}

export async function pollTelegramCommands(config, state) {
  if (!config.telegramToken || !config.telegramChatId) return;
  await ensureBotCommands(config, state);
  const offset = state.meta.telegramOffset ? `&offset=${encodeURIComponent(state.meta.telegramOffset)}` : '';
  const response = await fetch(`https://api.telegram.org/bot${config.telegramToken}/getUpdates?timeout=0${offset}`);
  const json = await response.json().catch(() => ({}));
  if (!json.ok) return;
  let nextOffset = state.meta.telegramOffset;
  for (const update of json.result || []) {
    nextOffset = String(Number(update.update_id) + 1);
    const message = update.message || update.edited_message;
    if (!message || !message.chat || String(message.chat.id) !== String(config.telegramChatId)) continue;
    const command = telegramCommand(message.text);
    if (command === 'status_local') await sendTelegram(config, buildStatusText(config, state));
    else if (command === 'help') await sendTelegram(config, helpText(config.intervalSeconds));
  }
  if (nextOffset) state.meta.telegramOffset = nextOffset;
}
