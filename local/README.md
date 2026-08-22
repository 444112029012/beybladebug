# Local watcher

Node 18+ CLI that checks the same public momo / Funbox / Amazon / MM pages as `Code.gs`. Rules run **in parallel**. Extra listing pages also fetch in parallel. Messages go to the terminal and Telegram.

This is a local HTTP client with a normal browser User-Agent. It does **not** solve CAPTCHAs or bypass Cloudflare. If a shop returns 403 / a challenge page, that rule is logged as blocked.

## Setup

1. Copy `env.example` to `.env` in this folder. Paste `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` when you have them (same bot as the Sheet is fine).
2. Edit `watch.rules.json`: enable rules, URLs, include/exclude keywords, `intervalSeconds`.
3. From `local/`:

```powershell
copy env.example .env
node src/index.js --once
node src/index.js
node src/index.js --interval 30
```

`--interval` is seconds and overrides `.env` `POLL_INTERVAL_SECONDS` and `watch.rules.json`.

While it is running, Telegram `/status_local` or `STATUS_LOCAL` returns last-checked time and a one-line summary per rule. `/help` lists commands. Replies are usually within a couple of seconds. The Sheet watcher still uses `/status`. If both use the same bot, they still share `getUpdates`; prefer one process polling Telegram, or you may miss a command.

## Notify policy

By default Telegram (and the highlighted stock line) only fires on **new** or **restock**. Set `"notifyEveryInStock": true` in `watch.rules.json` to match the Sheet behaviour (alert every cycle while still in stock). Every check still prints a one-line summary in the terminal.

State is stored in `data/state.json` (gitignored).

## MM 小舖

Only `#不補` specs are counted. `客訂` is ignored. In stock means 不補 quantity **> 0** and the button is not **補貨中**.
