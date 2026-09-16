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

While it is running, Telegram `/status_local` or `STATUS_LOCAL` returns last-checked time for the local watcher. `/status` is for the Sheet GAS watcher. `/help` lists commands. The bot menu should show both `status` and `status_local`. Replies are usually within a couple of seconds. Both programs share `getUpdates` on the same bot; if a command seems ignored, only one of them may have consumed it.

## Notify policy

By default Telegram only fires on **new**, **restock**, or when quantity has dropped by **30** since the last alert. That baseline is stored per SKU in `data/state.json` (`notifyQuantity`); high-frequency polls that drop 1–2 units do not reset it. It does **not** alert every cycle while still in stock. Set `"notifyEveryInStock": true` in `watch.rules.json` only if you want the old every-cycle behaviour. Every check still prints a one-line summary in the terminal.

State is stored in `data/state.json` (gitignored). Closing the terminal with Ctrl+C saves state and exits. Shutting the PC down without Ctrl+C just kills the process; it does **not** keep running. Start `node src/index.js` again after boot. Sudden power-off during a write falls back to `state.json.bak`.

## momo

The default momo category URL is still `https://www.momoshop.com.tw/categories/2186500036`. That rule also scans toy-mall **人氣IP > 戰鬥陀螺** (`2701200114`) and **戰鬥陀螺★限量發售** (`2701202072`), then keeps only Funbox 品牌旗艦店 goods (`enterpriseNo` `006093`). `品牌名稱` is TAKARA TOMY on resellers too, so it is not used. `has3P` stays off. Listed items with quantity 0 are out of stock, and Telegram is not sent when quantity is `<= 0`.

## MM 小舖

Only `#不補` specs are counted. `客訂` is ignored. In stock means 不補 quantity **> 0** and the button is not **補貨中**.
