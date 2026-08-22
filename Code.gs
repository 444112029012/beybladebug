/**
 * Beyblade product watcher MVP for Google Apps Script.
 * Script Properties required for Telegram: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID.
 */

const SHEETS = {
  RULES: 'Watch Rules',
  DIAGNOSTICS: 'Diagnostics',
  PRODUCTS: 'Products',
};

const PRODUCT_HEADERS = [
  'First seen', 'Last checked', 'Platform', 'Product name', 'Product URL', 'Price',
  'Stock state', 'Quantity', 'Hash',
];

const RULE_HEADERS = [
  'Enabled', 'Platform', 'Product or search URL', 'Include keywords', 'Exclude keywords',
  'Maximum price', 'Notify when', 'Last checked', 'Status', 'Notes',
];

const MOMO_FETCH_HEADERS = {
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
};

const MOMO_CATEGORY_API = 'https://www.momoshop.com.tw/api/moecapp/getCategoryGoodsV3';
const MOMO_CATEGORY_MAX_PAGES = 5;
const MOMO_FUNBOX_BEYBLADE = {
  url: 'https://www.momoshop.com.tw/categories/2186500036',
  cateCode: '2186500036',
  cateLevel: '3',
  path: 'funbox toys > 兒童玩具 > 戰鬥陀螺',
};

const FUNBOX_SHOP_ORIGIN = 'https://shop.funbox.com.tw';
const FUNBOX_CATEGORIES_JSON = FUNBOX_SHOP_ORIGIN + '/categories.json';
const FUNBOX_CATEGORY_LIMIT = 48;
const FUNBOX_CATEGORY_MAX_PAGES = 3;
const FUNBOX_JSON_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'X-Requested-With': 'XMLHttpRequest',
  Referer: FUNBOX_SHOP_ORIGIN + '/',
};
const FUNBOX_BEYBLADE = {
  url: FUNBOX_SHOP_ORIGIN + '/categories/XI/KB',
  path: 'XI/KB',
  name: 'Funbox 直營 > 對戰‧競技 > 戰鬥陀螺',
  collections: ['XIKBXA', 'XIKBXB', 'XIKBXC', 'XIKBXD', 'XIKBXP', 'XIKBBB', 'XIKBAA', 'XIKBCC', 'XIKBCD', 'KB2X'],
};

const MM_ORIGIN = 'https://mmtoyshop.com';
const MM_CATEGORY_MAX_PAGES = 5;
const MM_JSON_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'X-Requested-With': 'XMLHttpRequest',
  Referer: MM_ORIGIN + '/',
  'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
};
const MM_BEYBLADE = {
  url: MM_ORIGIN + '/category/' + encodeURIComponent('🌀戰鬥陀螺'),
  slug: '🌀戰鬥陀螺',
  name: 'MM 小舖 > 🌀 戰鬥陀螺',
};

const AMAZON_ORIGIN = 'https://www.amazon.co.jp';
const AMAZON_SEARCH_MAX_PAGES = 2;
const AMAZON_FETCH_HEADERS = {
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'ja-JP,ja;q=0.9,en;q=0.8',
  Cookie: 'i18n-prefs=JPY; lc-acbjp=ja_JP',
};
const AMAZON_BEYBLADE_SEARCH = {
  url: AMAZON_ORIGIN + '/s?k=%E3%83%99%E3%82%A4%E3%83%96%E3%83%AC%E3%83%BC%E3%83%89X&i=toys&rh=p_6%3AAN1VRQENFRJN5',
  name: 'Amazon.co.jp おもちゃ > ベイブレードX（Amazon.co.jpが販売）',
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Beyblade Watcher')
    .addItem('Initialize sheets', 'setupSpreadsheet')
    .addSeparator()
    .addItem('Test Telegram notification', 'testTelegramConnection')
    .addItem('Send status to Telegram', 'sendWatchStatusToTelegram')
    .addItem('Find Telegram chat ID', 'findTelegramChatId')
    .addItem('Diagnose selected rule URL', 'diagnoseSelectedRule')
    .addItem('Probe selected momo, Funbox, Amazon or MM rule', 'probeSelectedMomoProduct')
    .addItem('Check all watch rules now', 'checkMomoProductRules')
    .addItem('Install repeating 1-minute check', 'installMomoTrigger1Min')
    .addItem('Install repeating 5-minute check', 'installMomoTrigger5Min')
    .addItem('Install repeating 15-minute check', 'installMomoTrigger15Min')
    .addItem('Stop repeating check', 'removeMomoTrigger')
    .addItem('Probe selected Eslite search rule', 'probeSelectedEsliteSearch')
    .addToUi();
}

function setupSpreadsheet() {
  const ss = SpreadsheetApp.getActive();
  const rules = getOrCreateSheet_(ss, SHEETS.RULES, RULE_HEADERS);
  getOrCreateSheet_(ss, SHEETS.DIAGNOSTICS,
    ['Checked at', 'Platform', 'URL', 'HTTP status', 'Content-Type', 'Response bytes', 'Product signals', 'Summary']);
  getOrCreateSheet_(ss, SHEETS.PRODUCTS, PRODUCT_HEADERS);
  ensureProductsSheet_(ss);

  if (rules.getLastRow() === 1) {
    rules.appendRow([
      true, 'Momo', MOMO_FUNBOX_BEYBLADE.url,
      'BEYBLADE,戰鬥陀螺,爆旋陀螺', 'used,中古,收納,戰鬥盤,陀螺盤', '', 'New or in stock', '', 'Pending probe',
      'Official funbox toys > 兒童玩具 > 戰鬥陀螺. Discovers new listings without knowing product IDs.',
    ]);
    rules.appendRow([
      true, 'Momo',
      'https://www.momoshop.com.tw/product/15462752?ctype=B&sourcePageType=4',
      'BEYBLADE,戰鬥陀螺', 'used,中古', '', 'In stock', '', 'Pending probe',
      'Known official SKU that can stay on a product page after the category hides it.',
    ]);
    rules.appendRow([
      true, 'Momo',
      'https://www.momoshop.com.tw/product/15462751?ctype=B&sourcePageType=4',
      'BEYBLADE,戰鬥陀螺', 'used,中古', '', 'In stock', '', 'Pending probe', '',
    ]);
    rules.appendRow([
      true, 'Funbox', FUNBOX_BEYBLADE.url,
      'BEYBLADE,戰鬥陀螺,爆旋陀螺,BX-,UX-,CX-', 'used,中古', '', 'New or in stock', '', 'Pending probe',
      'Official shop.funbox.com.tw 戰鬥陀螺 category. Discovers new listings without knowing product handles.',
    ]);
    rules.appendRow([
      true, 'Amazon', AMAZON_BEYBLADE_SEARCH.url,
      'BEYBLADE,ベイブレード,BX-,UX-,CX-', '中古,used,パズル,ジグソー,LEGO,レゴ,たまごっち', '', 'New or in stock', '', 'Pending probe',
      'Amazon.co.jp sold-by-Amazon search for ベイブレードX. Discovers new ASINs; first probe may fail if Amazon returns a robot check to Apps Script.',
    ]);
    rules.appendRow([
      true, 'MM', MM_BEYBLADE.url,
      'BEYBLADE,戰鬥陀螺,爆旋陀螺,BX-,UX-,CX-', 'used,中古,收納,戰鬥盤,陀螺盤', '', 'New or in stock', '', 'Pending probe',
      'mmtoyshop.com 戰鬥陀螺 category. Watch #不補 specs only, ignore 客訂. In stock if 不補 quantity > 0 and the button is not 補貨中. Probe may fail if Cloudflare blocks Apps Script.',
    ]);
  }
  rules.setFrozenRows(1);
  SpreadsheetApp.getUi().alert(
    'Setup complete. Rows watch momo, Funbox 直營, Amazon.co.jp, and MM 小舖. '
    + 'If this Sheet was already initialized, add an MM row yourself: Platform MM, URL '
    + MM_BEYBLADE.url
  );
}

function testTelegramConnection() {
  const result = sendTelegram_('Beyblade watcher test succeeded. Google Apps Script can send notifications.');
  SpreadsheetApp.getUi().alert(result.ok ? 'Telegram test message sent.' : `Telegram test failed: ${result.message}`);
}

function sendWatchStatusToTelegram() {
  const result = sendTelegram_(buildWatchStatusText_());
  SpreadsheetApp.getUi().alert(result.ok ? 'Status sent to Telegram.' : `Telegram status failed: ${result.message}`);
}

function pollTelegramCommands_() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('TELEGRAM_BOT_TOKEN');
  const expectedChatId = String(props.getProperty('TELEGRAM_CHAT_ID') || '');
  if (!token || !expectedChatId) return;
  ensureTelegramBotCommands_(token);
  const offset = props.getProperty('TELEGRAM_UPDATE_OFFSET') || '';
  const url = `https://api.telegram.org/bot${token}/getUpdates?timeout=0${offset ? `&offset=${encodeURIComponent(offset)}` : ''}`;
  const response = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true });
  const json = JSON.parse(response.getContentText() || '{}');
  if (!json.ok) return;
  let nextOffset = offset;
  (json.result || []).forEach((update) => {
    nextOffset = String(Number(update.update_id) + 1);
    const message = update.message || update.edited_message;
    if (!message || !message.chat || String(message.chat.id) !== expectedChatId) return;
    const command = telegramCommand_(message.text);
    if (command === 'status') sendTelegram_(buildWatchStatusText_());
    else if (command === 'help') sendTelegram_(telegramHelpText_());
  });
  if (nextOffset) props.setProperty('TELEGRAM_UPDATE_OFFSET', nextOffset);
}

function ensureTelegramBotCommands_(token) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('TELEGRAM_COMMANDS_SET') === '4') return;
  UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      commands: [
        { command: 'status', description: '查看試算表 GAS 運作狀況' },
        { command: 'status_local', description: '查看本地 watcher 運作狀況' },
        { command: 'help', description: '可用指令' },
      ],
    }),
    muteHttpExceptions: true,
  });
  props.setProperty('TELEGRAM_COMMANDS_SET', '4');
}

function telegramCommand_(text) {
  const value = String(text || '').trim();
  if (!value) return '';
  const command = firstMatch_(value, /^\/([a-zA-Z]+)(?:@\w+)?(?:\s|$)/);
  if (/^status$/i.test(command) || /^(狀況|運作狀況|status)$/i.test(value)) return 'status';
  if (/^(help|start)$/i.test(command) || /^(說明|幫助)$/.test(value)) return 'help';
  return '';
}

