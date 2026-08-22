# Beyblade watcher: Google Apps Script MVP

This trial uses a Google Sheet as its setup and diagnostic surface. Apps Script retrieves public HTTP responses, records connection diagnostics, and sends Telegram notifications. It does not bypass logins, CAPTCHAs, or website protections.

A **local Node watcher** lives in [local/](local/README.md). It runs the same shops asynchronously on your computer, with a configurable interval, and prints to the terminal plus Telegram. Use that if you want shorter intervals than Apps Script quotas allow.

## Setup

1. Create a Google Sheet. Choose **Extensions > Apps Script**.
2. Copy [Code.gs](Code.gs) into the default script file. In **Project Settings**, enable the `appsscript.json` manifest and copy [appsscript.json](appsscript.json) into it. Save and refresh the Sheet.
3. Use **Beyblade Watcher > Initialize sheets**.
4. In Telegram, use `@BotFather` to create a bot and obtain its token. Send `/start` to the new bot.
5. In Apps Script **Project Settings > Script Properties**, add `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`.
6. Run **Test Telegram notification**. Then select a watch row and run **Probe selected momo, Funbox, Amazon or MM rule**.

Do not run `onOpen` from the Apps Script editor. It is a simple trigger that runs when the **Google Sheet-bound** project opens. Create the project from the Sheet via **Extensions > Apps Script**, save the code, then reload the Sheet to see the Beyblade Watcher menu. To configure Telegram safely, add only `TELEGRAM_BOT_TOKEN` first, send `/start` to the bot, then use **Find Telegram chat ID** from that menu and add the displayed value as `TELEGRAM_CHAT_ID`.

## Repeating check (does not need the Sheet to stay open)

The install-menu items create a **time-driven Apps Script trigger**. Google runs it on their servers. Closing the spreadsheet, the browser, or the computer does **not** stop it.

Use **Install repeating 1-minute check** for the shortest interval Apps Script allows (1, 5, 10, 15, or 30 minutes). Timing is approximate; a 1-minute trigger can fire a little late.

To keep it running without gaps:

1. Leave the Google Sheet in Drive. Do not trash it or revoke Apps Script permission.
2. After installing, confirm **Apps Script > Triggers** shows `checkMomoProductRules` and **Executions** keeps getting new rows while the Sheet is closed. That same trigger now also checks Funbox shop and Amazon.co.jp rules.
3. A free Gmail account has about **90 minutes of trigger runtime per day**. One-minute checks can exhaust that budget; afterwards triggered runs are skipped until the quota resets, which is how restocks get missed. If Executions fail with a daily computer-time error, switch to **5 minutes**.

Start from **Beyblade Watcher** in the spreadsheet (1, 5, or 15 minutes). Stop from the same menu with **Stop repeating check**. You can also delete the trigger in Apps Script > Triggers. Closing the Sheet does not stop it.

## Telegram status

The bot can report whether momo and Funbox checks are still running. It does **not** reply instantly: Apps Script only reads Telegram during each repeating check (or when you send status from the Sheet).

1. Paste the updated `Code.gs`, save, and reload the Sheet.
2. Keep the repeating check installed.
3. In Telegram, send `/status` or `狀況`. Within one check interval you should get last-checked time and Status for each enabled rule. `/help` lists commands.
4. For an immediate snapshot, use **Beyblade Watcher > Send status to Telegram**.

A `⚠ 可能已停止` line means that rule has not been updated for about three check intervals. Confirm **Apps Script > Executions** if that appears.

The bot only answers the chat ID stored in `TELEGRAM_CHAT_ID`.

## momo: official funbox toys only

The monitor is limited to momo's brand-flagship path:

**funbox toys > 兒童玩具 > 戰鬥陀螺**

`https://www.momoshop.com.tw/categories/2186500036`

This is the official TAKARA TOMY / funbox listing, not the site-wide search. Site search mixes in third-party `TP` marketplace items and is not used.

On 2026-08-19 that official category showed `很抱歉，沒有篩選到符合條件的商品`. A full scan of the parent **兒童玩具** listing (`2186500015`, 668 official goods) also had no Beyblade titles in stock. The two known SKUs still have product pages, but they are out of stock, so momo hides them from the category:

- `https://www.momoshop.com.tw/product/15462752` — BEYBLADE X BX-00 暴風天馬3-70RA
- `https://www.momoshop.com.tw/product/15462751` — BEYBLADE X UX-20 榮耀武神LF

Those two remain on **Watch Rules** as product URLs so a restock can still be detected from the product page. The category row is what finds **new official IDs** you cannot know in advance: when funbox lists a matching in-stock item, Telegram is sent.

Keyword filters on the category row (`BEYBLADE,戰鬥陀螺,爆旋陀螺`) ignore unrelated toys if this category is reused. Exclude keywords drop storage cases and stadiums if they appear.

Then:

1. Select the category row and run **Probe selected momo or Funbox rule**. Expect `0 official goods listed` while the category is empty.
2. Run **Check all momo and Funbox rules now** once. An empty category stores an empty baseline; the next new in-stock listing can notify. Product-URL rows still use a quiet first check.
3. Run **Install repeating 5-minute check**. If daily quota is exhausted, stay on 5 minutes rather than 1.