function telegramHelpText_() {
  return [
    'Beyblade watcher 指令',
    '/status 或「狀況」— 查看 momo / Funbox / Amazon / MM 最近檢查是否有在跑',
    '/help — 顯示這段說明',
    '補貨與新品仍會自動推播。機器人只在每次定時檢查時讀取訊息，回覆最多會晚一個檢查間隔。',
    '若要立刻看到狀況，也可在試算表用 Beyblade Watcher > Send status to Telegram。',
  ].join('\n');
}

function buildWatchStatusText_() {
  const now = formatWatchTime_(new Date());
  const trigger = describeWatchTrigger_();
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.RULES);
  const lines = [
    `Beyblade watcher 運作狀況`,
    `現在：${now}`,
    trigger,
    '',
  ];
  if (!sheet || sheet.getLastRow() < 2) {
    lines.push('Watch Rules 沒有可檢查的列。');
    return lines.join('\n').slice(0, 3900);
  }
  const rules = sheet.getRange(2, 1, sheet.getLastRow() - 1, RULE_HEADERS.length).getValues()
    .map((values, index) => ruleFromRow_(index + 2, values))
    .filter((rule) => /momo|funbox|amazon/i.test(rule.platform) || isMmPlatform_(rule.platform));
  const enabled = rules.filter((rule) => rule.enabled);
  const staleAfterMs = watchStaleAfterMs_();
  if (!enabled.length) {
    lines.push('沒有已啟用的 momo / Funbox / Amazon / MM 規則。');
  }
  enabled.forEach((rule) => {
    const lastMs = watchLastCheckedMs_(rule.lastChecked);
    const stale = lastMs && staleAfterMs && (Date.now() - lastMs > staleAfterMs);
    lines.push(`${rule.platform || 'Unknown'} ${shortWatchUrl_(rule.url)}`);
    lines.push(`上次檢查：${formatWatchTime_(rule.lastChecked) || '尚未檢查'}${stale ? ' ⚠ 可能已停止' : ''}`);
    lines.push(clipWatchStatus_(rule.status) || '尚無狀態');
    lines.push('');
  });
  const disabled = rules.length - enabled.length;
  if (disabled > 0) lines.push(`另有 ${disabled} 列已停用。`);
  lines.push('在 Telegram 傳 /status 可再查一次；回覆會等到下一次定時檢查。');
  return lines.join('\n').slice(0, 3900);
}

function describeWatchTrigger_() {
  const installed = ScriptApp.getProjectTriggers()
    .some((trigger) => trigger.getHandlerFunction() === 'checkMomoProductRules');
  if (!installed) return '定時檢查：未安裝。請用選單 Install repeating check。';
  const minutes = PropertiesService.getScriptProperties().getProperty('WATCH_TRIGGER_MINUTES');
  return minutes
    ? `定時檢查：約每 ${minutes} 分鐘（checkMomoProductRules，含 momo、Funbox、Amazon 與 MM 小舖）`
    : '定時檢查：已安裝（checkMomoProductRules，含 momo、Funbox、Amazon 與 MM 小舖）';
}

function watchStaleAfterMs_() {
  const minutes = Number(PropertiesService.getScriptProperties().getProperty('WATCH_TRIGGER_MINUTES'));
  const windowMin = minutes ? minutes * 3 : 20;
  return windowMin * 60 * 1000;
}

function watchLastCheckedMs_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return value.getTime();
  if (value) {
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) return parsed.getTime();
  }
  return 0;
}

function formatWatchTime_(value) {
  const date = value instanceof Date ? value : (value ? new Date(value) : null);
  if (!date || isNaN(date.getTime())) return '';
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
}

function shortWatchUrl_(url) {
  return String(url || '')
    .replace(/^https?:\/\/(www\.)?/i, '')
    .replace(/[?].*$/, '');
}

function clipWatchStatus_(status) {
  const text = cleanText_(status);
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

/**
 * After sending /start to the bot, reads the most recent update and displays
 * the chat ID. The bot token remains in Script Properties and is never placed
 * in a browser URL or Sheet cell.
 */
function findTelegramChatId() {
  const token = PropertiesService.getScriptProperties().getProperty('TELEGRAM_BOT_TOKEN');
  if (!token) throw new Error('Add TELEGRAM_BOT_TOKEN in Script Properties first.');
  const response = UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/getUpdates`, {
    method: 'get',
    muteHttpExceptions: true,
  });
  const json = JSON.parse(response.getContentText() || '{}');
  if (!json.ok) throw new Error(json.description || `Telegram returned HTTP ${response.getResponseCode()}.`);
  const chatIds = [...new Set((json.result || [])
    .map((update) => update.message && update.message.chat && update.message.chat.id)
    .filter((chatId) => chatId !== undefined && chatId !== null))];
  const message = chatIds.length
    ? `Telegram chat ID(s): ${chatIds.join(', ')}. Add the intended one as TELEGRAM_CHAT_ID in Script Properties.`
    : 'No message found. Open your bot in Telegram, send /start, then run this menu item again.';
  SpreadsheetApp.getUi().alert(message);
}

/** Tests whether Apps Script can retrieve meaningful public product-page data. */
function diagnoseSelectedRule() {
  const sheet = SpreadsheetApp.getActiveSheet();
  if (sheet.getName() !== SHEETS.RULES || sheet.getActiveRange().getRow() < 2) {
    throw new Error('Select one data row in the Watch Rules sheet first.');
  }
  const row = sheet.getActiveRange().getRow();
  const values = sheet.getRange(row, 1, 1, RULE_HEADERS.length).getValues()[0];
  const platform = values[1];
  const url = String(values[2] || '').trim();
  if (!/^https:\/\//i.test(url)) throw new Error('Enter a complete https:// URL.');

  const result = diagnoseUrl_(platform, url);
  const diagnosticSheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.DIAGNOSTICS);
  diagnosticSheet.appendRow([
    new Date(), platform, url, result.statusCode, result.contentType, result.bytes,
    result.signals.join(', ') || 'None', result.summary,
  ]);
  sheet.getRange(row, 8, 1, 2).setValues([[new Date(), result.summary]]);
  SpreadsheetApp.getUi().alert(`Diagnosis complete: ${result.summary}`);
}

/**
 * Verifies one momo or Funbox rule. A category URL discovers official listings
 * without product IDs. A product URL watches one known SKU, including items
 * that remain on a product page after the category hides them.
 */
function probeSelectedMomoProduct() {
  const rule = getSelectedRule_();
  if (/funbox/i.test(rule.platform)) {
    probeSelectedFunboxRule_(rule);
    return;
  }
  if (/amazon/i.test(rule.platform)) {
    probeSelectedAmazonRule_(rule);
    return;
  }
  if (isMmPlatform_(rule.platform)) {
    probeSelectedMmRule_(rule);
    return;
  }
  if (!/momo/i.test(rule.platform)) throw new Error('Set Platform to Momo, Funbox, Amazon, or MM before using this probe.');
  if (parseMomoCategory_(rule.url)) {
    const result = fetchMomoCategoryListings_(rule);
    const matched = result.products.filter((product) => applyMomoFilters_(product, rule).matched);
    const summary = formatMomoCategorySummary_(result, matched);
    appendDiagnostic_('Momo category probe', result.url, result, summary);
    updateRuleCheck_(rule.row, summary);
    SpreadsheetApp.getUi().alert(summary);
    return;
  }
  const { product, filter } = evaluateMomoRule_(rule);
  const summary = formatMomoSummary_(product, filter);
  appendDiagnostic_('Momo product probe', product.url, product, summary);
  updateRuleCheck_(rule.row, summary);
  SpreadsheetApp.getUi().alert(summary);
}

function probeSelectedFunboxRule_(rule) {
  if (parseFunboxCategory_(rule.url)) {
    const result = fetchFunboxCategoryListings_(rule);
    const matched = result.products.filter((product) => applyMomoFilters_(product, rule).matched);
    const summary = formatFunboxCategorySummary_(result, matched);
    appendDiagnostic_('Funbox category probe', result.url, result, summary);
    updateRuleCheck_(rule.row, summary);
    SpreadsheetApp.getUi().alert(summary);
    return;
  }
  const { product, filter } = evaluateFunboxRule_(rule);
  const summary = formatFunboxSummary_(product, filter);
  appendDiagnostic_('Funbox product probe', product.url, product, summary);
  updateRuleCheck_(rule.row, summary);
  SpreadsheetApp.getUi().alert(summary);
}

function probeSelectedAmazonRule_(rule) {
  if (parseAmazonSearch_(rule.url)) {
    const result = fetchAmazonSearchListings_(rule);
    const matched = result.products.filter((product) => applyMomoFilters_(product, rule).matched);
    const summary = formatAmazonSearchSummary_(result, matched);
    appendDiagnostic_('Amazon search probe', result.url, result, summary);
    updateRuleCheck_(rule.row, summary);
    SpreadsheetApp.getUi().alert(summary);
    return;
  }
  const { product, filter } = evaluateAmazonRule_(rule);
  const summary = formatAmazonSummary_(product, filter);
  appendDiagnostic_('Amazon product probe', product.url, product, summary);
  updateRuleCheck_(rule.row, summary);
  SpreadsheetApp.getUi().alert(summary);
}

function probeSelectedMmRule_(rule) {
  if (parseMmListing_(rule.url)) {
    const result = fetchMmListing_(rule);
    const matched = result.products.filter((product) => applyMomoFilters_(product, rule).matched);
    const summary = formatMmListingSummary_(result, matched);
    appendDiagnostic_('MM category probe', result.url, result, summary);
    updateRuleCheck_(rule.row, summary);
    SpreadsheetApp.getUi().alert(summary);
    return;
  }
  const { product, filter } = evaluateMmRule_(rule);
  const summary = formatMmSummary_(product, filter);
  appendDiagnostic_('MM product probe', product.url, product, summary);
  updateRuleCheck_(rule.row, summary);
  SpreadsheetApp.getUi().alert(summary);
}

/**
 * Checks enabled Momo, Funbox, Amazon.co.jp, and MM 小舖 rules. Category/search
 * rows discover listings. Product rows watch known SKUs. Telegram is sent when
 * filters match and the product is IN_STOCK. After the check, unread Telegram
 * commands such as /status are processed.
 */
function checkMomoProductRules() {
  resetProductRowIndex_();
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.RULES);
  const props = PropertiesService.getScriptProperties();
  let checked = 0;
  let notified = 0;

  if (sheet && sheet.getLastRow() >= 2) {
    const rules = sheet.getRange(2, 1, sheet.getLastRow() - 1, RULE_HEADERS.length).getValues();
    rules.forEach((values, index) => {
      const rule = ruleFromRow_(index + 2, values);
      if (!rule.enabled) return;
      const isMomo = /momo/i.test(rule.platform);
      const isFunbox = /funbox/i.test(rule.platform);
      const isAmazon = /amazon/i.test(rule.platform);
      const isMm = isMmPlatform_(rule.platform);
      if (!isMomo && !isFunbox && !isAmazon && !isMm) return;

      const isMomoCategory = isMomo && !!parseMomoCategory_(rule.url);
      const isMomoProduct = isMomo && !!parseMomoProductId_(rule.url);
      const isFunboxCategory = isFunbox && !!parseFunboxCategory_(rule.url);
      const isFunboxProduct = isFunbox && !!parseFunboxProductHandle_(rule.url);
      const isAmazonSearch = isAmazon && !!parseAmazonSearch_(rule.url);
      const isAmazonProduct = isAmazon && !!parseAmazonAsin_(rule.url);
      const isMmListing = isMm && !!parseMmListing_(rule.url);
      const isMmProduct = isMm && !!parseMmProductHandle_(rule.url);
      if (!isMomoCategory && !isMomoProduct && !isFunboxCategory && !isFunboxProduct
        && !isAmazonSearch && !isAmazonProduct && !isMmListing && !isMmProduct) return;

      checked += 1;
      try {
        if (isMomoCategory) notified += checkMomoCategoryRule_(rule, props);
        else if (isMomoProduct) notified += checkMomoProductRule_(rule, props);
        else if (isFunboxCategory) notified += checkFunboxCategoryRule_(rule, props);
        else if (isFunboxProduct) notified += checkFunboxProductRule_(rule, props);
        else if (isAmazonSearch) notified += checkAmazonSearchRule_(rule, props);
        else if (isAmazonProduct) notified += checkAmazonProductRule_(rule, props);
        else if (isMmListing) notified += checkMmListingRule_(rule, props);
        else notified += checkMmProductRule_(rule, props);
      } catch (error) {
        updateRuleCheck_(rule.row, `Check failed: ${error.message}`);
      }
    });
  }
  try {
    pollTelegramCommands_();
  } catch (error) {
    // Command polling must not fail the product check.
  }
  try {
    SpreadsheetApp.getUi().alert(`Checked ${checked} momo/Funbox/Amazon/MM rule(s); sent ${notified} notification(s).`);
  } catch (error) {
    // Time-based executions have no spreadsheet UI.
  }
}

function checkMomoProductRule_(rule, props) {
  const { product, filter } = evaluateMomoRule_(rule);
  const stateKey = `MOMO_PRODUCT_STATE_${product.productId}`;
  const previousRaw = props.getProperty(stateKey);
  const notified = recordAndNotifyInStock_(props, stateKey, product, filter, (kind) => formatMomoTelegram_(product, kind));
  updateRuleCheck_(rule.row, formatInStockFilterNote_(formatMomoSummary_(product, filter), previousRaw, product, filter));
  return notified;
}

function checkMomoCategoryRule_(rule, props) {
  const listing = fetchMomoCategoryListings_(rule);
  let notified = 0;
  listing.products.forEach((product) => {
    const filter = applyMomoFilters_(product, rule);
    const stateKey = `MOMO_PRODUCT_STATE_${product.productId}`;
    notified += recordAndNotifyInStock_(props, stateKey, product, filter, (kind) => formatMomoTelegram_(product, kind, listing.path));
  });
  const matched = listing.products.filter((product) => applyMomoFilters_(product, rule).matched);
  const summary = `${formatMomoCategorySummary_(listing, matched)} notified=${notified}.`;
  updateRuleCheck_(rule.row, summary);
  return notified;
}

function checkFunboxProductRule_(rule, props) {
  const { product, filter } = evaluateFunboxRule_(rule);
  const stateKey = `FUNBOX_PRODUCT_STATE_${product.productId}`;
  const previousRaw = props.getProperty(stateKey);
  const notified = recordAndNotifyInStock_(props, stateKey, product, filter, (kind) => formatFunboxTelegram_(product, kind));
  updateRuleCheck_(rule.row, formatInStockFilterNote_(formatFunboxSummary_(product, filter), previousRaw, product, filter));
  return notified;
}

function checkFunboxCategoryRule_(rule, props) {
  const listing = fetchFunboxCategoryListings_(rule);
  let notified = 0;
  const skipNotes = [];
  listing.products.forEach((product) => {
    const filter = applyMomoFilters_(product, rule);
    const stateKey = `FUNBOX_PRODUCT_STATE_${product.productId}`;
    notified += recordAndNotifyInStock_(props, stateKey, product, filter, (kind) => formatFunboxTelegram_(product, kind, listing.path));
    if (!(filter.matched && product.stockState === 'IN_STOCK') && skipNotes.length < 4) {
      skipNotes.push(telegramSkipNote_(product, filter));
    }
  });
  const matched = listing.products.filter((product) => applyMomoFilters_(product, rule).matched);
  const summary = `${formatFunboxCategorySummary_(listing, matched)} notified=${notified}.${skipNotes.length ? ` no telegram: ${skipNotes.join('; ')}` : ''}`;
  updateRuleCheck_(rule.row, summary);
  return notified;
}

function checkAmazonProductRule_(rule, props) {
  const { product, filter } = evaluateAmazonRule_(rule);
  const stateKey = `AMAZON_PRODUCT_STATE_${product.productId}`;
  const previousRaw = props.getProperty(stateKey);
  const notified = recordAndNotifyInStock_(props, stateKey, product, filter, (kind) => formatAmazonTelegram_(product, kind));
  updateRuleCheck_(rule.row, formatInStockFilterNote_(formatAmazonSummary_(product, filter), previousRaw, product, filter));
  return notified;
}

function checkAmazonSearchRule_(rule, props) {
  const listing = fetchAmazonSearchListings_(rule);
  let notified = 0;
  listing.products.forEach((product) => {
    const filter = applyMomoFilters_(product, rule);
    const stateKey = `AMAZON_PRODUCT_STATE_${product.productId}`;
    notified += recordAndNotifyInStock_(props, stateKey, product, filter, (kind) => formatAmazonTelegram_(product, kind, listing.path));
  });
  const matched = listing.products.filter((product) => applyMomoFilters_(product, rule).matched);
  const summary = `${formatAmazonSearchSummary_(listing, matched)} notified=${notified}.`;
  updateRuleCheck_(rule.row, summary);
  return notified;
}

function checkMmProductRule_(rule, props) {
  const { product, filter } = evaluateMmRule_(rule);
  const stateKey = `MM_PRODUCT_STATE_${product.productId}`;
  const previousRaw = props.getProperty(stateKey);
  const notified = recordAndNotifyInStock_(props, stateKey, product, filter, (kind) => formatMmTelegram_(product, kind));
  updateRuleCheck_(rule.row, formatInStockFilterNote_(formatMmSummary_(product, filter), previousRaw, product, filter));
  return notified;
}

function checkMmListingRule_(rule, props) {
  const listing = fetchMmListing_(rule);
  let notified = 0;
  const skipNotes = [];
  listing.products.forEach((product) => {
    const filter = applyMomoFilters_(product, rule);
    const stateKey = `MM_PRODUCT_STATE_${product.productId}`;
    notified += recordAndNotifyInStock_(props, stateKey, product, filter, (kind) => formatMmTelegram_(product, kind, listing.path));
    if (!(filter.matched && product.stockState === 'IN_STOCK') && skipNotes.length < 4) {
      skipNotes.push(telegramSkipNote_(product, filter));
    }
  });
  const matched = listing.products.filter((product) => applyMomoFilters_(product, rule).matched);
  const summary = `${formatMmListingSummary_(listing, matched)} notified=${notified}.${skipNotes.length ? ` no telegram: ${skipNotes.join('; ')}` : ''}`;
  updateRuleCheck_(rule.row, summary);
  return notified;
}

function installMomoTrigger1Min() {
  installMomoTrigger_(1);
}

function installMomoTrigger5Min() {
  installMomoTrigger_(5);
}

function installMomoTrigger15Min() {
  installMomoTrigger_(15);
}

/** Repeating time-driven trigger. It runs on Google's servers even if the Sheet is closed. */
function installMomoTrigger_(minutes) {
  const allowed = { 1: true, 5: true, 10: true, 15: true, 30: true };
  if (!allowed[minutes]) throw new Error('Apps Script only allows 1, 5, 10, 15, or 30 minute intervals.');
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === 'checkMomoProductRules')
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger('checkMomoProductRules').timeBased().everyMinutes(minutes).create();
  PropertiesService.getScriptProperties().setProperty('WATCH_TRIGGER_MINUTES', String(minutes));
  SpreadsheetApp.getUi().alert(
    `Installed a repeating momo + Funbox + Amazon + MM check about every ${minutes} minute(s). `
    + 'It keeps running on Google\'s servers after you close the spreadsheet. '
    + 'Closing the spreadsheet does not stop it. Use Beyblade Watcher > Stop repeating check when you want it to stop. '
    + 'A free Gmail account has about 90 minutes of trigger runtime per day; if Executions start failing, switch to 5 minutes.'
  );
}

function removeMomoTrigger() {
  const removed = ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === 'checkMomoProductRules')
    .map((trigger) => {
      ScriptApp.deleteTrigger(trigger);
      return trigger;
    }).length;
  if (removed) PropertiesService.getScriptProperties().deleteProperty('WATCH_TRIGGER_MINUTES');
  SpreadsheetApp.getUi().alert(
    removed
      ? `Stopped the repeating check (${removed} trigger(s) removed). Nothing will run until you install a check again.`
      : 'No repeating check was installed.'
  );
}

/**
 * Eslite's web client currently uses this JSON search endpoint. It is not
 * documented as a public developer API, so this function is a compatibility
 * probe only. It records the response shape and must pass before a monitor is
 * enabled. The probe intentionally does not circumvent authentication or
 * website protection.
 */
function probeSelectedEsliteSearch() {
  const sheet = SpreadsheetApp.getActiveSheet();
  if (sheet.getName() !== SHEETS.RULES || sheet.getActiveRange().getRow() < 2) {
    throw new Error('Select one Eslite data row in the Watch Rules sheet first.');
  }
  const row = sheet.getActiveRange().getRow();
  const values = sheet.getRange(row, 1, 1, RULE_HEADERS.length).getValues()[0];
  const platform = String(values[1] || '');
  const keyword = String(values[3] || '').split(',')[0].trim();
  if (!/eslite/i.test(platform)) throw new Error('Set Platform to Eslite before using this probe.');
  if (!keyword) throw new Error('Enter one include keyword, for example BEYBLADE X.');

  const apiUrl = 'https://athena.eslite.com/api/v2/search?' + toQueryString_({
    q: keyword,
    sort: 'manufacturer_date',
    size: 20,
    start: 0,
  });
  const response = UrlFetchApp.fetch(apiUrl, { method: 'get', muteHttpExceptions: true });
  const body = response.getContentText();
  const statusCode = response.getResponseCode();
  let keys = [];
  let summary;
  try {
    const json = JSON.parse(body);
    keys = Object.keys(json);
    summary = statusCode >= 200 && statusCode < 300
      ? `Candidate Eslite JSON endpoint responded; top-level keys: ${keys.join(', ') || '(none)'}.`
      : `Candidate Eslite endpoint returned HTTP ${statusCode}.`;
  } catch (error) {
    summary = `Candidate Eslite endpoint did not return JSON (HTTP ${statusCode}).`;
  }
  const diagnostics = SpreadsheetApp.getActive().getSheetByName(SHEETS.DIAGNOSTICS);
  diagnostics.appendRow([new Date(), 'Eslite API probe', apiUrl, statusCode,
    response.getHeaders()['Content-Type'] || '', body.length, keys.join(', ') || 'No JSON keys', summary]);
  sheet.getRange(row, 8, 1, 2).setValues([[new Date(), summary]]);
  SpreadsheetApp.getUi().alert(summary);
}

function diagnoseUrl_(platform, url) {
  const mmListing = parseMmListing_(url);
  const mmHandle = parseMmProductHandle_(url);
  const fetchUrl = mmHandle
    ? `${MM_ORIGIN}/item/query/${encodeURIComponent(mmHandle)}`
    : mmListing
      ? mmListingQueryUrl_(mmListing, 1)
      : (parseMomoProductId_(url) ? canonicalMomoProductUrl_(parseMomoProductId_(url)) : url);
  const request = mmHandle || mmListing
    ? mmJsonRequest_(fetchUrl)
    : {
      method: 'get',
      followRedirects: true,
      muteHttpExceptions: true,
      headers: { Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8' },
    };
  const response = UrlFetchApp.fetch(fetchUrl, request);
  const body = response.getContentText();
  const contentType = response.getHeaders()['Content-Type'] || '';
  const signals = [];
  if (/application\/ld\+json/i.test(body)) signals.push('JSON-LD');
  if (/\"price\"|\"offers\"|price|sale price|product:price/i.test(body)) signals.push('Price candidate');
  if (/inStock|outOfStock|stock|quantity|pre_order|availability|product:availability/i.test(body)) signals.push('Stock candidate');
  if (/<title[^>]*>/i.test(body)) signals.push('HTML title');
  if (/captcha|access denied|forbidden|verify you are human/i.test(body)) signals.push('Possible protection page');

  const statusCode = response.getResponseCode();
  let summary;
  if (statusCode >= 200 && statusCode < 300 && signals.includes('Possible protection page')) {
    summary = 'Page loads but appears protected; do not use this GAS source.';
  } else if (statusCode >= 200 && statusCode < 300 && signals.length > 1) {
    summary = 'Reachable with product-data signals; a platform parser can be evaluated next.';
  } else if (statusCode >= 200 && statusCode < 300) {
    summary = 'Reachable, but public response has insufficient product signals.';
  } else {
    summary = `Request failed (HTTP ${statusCode}); do not use this GAS source.`;
  }
  return { statusCode, contentType, bytes: body.length, signals, summary, platform };
}

function evaluateMomoRule_(rule) {
  const product = fetchMomoProduct_(rule.url);
  return { product, filter: applyMomoFilters_(product, rule) };
}

function fetchMomoProduct_(url) {
  const productId = parseMomoProductId_(url);
  if (!productId) {
    throw new Error('Paste any momo product URL, for example /product/15462752 or GoodsDetail.jsp?i_code=15462752.');
  }
  const canonicalUrl = canonicalMomoProductUrl_(productId);
  const response = UrlFetchApp.fetch(canonicalUrl, {
    method: 'get',
    followRedirects: true,
    muteHttpExceptions: true,
    headers: MOMO_FETCH_HEADERS,
  });
  const body = response.getContentText();
  const statusCode = response.getResponseCode();
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`momo returned HTTP ${statusCode}.`);
  }
  const text = htmlToText_(body);
  const rawName = readMetaContent_(body, 'og:title')
    || firstMatch_(body, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const name = cleanProductName_(rawName);
  const priceAmount = readMetaContent_(body, 'product:price:amount');
  const availability = readMetaContent_(body, 'product:availability').toLowerCase();
  const unlisted = /\u5546\u54c1\u76ee\u524d\u7121\u5c55\u552e|\u7db2\u9801\u7121\u6cd5\u986f\u793a/i.test(text)
    || (!availability && !name);
  let stockState = 'UNKNOWN';
  if (unlisted) stockState = 'UNLISTED';
  else if (availability === 'out of stock' || /\u53ef\u8a02\u8cfc\u6642\u901a\u77e5\u6211|\u88dc\u8ca8\u901a\u77e5/i.test(text)) {
    stockState = 'OUT_OF_STOCK';
  } else if (availability === 'in stock' || /\u52a0\u5165\u8cfc\u7269\u8eca|\u7acb\u5373\u8cfc\u8cb7|\u6211\u8981\u8cfc\u8cb7/i.test(text)) {
    stockState = 'IN_STOCK';
  }

  return {
    platform: 'Momo',
    productId,
    url: canonicalUrl,
    statusCode,
    contentType: response.getHeaders()['Content-Type'] || '',
    bytes: body.length,
    name,
    price: priceAmount ? `NT$${priceAmount}` : '',
    stockState,
    availability: availability || '',
    signals: [stockState, availability ? `availability:${availability}` : '', name ? 'Product name' : '', priceAmount ? 'Price' : ''].filter(Boolean),
  };
}

function applyMomoFilters_(product, rule) {
  const reasons = [];
  if (!matchesAnyKeyword_(product.name, rule.includeKeywords)) {
    reasons.push('name does not match include keywords');
  }
  if (matchesAnyKeyword_(product.name, rule.excludeKeywords, true)) {
    reasons.push('name matches exclude keywords');
  }
  const maxPrice = parsePriceNumber_(rule.maxPrice);
  const price = parsePriceNumber_(product.price);
  if (maxPrice && price && price > maxPrice) {
    reasons.push(`price ${product.price} exceeds maximum ${maxPrice}`);
  }
  return { matched: reasons.length === 0, reasons };
}

function formatMomoSummary_(product, filter) {
  const filterText = filter.matched
    ? 'filters matched'
    : `filters missed (${filter.reasons.join('; ')})`;
  const qtyText = hasQuantity_(product) ? `qty ${product.quantity}` : 'qty not parsed';
  return `momo product ${product.productId}: ${product.stockState}; ${qtyText}; ${product.name || 'name not parsed'}; ${product.price || 'price not parsed'}; ${filterText}.`;
}

function formatMomoTelegram_(product, kind, categoryPath) {
  return formatUserStockTelegram_('momo', kind, product.name || `商品 ${product.productId}`, product, product.url);
}

function formatMomoCategorySummary_(listing, matched) {
  const path = listing.path || `category ${listing.cateCode}`;
  if (listing.empty) {
    return `${path}: 0 official goods listed (${listing.emptyReason || 'empty'}).`;
  }
  return `${path}: ${listing.products.length} official goods, ${matched.length} matched filters. ${formatQuantityPreview_(listing.products)}`;
}

function parseMomoCategory_(url) {
  const text = String(url || '');
  if (!/momoshop\.com\.tw/i.test(text)) return null;
  const cateCode = firstMatch_(text, /\/categories\/(\d+)/i)
    || firstMatch_(text, /[?&]d_code=(\d+)/i)
    || firstMatch_(text, /[?&]m_code=(\d+)/i)
    || firstMatch_(text, /[?&]l_code=(\d+)/i);
  if (!cateCode) return null;
  let cateLevel = firstMatch_(text, /[?&]cateLevel=(\d+)/i);
  if (!cateLevel) {
    if (/l_code=|LgrpCategory/i.test(text) || /0000$/.test(cateCode)) cateLevel = '1';
    else if (/m_code=|MgrpCategory/i.test(text)) cateLevel = '2';
    else cateLevel = '3';
  }
  const path = cateCode === MOMO_FUNBOX_BEYBLADE.cateCode
    ? MOMO_FUNBOX_BEYBLADE.path
    : `momo category ${cateCode}`;
  return { cateCode, cateLevel, path, url: `https://www.momoshop.com.tw/categories/${cateCode}` };
}

function fetchMomoCategoryListings_(rule) {
  const category = parseMomoCategory_(rule.url);
  if (!category) throw new Error('This is not a momo category URL.');
  const products = [];
  const seen = {};
  let emptyReason = '';
  let statusCode = 200;
  let bytes = 0;
  let maxPage = 1;
  for (let page = 1; page <= MOMO_CATEGORY_MAX_PAGES; page++) {
    const payload = momoCategoryPayload_(category.cateCode, category.cateLevel, page);
    const response = UrlFetchApp.fetch(MOMO_CATEGORY_API, {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      headers: {
        Accept: 'application/json, text/plain, */*',
        Origin: 'https://www.momoshop.com.tw',
        Referer: category.url,
      },
      payload: JSON.stringify(payload),
    });
    statusCode = response.getResponseCode();
    const body = response.getContentText() || '';
    bytes += body.length;
    if (statusCode < 200 || statusCode >= 300) {
      throw new Error(`momo category API returned HTTP ${statusCode}.`);
    }
    const json = JSON.parse(body);
    if (json.success === false && String(json.resultCode) === '40006') {
      emptyReason = 'no listed goods in this official category';
      break;
    }
    if (json.success === false) {
      throw new Error(`momo category API result ${json.resultCode || 'unknown'}.`);
    }
    const goods = ((json.rtnGoodsData && json.rtnGoodsData.goodsInfoList) || []);
    maxPage = Number(json.maxPage) || 1;
    goods.forEach((item) => {
      const product = momoCategoryItemToProduct_(item, category);
      if (!product || seen[product.productId]) return;
      seen[product.productId] = true;
      products.push(product);
    });
    if (page >= maxPage) break;
  }
  return {
    url: category.url,
    cateCode: category.cateCode,
    path: category.path,
    statusCode,
    contentType: 'application/json',
    bytes,
    products,
    empty: products.length === 0,
    emptyReason,
    signals: [
      products.length ? `${products.length} official goods` : 'Empty official category',
      emptyReason,
    ].filter(Boolean),
  };
}

function momoCategoryPayload_(cateCode, cateLevel, page) {
  return {
    host: 'momoshop',
    data: {
      curPage: String(page),
      cateCode: String(cateCode),
      searchType: '',
      isSpecialSortType: true,
      cateLevel: String(cateLevel),
      salesSort: '',
      custNo: '',
      imgType: 'webp',
      sortType: '',
      priceS: '',
      priceE: '',
      commentRate: '',
      brandCode: [],
      brandName: [],
      indexInfoList: [],
      brandSeriesList: [],
      ecTagNos: [],
      first: 'N',
      freeze: 'N',
      prefere: 'N',
      NAM: 'N',
      cod: 'N',
      superstorePay: 'N',
      moCoinFeedback: 'N',
      superstoreFree: 'N',
      cp: 'N',
      video: 'N',
      stockYN: 'N',
      tvshop: 'N',
      cycle: 'N',
      cateType: '',
      has3P: 'N',
      discount: 'N',
      superstore: 'N',
      specialSortType: '',
      specialGoodsType: '',
      tempSpecialSortType: '',
      dispCnt: '35',
      fast58: 'N',
    },
  };
}

function momoCategoryItemToProduct_(item, category) {
  const productId = String((item && item.goodsCode) || '').trim();
  if (!/^\d+$/.test(productId)) return null;
  const stockValue = parsePriceNumber_(item.goodsStock);
  return {
    platform: 'Momo',
    productId,
    url: canonicalMomoProductUrl_(productId),
    name: cleanText_(item.goodsName),
    price: item.goodsPrice ? `NT$${item.goodsPrice}` : '',
    quantity: item.goodsStock === undefined || item.goodsStock === null || item.goodsStock === '' ? '' : stockValue,
    stockState: 'IN_STOCK',
    categoryPath: category.path,
    signals: ['Official category listing', stockValue || stockValue === 0 ? `qty:${item.goodsStock}` : 'listed'],
  };
}

/** Accepts /product/{id}, GoodsDetail.jsp?i_code=, and other public momo product links. */
function parseMomoProductId_(url) {
  const text = String(url || '');
  if (!/momoshop\.com\.tw/i.test(text)) return '';
  return firstMatch_(text, /\/product\/(\d+)/i)
    || firstMatch_(text, /[?&]i_code=(\d+)/i)
    || firstMatch_(text, /[?&]goodsCode=(\d+)/i)
    || firstMatch_(text, /\/goods\/(\d+)/i);
}

function canonicalMomoProductUrl_(productId) {
  return `https://www.momoshop.com.tw/product/${productId}`;
}

function evaluateFunboxRule_(rule) {
  const product = fetchFunboxProduct_(rule.url);
  return { product, filter: applyMomoFilters_(product, rule) };
}

function parseFunboxCategory_(url) {
  const text = String(url || '');
  if (!/shop\.funbox\.com\.tw/i.test(text)) return null;
  const path = firstMatch_(text, /\/categories\/([A-Za-z0-9/_-]+)/i);
  if (!path) return null;
  const cleanPath = path.replace(/\/+$/, '').replace(/\.json$/i, '');
  return {
    path: cleanPath,
    pathKey: cleanPath.replace(/\//g, '_'),
    url: `${FUNBOX_SHOP_ORIGIN}/categories/${cleanPath}`,
    name: cleanPath === FUNBOX_BEYBLADE.path ? FUNBOX_BEYBLADE.name : `Funbox 直營 ${cleanPath}`,
    expandCollections: cleanPath === FUNBOX_BEYBLADE.path,
  };
}

function parseFunboxProductHandle_(url) {
  const text = String(url || '');
  const handle = firstMatch_(text, /\/products\/([A-Za-z0-9_-]+)/i);
  if (!handle) return '';
  if (/https?:\/\//i.test(text) && !/shop\.funbox\.com\.tw/i.test(text)) return '';
  return handle.replace(/\.json$/i, '');
}

function canonicalFunboxProductUrl_(handle) {
  return `${FUNBOX_SHOP_ORIGIN}/products/${handle}`;
}

function fetchFunboxJson_(url) {
  const response = UrlFetchApp.fetch(url, funboxJsonRequest_(url));
  return parseFunboxJsonResponse_(response, url);
}

function funboxJsonRequest_(url) {
  return {
    url,
    method: 'get',
    followRedirects: true,
    muteHttpExceptions: true,
    headers: FUNBOX_JSON_HEADERS,
  };
}

function parseFunboxJsonResponse_(response, url) {
  const body = response.getContentText() || '';
  const statusCode = response.getResponseCode();
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`Funbox returned HTTP ${statusCode} for ${url}`);
  }
  let json;
  try {
    json = JSON.parse(body);
  } catch (error) {
    throw new Error(`Funbox did not return JSON for ${url}`);
  }
  return {
    json,
    statusCode,
    bytes: body.length,
    contentType: response.getHeaders()['Content-Type'] || '',
  };
}

function fetchFunboxJsonAll_(urls) {
  if (!urls.length) return [];
  const responses = UrlFetchApp.fetchAll(urls.map((url) => funboxJsonRequest_(url)));
  return responses.map((response, index) => parseFunboxJsonResponse_(response, urls[index]));
}

function funboxCategoryProductsUrl_(path, page) {
  return `${FUNBOX_SHOP_ORIGIN}/category_products/${path}.json?${toQueryString_({
    limit: FUNBOX_CATEGORY_LIMIT,
    page,
    sort_by: 'sell_from-desc',
  })}`;
}

function fetchFunboxProduct_(url) {
  const handle = parseFunboxProductHandle_(url);
  if (!handle) {
    throw new Error('Paste a Funbox product URL, for example https://shop.funbox.com.tw/products/handle');
  }
  const fetched = fetchFunboxJson_(`${canonicalFunboxProductUrl_(handle)}.json`);
  const product = funboxItemToProduct_(fetched.json || {}, handle);
  product.statusCode = fetched.statusCode;
  product.contentType = fetched.contentType;
  product.bytes = fetched.bytes;
  product.signals = [product.stockState, product.name ? 'Product name' : '', product.price ? 'Price' : ''].filter(Boolean);
  return product;
}

function fetchFunboxCategoryListings_(rule) {
  const category = parseFunboxCategory_(rule.url);
  if (!category) throw new Error('This is not a Funbox category URL.');
  const paths = funboxListingPaths_(category);
  const products = [];
  const seen = {};
  let statusCode = 200;
  let bytes = 0;
  let pending = paths.map((path) => ({ path, page: 1 }));
  while (pending.length) {
    const urls = pending.map((job) => funboxCategoryProductsUrl_(job.path, job.page));
    const fetchedList = fetchFunboxJsonAll_(urls);
    const nextPending = [];
    fetchedList.forEach((fetched, index) => {
      statusCode = fetched.statusCode;
      bytes += fetched.bytes;
      const items = Array.isArray(fetched.json) ? fetched.json : [];
      items.forEach((item) => {
        const product = funboxItemToProduct_(item, '');
        if (!product || seen[product.productId]) return;
        seen[product.productId] = true;
        products.push(product);
      });
      const job = pending[index];
      if (items.length >= FUNBOX_CATEGORY_LIMIT && job.page < FUNBOX_CATEGORY_MAX_PAGES) {
        nextPending.push({ path: job.path, page: job.page + 1 });
      }
    });
    pending = nextPending;
  }
  return {
    url: category.url,
    path: category.name,
    pathKey: category.pathKey,
    statusCode,
    contentType: 'application/json',
    bytes,
    products,
    empty: products.length === 0,
    emptyReason: products.length === 0 ? 'no listed goods in this official Funbox category' : '',
    signals: [
      products.length ? `${products.length} official goods` : 'Empty official category',
      `paths:${paths.length}`,
    ],
  };
}

function funboxListingPaths_(category) {
  const paths = [category.path];
  if (!category.expandCollections) return paths;
  const collections = funboxDiscoverCollections_(category.path) || FUNBOX_BEYBLADE.collections;
  collections.forEach((handle) => {
    const child = `${category.path}/${handle}`;
    if (paths.indexOf(child) === -1) paths.push(child);
  });
  return paths;
}

function funboxDiscoverCollections_(categoryPath) {
  try {
    const fetched = fetchFunboxJson_(FUNBOX_CATEGORIES_JSON);
    const parts = String(categoryPath || '').split('/').filter(Boolean);
    let nodes = Array.isArray(fetched.json) ? fetched.json : [];
    let node = null;
    parts.forEach((handle) => {
      const list = node ? (node.children_categories || []) : nodes;
      node = null;
      for (let i = 0; i < list.length; i++) {
        if (String(list[i].handle) === handle) {
          node = list[i];
          break;
        }
      }
    });
    if (!node || !node.collections || !node.collections.length) return null;
    return node.collections.map((item) => String(item.handle || '')).filter(Boolean);
  } catch (error) {
    return null;
  }
}

function funboxItemToProduct_(item, fallbackHandle) {
  const handle = parseFunboxProductHandle_(item && item.url)
    || String((item && item.handle) || fallbackHandle || '').replace(/\.json$/i, '');
  if (!handle) return null;
  const price = item.price || (item.variants && item.variants[0] && item.variants[0].price);
  const quantity = funboxQuantity_(item);
  return {
    platform: 'Funbox',
    productId: handle,
    url: canonicalFunboxProductUrl_(handle),
    name: cleanText_(item.title || ''),
    price: price !== undefined && price !== null && price !== '' ? `NT$${price}` : '',
    quantity,
    stockState: funboxStockState_(item),
    signals: ['Funbox shop listing', quantity === '' ? '' : `qty:${quantity}`].filter(Boolean),
  };
}

function funboxQuantity_(item) {
  const variants = (item && item.variants) || [];
  let total = 0;
  let tracked = false;
  variants.forEach((variant) => {
    const qty = Number(variant.inventory_quantity);
    if (!isNaN(qty)) {
      tracked = true;
      total += qty;
    }
  });
  return tracked ? total : '';
}

function funboxStockState_(item) {
  if (item && item.available === true) return 'IN_STOCK';
  if (item && item.available === false) return 'OUT_OF_STOCK';
  const variants = (item && item.variants) || [];
  let inStock = false;
  let tracked = false;
  variants.forEach((variant) => {
    const qty = Number(variant.inventory_quantity);
    const policy = String(variant.inventory_policy || '').toLowerCase();
    if (!isNaN(qty)) tracked = true;
    if (qty > 0 || policy === 'continue') inStock = true;
  });
  if (inStock) return 'IN_STOCK';
  if (tracked) return 'OUT_OF_STOCK';
  return 'UNKNOWN';
}

function formatFunboxSummary_(product, filter) {
  const filterText = filter.matched
    ? 'filters matched'
    : `filters missed (${filter.reasons.join('; ')})`;
  const qtyText = hasQuantity_(product) ? `qty ${product.quantity}` : 'qty not parsed';
  return `Funbox product ${product.productId}: ${product.stockState}; ${qtyText}; ${product.name || 'name not parsed'}; ${product.price || 'price not parsed'}; ${filterText}.`;
}

function formatFunboxTelegram_(product, kind, categoryPath) {
  return formatUserStockTelegram_('Funbox', kind, product.name || `商品 ${product.productId}`, product, product.url);
}

function formatFunboxCategorySummary_(listing, matched) {
  const path = listing.path || 'Funbox category';
  if (listing.empty) {
    return `${path}: 0 official goods listed (${listing.emptyReason || 'empty'}).`;
  }
  return `${path}: ${listing.products.length} official goods, ${matched.length} matched filters. ${formatQuantityPreview_(listing.products)}`;
}

function isMmPlatform_(platform) {
  return /^(mm|mm小舖|m\.?m\s*小舖|mmtoyshop)$/i.test(String(platform || '').trim());
}

function decodeMmComponent_(value) {
  try {
    return decodeURIComponent(String(value || '').replace(/\+/g, ' '));
  } catch (error) {
    return String(value || '');
  }
}

function parseMmProductHandle_(url) {
  const text = String(url || '');
  if (/https?:\/\//i.test(text) && !/mmtoyshop\.com/i.test(text)) return '';
  return firstMatch_(text, /\/(?:item|products)\/([^/?#]+)/i);
}

function parseMmListing_(url) {
  const text = String(url || '').trim();
  if (!/mmtoyshop\.com/i.test(text)) return null;
  if (parseMmProductHandle_(text)) return null;
  const keyword = firstMatch_(text, /[?&]keyword=([^&]+)/i);
  if (keyword) {
    const decoded = decodeMmComponent_(keyword);
    return {
      kind: 'search',
      keyword: decoded,
      slug: '',
      url: `${MM_ORIGIN}/category?keyword=${encodeURIComponent(decoded)}`,
      path: `MM 小舖搜尋 ${decoded}`,
      pathKey: `kw:${decoded}`,
    };
  }
  const slug = firstMatch_(text, /\/category\/([^/?#]+)/i);
  if (!slug || /^query$/i.test(slug)) return null;
  const decoded = decodeMmComponent_(slug);
  return {
    kind: 'category',
    keyword: '',
    slug: decoded,
    url: `${MM_ORIGIN}/category/${encodeURIComponent(decoded)}`,
    path: decoded === MM_BEYBLADE.slug ? MM_BEYBLADE.name : `MM 小舖 > ${decoded}`,
    pathKey: `cat:${decoded}`,
  };
}

function canonicalMmProductUrl_(handle) {
  return `${MM_ORIGIN}/item/${handle}`;
}

function mmListingQueryUrl_(listing, page) {
  if (listing.kind === 'search') {
    return `${MM_ORIGIN}/category/query?${toQueryString_({ keyword: listing.keyword, page })}`;
  }
  const base = `${MM_ORIGIN}/category/query/${encodeURIComponent(listing.slug)}`;
  return page > 1 ? `${base}?page=${page}` : base;
}

function mmJsonRequest_(url) {
  return {
    url,
    method: 'get',
    followRedirects: true,
    muteHttpExceptions: true,
    headers: MM_JSON_HEADERS,
  };
}

function mmIsProtected_(body, statusCode) {
  if (statusCode === 403 || statusCode === 429 || statusCode === 503) return true;
  return /cf-browser-verification|just a moment|attention required|challenge-platform|cloudflare/i.test(String(body || ''));
}

function parseMmJsonResponse_(response, url) {
  const body = response.getContentText() || '';
  const statusCode = response.getResponseCode();
  if (mmIsProtected_(body, statusCode)) {
    throw new Error('MM 小舖 returned a Cloudflare or blocked page. Disable this row until Apps Script can reach the public JSON.');
  }
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`MM 小舖 returned HTTP ${statusCode} for ${url}`);
  }
  let json;
  try {
    json = JSON.parse(body);
  } catch (error) {
    throw new Error(`MM 小舖 did not return JSON for ${url}`);
  }
  return {
    json,
    statusCode,
    bytes: body.length,
    contentType: response.getHeaders()['Content-Type'] || '',
  };
}

function fetchMmJson_(url) {
  const response = UrlFetchApp.fetch(url, mmJsonRequest_(url));
  return parseMmJsonResponse_(response, url);
}

function fetchMmJsonAll_(urls) {
  if (!urls.length) return [];
  const responses = UrlFetchApp.fetchAll(urls.map((url) => mmJsonRequest_(url)));
  return responses.map((response, index) => parseMmJsonResponse_(response, urls[index]));
}

function mmSpecName_(spec) {
  return String((spec && (spec.option_name || spec.size_name || spec.name)) || '');
}

function mmTrackedSpecs_(item) {
  const specs = (item && item.specs) || [];
  if (!specs.length) return null;
  return specs.filter((spec) => {
    const name = mmSpecName_(spec);
    return /不補/.test(name) && !/客訂/.test(name);
  });
}

function mmQuantity_(item) {
  const tracked = mmTrackedSpecs_(item);
  if (tracked) {
    if (!tracked.length) return 0;
    let total = 0;
    let counted = false;
    tracked.forEach((spec) => {
      const qty = Number(spec.quantity);
      if (!isNaN(qty)) {
        counted = true;
        total += qty;
      }
    });
    return counted ? total : 0;
  }
  const qty = Number(item && item.quantity);
  return isNaN(qty) ? '' : qty;
}

function mmPrice_(item) {
  const price = item && (item.shownPrice !== undefined && item.shownPrice !== null && item.shownPrice !== ''
    ? item.shownPrice
    : item.price);
  return price !== undefined && price !== null && price !== '' ? `NT$${price}` : '';
}

function mmSoldoutHint_(item) {
  return cleanText_(item && item.soldout_hint);
}

function mmStockState_(item) {
  const qty = mmQuantity_(item);
  const restocking = /補貨中/.test(mmSoldoutHint_(item));
  if (restocking || qty === '' || Number(qty) <= 0) return 'OUT_OF_STOCK';
  return 'IN_STOCK';
}

function mmItemToProduct_(item) {
  const prod = (item && item.prod) || item || {};
  const handle = String(prod.route || '').trim();
  const productId = String(prod.id || handle || '');
  if (!productId) return null;
  const quantity = mmQuantity_(prod);
  return {
    platform: 'MM',
    productId,
    url: handle ? canonicalMmProductUrl_(handle) : `${MM_ORIGIN}/category/${encodeURIComponent(MM_BEYBLADE.slug)}`,
    name: cleanText_(prod.title || ''),
    price: mmPrice_(prod),
    quantity,
    stockState: mmStockState_(prod),
    signals: [
      'MM listing',
      quantity === '' ? '' : `qty:${quantity}`,
      mmSoldoutHint_(prod) ? `button:${mmSoldoutHint_(prod)}` : '',
      (prod.specs || []).length ? `不補 specs:${(mmTrackedSpecs_(prod) || []).length}` : '',
      prod.pre_order ? 'preorder' : '',
    ].filter(Boolean),
  };
}

function evaluateMmRule_(rule) {
  const product = fetchMmProduct_(rule.url);
  return { product, filter: applyMomoFilters_(product, rule) };
}

function fetchMmProduct_(url) {
  const handle = parseMmProductHandle_(url);
  if (!handle) {
    throw new Error('Paste an MM 小舖 product URL, for example https://mmtoyshop.com/item/handle');
  }
  const fetched = fetchMmJson_(`${MM_ORIGIN}/item/query/${encodeURIComponent(handle)}`);
  const product = mmItemToProduct_((fetched.json && fetched.json.response) || fetched.json || {});
  if (!product) throw new Error(`MM 小舖 product JSON did not include item ${handle}.`);
  product.statusCode = fetched.statusCode;
  product.contentType = fetched.contentType;
  product.bytes = fetched.bytes;
  product.signals = [product.stockState, product.name ? 'Product name' : '', product.price ? 'Price' : ''].filter(Boolean);
  return product;
}

function fetchMmListing_(rule) {
  const listing = parseMmListing_(rule.url);
  if (!listing) throw new Error('This is not an MM 小舖 category or search URL.');
  const first = fetchMmJson_(mmListingQueryUrl_(listing, 1));
  const pageJsons = [first.json];
  const lastPage = Math.min(Number(first.json && first.json.lastPage) || 1, MM_CATEGORY_MAX_PAGES);
  if (lastPage > 1) {
    const urls = [];
    for (let page = 2; page <= lastPage; page++) urls.push(mmListingQueryUrl_(listing, page));
    fetchMmJsonAll_(urls).forEach((fetched) => pageJsons.push(fetched.json));
  }
  const products = [];
  const seen = {};
  let bytes = first.bytes;
  pageJsons.forEach((pageJson, index) => {
    if (index > 0) bytes += JSON.stringify(pageJson || {}).length;
    ((pageJson && pageJson.products) || []).forEach((item) => {
      const product = mmItemToProduct_(item);
      if (!product || seen[product.productId]) return;
      seen[product.productId] = true;
      products.push(product);
    });
  });
  return {
    url: listing.url,
    path: listing.path,
    pathKey: listing.pathKey,
    statusCode: first.statusCode,
    contentType: 'application/json',
    bytes,
    products,
    empty: products.length === 0,
    emptyReason: products.length === 0 ? 'no listed goods in this MM 小舖 category' : '',
    signals: [
      products.length ? `${products.length} MM goods` : 'Empty MM category',
      `pages:${pageJsons.length}`,
    ],
  };
}

function formatMmSummary_(product, filter) {
  const filterText = filter.matched
    ? 'filters matched'
    : `filters missed (${filter.reasons.join('; ')})`;
  const qtyText = hasQuantity_(product) ? `qty ${product.quantity}` : 'qty not parsed';
  return `MM product ${product.productId}: ${product.stockState}; ${qtyText}; ${product.name || 'name not parsed'}; ${product.price || 'price not parsed'}; ${filterText}.`;
}

function formatMmTelegram_(product, kind, categoryPath) {
  return formatUserStockTelegram_('MM小舖', kind, product.name || `商品 ${product.productId}`, product, product.url);
}

function formatMmListingSummary_(listing, matched) {
  const path = listing.path || 'MM 小舖 category';
  if (listing.empty) {
    return `${path}: 0 goods listed (${listing.emptyReason || 'empty'}).`;
  }
  return `${path}: ${listing.products.length} goods, ${matched.length} matched filters. ${formatQuantityPreview_(listing.products)}`;
}

function evaluateAmazonRule_(rule) {
  const product = fetchAmazonProduct_(rule.url);
  return { product, filter: applyMomoFilters_(product, rule) };
}

function parseAmazonAsin_(url) {
  const text = String(url || '');
  if (/https?:\/\//i.test(text) && !/amazon\.co\.jp/i.test(text)) return '';
  return firstMatch_(text, /\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/i);
}

function parseAmazonSearch_(url) {
  const text = String(url || '');
  if (!/amazon\.co\.jp/i.test(text)) return null;
  if (parseAmazonAsin_(text)) return null;
  if (!/\/s(?:[/?]|$)/i.test(text)) return null;
  return {
    url: text,
    path: AMAZON_BEYBLADE_SEARCH.url === text || /ベイブレード|%E3%83%99%E3%82%A4%E3%83%96%E3%83%AC%E3%83%BC%E3%83%89/i.test(text)
      ? AMAZON_BEYBLADE_SEARCH.name
      : 'Amazon.co.jp search',
    pathKey: amazonSearchPathKey_(text),
  };
}

function canonicalAmazonProductUrl_(asin) {
  return `${AMAZON_ORIGIN}/dp/${asin}`;
}

function amazonSearchPathKey_(url) {
  const normalized = amazonSearchUrlWithPage_(url, 1).replace(/^https?:\/\/(www\.)?/i, '').slice(0, 180);
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, normalized);
  return bytes.map((b) => (`0${((b + 256) % 256).toString(16)}`).slice(-2)).join('').slice(0, 16);
}

function amazonSearchUrlWithPage_(url, page) {
  const cleaned = String(url || '')
    .replace(/([?&])page=\d+/ig, '$1')
    .replace(/[?&]$/, '')
    .replace(/&&+/g, '&')
    .replace(/\?&/, '?');
  if (page <= 1) return cleaned;
  return `${cleaned}${cleaned.indexOf('?') >= 0 ? '&' : '?'}page=${page}`;
}

function amazonFetch_(url) {
  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    followRedirects: true,
    muteHttpExceptions: true,
    headers: AMAZON_FETCH_HEADERS,
  });
  return {
    statusCode: response.getResponseCode(),
    body: response.getContentText() || '',
    contentType: response.getHeaders()['Content-Type'] || '',
  };
}

function amazonIsProtected_(body, statusCode) {
  if (statusCode === 503 || statusCode === 405 || statusCode === 429) return true;
  return /validateCaptcha|opfcaptcha|\/errors\/validateCaptcha|automated access|Robot Check|api-services-support@amazon\.com/i.test(body);
}

function fetchAmazonProduct_(url) {
  const asin = parseAmazonAsin_(url);
  if (!asin) {
    throw new Error('Paste an amazon.co.jp product URL, for example https://www.amazon.co.jp/dp/B0C52R16P1');
  }
  const canonicalUrl = canonicalAmazonProductUrl_(asin);
  const fetched = amazonFetch_(canonicalUrl);
  if (amazonIsProtected_(fetched.body, fetched.statusCode)) {
    throw new Error('Amazon returned a robot-check or blocked page. Do not use this Apps Script source until a public response is reachable.');
  }
  if (fetched.statusCode < 200 || fetched.statusCode >= 300) {
    throw new Error(`Amazon returned HTTP ${fetched.statusCode}.`);
  }
  const name = amazonProductName_(fetched.body);
  const price = amazonProductPrice_(fetched.body);
  const stockState = amazonProductStockState_(fetched.body);
  return {
    platform: 'Amazon',
    productId: asin,
    url: canonicalUrl,
    statusCode: fetched.statusCode,
    contentType: fetched.contentType,
    bytes: fetched.body.length,
    name,
    price,
    stockState,
    signals: [stockState, name ? 'Product name' : '', price ? 'Price' : ''].filter(Boolean),
  };
}

function fetchAmazonSearchListings_(rule) {
  const search = parseAmazonSearch_(rule.url);
  if (!search) throw new Error('This is not an amazon.co.jp search URL.');
  const products = [];
  const seen = {};
  let statusCode = 200;
  let bytes = 0;
  let pages = 0;
  for (let page = 1; page <= AMAZON_SEARCH_MAX_PAGES; page++) {
    const pageUrl = amazonSearchUrlWithPage_(search.url, page);
    const fetched = amazonFetch_(pageUrl);
    statusCode = fetched.statusCode;
    bytes += fetched.body.length;
    if (amazonIsProtected_(fetched.body, fetched.statusCode)) {
      throw new Error('Amazon search returned a robot-check or blocked page. Do not use this Apps Script source until a public response is reachable.');
    }
    if (fetched.statusCode < 200 || fetched.statusCode >= 300) {
      throw new Error(`Amazon search returned HTTP ${fetched.statusCode}.`);
    }
    pages += 1;
    const items = parseAmazonSearchResults_(fetched.body);
    items.forEach((product) => {
      if (seen[product.productId]) return;
      seen[product.productId] = true;
      products.push(product);
    });
    if (items.length < 16 || !/s-pagination-next/i.test(fetched.body)) break;
  }
  return {
    url: search.url,
    path: search.path,
    pathKey: search.pathKey,
    statusCode,
    contentType: 'text/html',
    bytes,
    products,
    empty: products.length === 0,
    emptyReason: products.length === 0 ? 'no search results parsed' : '',
    signals: [
      products.length ? `${products.length} search results` : 'Empty Amazon search',
      `pages:${pages}`,
    ],
  };
}

function parseAmazonSearchResults_(html) {
  const products = [];
  const re = /<div[^>]*role="listitem"[^>]*data-asin="([A-Z0-9]{10})"[^>]*data-component-type="s-search-result"/gi;
  const starts = [];
  let match;
  while ((match = re.exec(html))) {
    starts.push({ asin: match[1], index: match.index });
  }
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i].index;
    const end = i + 1 < starts.length ? starts[i + 1].index : Math.min(html.length, start + 20000);
    const product = amazonSearchBlockToProduct_(starts[i].asin, html.substring(start, end));
    if (product) products.push(product);
  }
  return products;
}

function amazonSearchBlockToProduct_(asin, block) {
  if (!asin) return null;
  const name = amazonSearchTitle_(block);
  const priceWhole = cleanText_(firstMatch_(block, /a-price-whole">([^<]+)/i)).replace(/[.,]$/, '');
  const unavailable = /現在お取り扱いできません|Currently unavailable/i.test(block);
  return {
    platform: 'Amazon',
    productId: asin,
    url: canonicalAmazonProductUrl_(asin),
    name,
    price: priceWhole ? `¥${priceWhole}` : '',
    stockState: unavailable ? 'OUT_OF_STOCK' : 'IN_STOCK',
    signals: ['Amazon search listing'],
  };
}

function amazonSearchTitle_(block) {
  const candidates = [
    firstMatch_(block, /<h2[^>]*aria-label="([^"]{5,200})"/i),
    firstMatch_(block, /<h2[^>]*>[\s\S]*?<span[^>]*>([^<]{5,250})<\/span>/i),
    firstMatch_(block, /alt="([^"]{5,200})"/i),
  ];
  for (let i = 0; i < candidates.length; i++) {
    const name = cleanText_(htmlDecode_(candidates[i]));
    if (name && !amazonLooksLikeUrl_(name)) return name;
  }
  return '';
}

function amazonLooksLikeUrl_(text) {
  return /https?:\/\/|\/dp\/|dib=|ref=sr_/i.test(text);
}

function amazonProductName_(html) {
  const title = firstMatch_(html, /id="productTitle"[^>]*>([\s\S]*?)<\/span>/i)
    || firstMatch_(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  return cleanText_(String(title || '').replace(/\s*:\s*Amazon\.co\.jp[\s\S]*$/i, '').replace(/\s*:\s*おもちゃ[\s\S]*$/i, ''));
}

function amazonProductPrice_(html) {
  const offscreen = firstMatch_(html, /class="a-offscreen">\s*(¥[^<]+)</i);
  if (offscreen) return cleanText_(offscreen);
  const whole = cleanText_(firstMatch_(html, /a-price-whole">([^<]+)/i)).replace(/[.,]$/, '');
  return whole ? `¥${whole}` : '';
}

function amazonProductStockState_(html) {
  if (/<input[^>]*(?:id=["']add-to-cart-button["']|name=["']submit\.add-to-cart["'])/i.test(html)) {
    return 'IN_STOCK';
  }
  const avail = firstMatch_(html, /id=["']availability(?:InsideBuyBox)?_feature_div["'][^>]*>([\s\S]{0,5000})/i)
    || firstMatch_(html, /id=["']availability["'][^>]*>([\s\S]{0,2500})/i);
  const availText = htmlToText_(avail);
  if (/現在在庫切れ|Currently unavailable|この商品は現在お取り扱いできません/i.test(availText)) {
    return 'OUT_OF_STOCK';
  }
  if (/在庫あり|カートに入れる|通常\d/i.test(availText)) return 'IN_STOCK';
  const text = htmlToText_(html);
  if (/現在在庫切れです|Currently unavailable/i.test(text) && !/<input[^>]*id=["']add-to-cart-button["']/i.test(html)) {
    return 'OUT_OF_STOCK';
  }
  return 'UNKNOWN';
}

function formatAmazonSummary_(product, filter) {
  const filterText = filter.matched
    ? 'filters matched'
    : `filters missed (${filter.reasons.join('; ')})`;
  return `Amazon product ${product.productId}: ${product.stockState}; ${product.name || 'name not parsed'}; ${product.price || 'price not parsed'}; ${filterText}.`;
}

function formatAmazonTelegram_(product, kind, searchPath) {
  const name = product.name && !amazonLooksLikeUrl_(product.name)
    ? product.name
    : `ASIN ${product.productId}`;
  return formatUserStockTelegram_('Amazon', kind, name, product, canonicalAmazonProductUrl_(product.productId));
}

function formatAmazonSearchSummary_(listing, matched) {
  const path = listing.path || 'Amazon.co.jp search';
  if (listing.empty) {
    return `${path}: 0 results parsed (${listing.emptyReason || 'empty'}).`;
  }
  return `${path}: ${listing.products.length} results, ${matched.length} matched filters. ${formatQuantityPreview_(listing.products)}`;
}

function getSelectedRule_() {
  const sheet = SpreadsheetApp.getActiveSheet();
  if (sheet.getName() !== SHEETS.RULES || sheet.getActiveRange().getRow() < 2) {
    throw new Error('Select one data row in the Watch Rules sheet first.');
  }
  const row = sheet.getActiveRange().getRow();
  const values = sheet.getRange(row, 1, 1, RULE_HEADERS.length).getValues()[0];
  const rule = ruleFromRow_(row, values);
  if (!/^https:\/\//i.test(rule.url)) throw new Error('Enter a complete https:// URL.');
  return rule;
}

function ruleFromRow_(row, values) {
  return {
    row,
    enabled: values[0] === true,
    platform: String(values[1] || ''),
    url: String(values[2] || '').trim(),
    includeKeywords: String(values[3] || ''),
    excludeKeywords: String(values[4] || ''),
    maxPrice: String(values[5] || ''),
    notifyWhen: String(values[6] || ''),
    lastChecked: values[7],
    status: String(values[8] || ''),
  };
}

function appendDiagnostic_(platform, url, result, summary) {
  const diagnostics = SpreadsheetApp.getActive().getSheetByName(SHEETS.DIAGNOSTICS);
  diagnostics.appendRow([new Date(), platform, url, result.statusCode, result.contentType,
    result.bytes, result.signals.join(', ') || 'None', summary]);
}

function updateRuleCheck_(row, status) {
  SpreadsheetApp.getActive().getSheetByName(SHEETS.RULES)
    .getRange(row, 8, 1, 2).setValues([[new Date(), status]]);
}

function telegramSkipNote_(product, filter) {
  if (product.stockState !== 'IN_STOCK') {
    return `${product.productId} ${product.stockState || 'UNKNOWN'}`;
  }
  return `${product.productId} filters missed (${filter.reasons.join('; ')})`;
}

function formatUserStockTelegram_(shop, kind, name, product, url) {
  const title = kind === 'new' ? `${shop} 上架` : kind === 'restock' ? `${shop} 補貨` : `${shop} 有貨`;
  const details = [
    product.price || '',
    hasQuantity_(product) ? `庫存 ${product.quantity}` : '',
  ].filter(Boolean).join(' · ');
  return [title, name, details, url].filter(Boolean).join('\n');
}

function hasQuantity_(product) {
  return product && product.quantity !== undefined && product.quantity !== null && product.quantity !== '';
}

function stockPart_(raw) {
  return String(raw || '').split('|')[0];
}

function packedState_(product) {
  return hasQuantity_(product) ? `${product.stockState}|${product.quantity}` : product.stockState;
}

function formatQuantityPreview_(products) {
  const list = products || [];
  const inStock = list.filter((product) => product.stockState === 'IN_STOCK').length;
  const preview = list.slice(0, 6).map((product) => {
    const qty = hasQuantity_(product) ? ` qty=${product.quantity}` : '';
    return `${product.productId}:${product.stockState}${qty}`;
  }).join('; ');
  const extra = list.length > 6 ? `; +${list.length - 6} more` : '';
  return `in stock ${inStock}. ${preview}${extra}`;
}

function formatInStockFilterNote_(summary, previousRaw, product, filter) {
  if (product.stockState === 'IN_STOCK' && !filter.matched) {
    return `${summary} In stock seen but filters did not match, so no Telegram was sent.`;
  }
  if (product.stockState !== 'IN_STOCK') {
    return `${summary} No Telegram (${product.stockState || 'UNKNOWN'}).`;
  }
  return summary;
}

function recordAndNotifyInStock_(props, stateKey, product, filter, telegramFactory) {
  const previousRaw = props.getProperty(stateKey);
  upsertProductSnapshot_(product);
  let notified = 0;
  if (filter.matched && product.stockState === 'IN_STOCK') {
    const previousStock = stockPart_(previousRaw);
    const kind = previousStock !== 'IN_STOCK' ? (previousStock ? 'restock' : 'new') : 'in_stock';
    const result = sendTelegram_(telegramFactory(kind));
    if (!result.ok) throw new Error(`Telegram: ${result.message}`);
    notified = 1;
  }
  if (product.stockState !== 'UNKNOWN' && packedState_(product) !== previousRaw) {
    props.setProperty(stateKey, packedState_(product));
  }
  return notified;
}

function ensureProductsSheet_(ss) {
  const sheet = (ss || SpreadsheetApp.getActive()).getSheetByName(SHEETS.PRODUCTS);
  if (!sheet) return sheet;
  const lastCol = Math.max(sheet.getLastColumn(), PRODUCT_HEADERS.length);
  const header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  if (header[6] === 'Stock state' && header[7] === 'Hash') {
    sheet.insertColumnAfter(7);
  }
  sheet.getRange(1, 1, 1, PRODUCT_HEADERS.length).setValues([PRODUCT_HEADERS]).setFontWeight('bold');
  return sheet;
}

let productRowIndexCache_ = null;

function resetProductRowIndex_() {
  productRowIndexCache_ = null;
}

function loadProductRowIndex_(sheet) {
  if (productRowIndexCache_) return productRowIndexCache_;
  productRowIndexCache_ = {};
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return productRowIndexCache_;
  const rows = sheet.getRange(2, 1, lastRow - 1, PRODUCT_HEADERS.length).getValues();
  for (let i = 0; i < rows.length; i++) {
    const platform = String(rows[i][2] || '').toLowerCase();
    const url = String(rows[i][4] || '');
    const hash = String(rows[i][8] || rows[i][7] || '');
    const productId = hash.split(':')[0];
    const rowNumber = i + 2;
    if (productId) productRowIndexCache_[`${platform}|id|${productId}`] = rowNumber;
    if (url) productRowIndexCache_[`${platform}|url|${url}`] = rowNumber;
  }
  return productRowIndexCache_;
}

function upsertProductSnapshot_(product) {
  const sheet = ensureProductsSheet_();
  const qty = hasQuantity_(product) ? product.quantity : '';
  const now = new Date();
  const platform = product.platform || 'Momo';
  const hash = `${product.productId}:${product.stockState}:${product.price}:${qty}`;
  const index = loadProductRowIndex_(sheet);
  const keyId = `${String(platform).toLowerCase()}|id|${product.productId}`;
  const keyUrl = `${String(platform).toLowerCase()}|url|${product.url}`;
  const row = index[keyId] || index[keyUrl] || 0;
  if (row) {
    const firstSeen = sheet.getRange(row, 1).getValue() || now;
    sheet.getRange(row, 1, 1, PRODUCT_HEADERS.length).setValues([[
      firstSeen, now, platform, product.name, product.url, product.price,
      product.stockState, qty, hash,
    ]]);
    index[keyId] = row;
    index[keyUrl] = row;
    return;
  }
  sheet.appendRow([
    now, now, platform, product.name, product.url, product.price,
    product.stockState, qty, hash,
  ]);
  const newRow = sheet.getLastRow();
  index[keyId] = newRow;
  index[keyUrl] = newRow;
}

function readMetaContent_(html, name) {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp('<meta[^>]+(?:name|property)=["\']' + escaped + '["\'][^>]+content=["\']([^"\']+)["\']', 'i'),
    new RegExp('<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:name|property)=["\']' + escaped + '["\']', 'i'),
  ];
  for (let i = 0;  i < patterns.length; i++) {
    const match = String(html || '').match(patterns[i]);
    if (match) return htmlDecode_(match[1]);
  }
  return '';
}

function matchesAnyKeyword_(text, csv, requireCsv) {
  const keywords = splitCsv_(csv);
  if (!keywords.length) return !requireCsv;
  const hay = String(text || '').toLowerCase();
  return keywords.some((keyword) => hay.indexOf(keyword.toLowerCase()) !== -1);
}

function splitCsv_(csv) {
  return String(csv || '').split(/[,，]/).map((part) => part.trim()).filter(Boolean);
}

function parsePriceNumber_(value) {
  const match = String(value || '').replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 0;
}

function cleanProductName_(value) {
  return cleanText_(String(value || '').replace(/\s*-\s*momo[\s\S]*$/i, ''));
}

function firstMatch_(text, pattern) {
  const match = String(text || '').match(pattern);
  return match ? match[1] : '';
}

function htmlToText_(html) {
  return htmlDecode_(String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' '));
}

function htmlDecode_(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
}

function cleanText_(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function sendTelegram_(text) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('TELEGRAM_BOT_TOKEN');
  const chatId = props.getProperty('TELEGRAM_CHAT_ID');
  if (!token || !chatId) {
    return { ok: false, message: 'Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID Script Property.' };
  }
  const response = UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: false }),
    muteHttpExceptions: true,
  });
  const json = JSON.parse(response.getContentText() || '{}');
  return json.ok
    ? { ok: true }
    : { ok: false, message: json.description || `HTTP ${response.getResponseCode()}` };
}

function getOrCreateSheet_(ss, name, headers) {
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  sheet.autoResizeColumns(1, headers.length);
  return sheet;
}

function toQueryString_(params) {
  return Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');
}