## Funbox official shop

The official Funbox storefront is a separate site from momo:

**Funbox 直營 > 對戰‧競技 > 戰鬥陀螺**

`https://shop.funbox.com.tw/categories/XI/KB`

This is public Cyberbiz JSON (`/category_products/...json`), not a login or search page. On 2026-08-19 the parent category and its 戰鬥陀螺 collections (基本組 / 強化組 / 戰鬥組 / 配件組 / 一代限定組 / 二代APP專屬組, plus 配件 and 限定商品) all returned `[]`. That empty state is expected while Funbox is on lottery / not listing Beyblade for cart purchase. The watcher still seeds that empty listing so a later in-stock card can notify.

Add a **Watch Rules** row if this Sheet was already initialized:

| Enabled | Platform | Product or search URL | Include keywords |
| --- | --- | --- | --- |
| TRUE | Funbox | `https://shop.funbox.com.tw/categories/XI/KB` | `BEYBLADE,戰鬥陀螺,爆旋陀螺,BX-,UX-,CX-` |

Optional: paste a known Funbox product URL (`https://shop.funbox.com.tw/products/{handle}`) with Platform `Funbox` to watch one SKU the same way as a momo product page.

Select the Funbox row and run **Probe selected momo, Funbox, Amazon or MM rule**. Expect `0 official goods listed` while the shop is empty. Then run **Check all watch rules now** once so the empty baseline is stored. The existing repeating trigger also covers Funbox; you do not need a second trigger.

If a Funbox title omits `BEYBLADE` / `戰鬥陀螺`, clear **Include keywords** on that row. The XI/KB category is already Beyblade-only.

## Amazon.co.jp

Amazon Japan is watched as **sold by Amazon.co.jp** (merchant `AN1VRQENFRJN5`), not the whole marketplace. Site search still mixes puzzles and other toys, so include/exclude keywords matter.

Default search:

`https://www.amazon.co.jp/s?k=ベイブレードX&i=toys&rh=p_6:AN1VRQENFRJN5`

Add a **Watch Rules** row if this Sheet was already initialized:

| Enabled | Platform | Product or search URL | Include keywords | Exclude keywords |
| --- | --- | --- | --- | --- |
| TRUE | Amazon | the search URL above | `BEYBLADE,ベイブレード,BX-,UX-,CX-` | `中古,used,パズル,ジグソー,LEGO,レゴ,たまごっち` |

Optional: paste `https://www.amazon.co.jp/dp/{ASIN}` with Platform `Amazon` to watch one known product. Stock on a product page is only used when the public HTML has a clear add-to-cart or unavailable signal; a Taiwan/export buy box may parse as `UNKNOWN` and will not Telegram.

**Important:** Amazon often returns a robot-check page to Google Apps Script IPs. After pasting the new `Code.gs`, select the Amazon row and run **Probe selected momo, Funbox, Amazon or MM rule**. If Status says robot-check or blocked, leave that row disabled. Do not try to bypass Amazon protection.

If the probe succeeds, run **Check all watch rules now** once so current ASINs become the baseline; later matching in-stock results can notify. The existing repeating trigger also covers Amazon.

Amazon HTML is large. Stay on a **5-minute** interval rather than 1 minute.

## MM 小舖

MM 小舖 is a public BV Shop storefront. Watch the **戰鬥陀螺** category, not site-wide keyword search:

`https://mmtoyshop.com/category/🌀戰鬥陀螺`

Add a **Watch Rules** row if this Sheet was already initialized:

| Enabled | Platform | Product or search URL | Include keywords | Exclude keywords |
| --- | --- | --- | --- | --- |
| TRUE | MM | the category URL above | `BEYBLADE,戰鬥陀螺,爆旋陀螺,BX-,UX-,CX-` | `used,中古,收納,戰鬥盤,陀螺盤` |

Optional: paste `https://mmtoyshop.com/item/{handle}` with Platform `MM` to watch one product.

MM listings are usually pre-order. Do **not** exclude `預購` in the title, and do **not** put `不補` in Include keywords: that word is on the option name, not the title. The watcher only sums specs whose name contains **不補**, and ignores **客訂** options. A listing is in stock only when that 不補 quantity is **greater than 0** and the bottom button is not **補貨中**. Extra pages after page 1 are fetched in parallel.

**Cloudflare:** Apps Script may get HTTP 403. After pasting the new `Code.gs`, select the MM row and run **Probe selected momo, Funbox, Amazon or MM rule**. If Status says Cloudflare or blocked, leave that row disabled. Do not try to bypass the protection.

If the probe succeeds, run **Check all watch rules now** once. The existing repeating trigger also covers MM.

## Diagnosis outcome

- **Reachable with product-data signals**: evaluate a platform-specific parser next.
- **Reachable, but insufficient product signals**: the page may be JavaScript-rendered; use only a permitted data source.
- **Protected / request failed**: exclude it from GAS monitoring. The project will not attempt to circumvent protection.

## What is needed next

Provide public URLs only; platform credentials are not needed:

- One Shopee seller or product URL.
- Additional Eslite or Kingstone / Jin-Yu-Tang search or product URLs, if those shops should be added after momo, Funbox, and Amazon restock alerts are running.
