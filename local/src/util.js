export function firstMatch(text, pattern) {
  const match = String(text || '').match(pattern);
  return match ? match[1] : '';
}

export function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function htmlDecode(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

export function htmlToText(html) {
  return htmlDecode(String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' '));
}

export function splitCsv(csv) {
  return String(csv || '').split(/[,，]/).map((part) => part.trim()).filter(Boolean);
}

export function matchesAnyKeyword(text, csv, requireCsv) {
  const keywords = splitCsv(csv);
  if (!keywords.length) return !requireCsv;
  const hay = String(text || '').toLowerCase();
  return keywords.some((keyword) => hay.includes(keyword.toLowerCase()));
}

export function parsePriceNumber(value) {
  const match = String(value || '').replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 0;
}

export function toQueryString(params) {
  return Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');
}

export function hasQuantity(product) {
  return product && product.quantity !== undefined && product.quantity !== null && product.quantity !== '';
}

export function applyQuantityStockGuard(product) {
  if (!product) return product;
  if (hasQuantity(product) && Number(product.quantity) <= 0 && product.stockState === 'IN_STOCK') {
    product.stockState = 'OUT_OF_STOCK';
  }
  return product;
}

export function isPurchasable(product) {
  applyQuantityStockGuard(product);
  return !!(product && product.stockState === 'IN_STOCK');
}

export function stockPart(raw) {
  return String(raw || '').split('|')[0];
}

export function quantityPart(raw) {
  const parts = String(raw || '').split('|');
  if (parts.length < 2 || parts[1] === '') return '';
  const qty = Number(parts[1]);
  return Number.isFinite(qty) ? qty : '';
}

export function packedState(product) {
  applyQuantityStockGuard(product);
  return hasQuantity(product) ? `${product.stockState}|${product.quantity}` : product.stockState;
}

function snapshotNumber(value) {
  if (value === undefined || value === null || value === '') return '';
  const qty = Number(value);
  return Number.isFinite(qty) ? qty : '';
}

export function readSnapshot(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const quantity = snapshotNumber(raw.quantity);
    const notifyQuantity = raw.notifyQuantity === undefined || raw.notifyQuantity === ''
      ? quantity
      : snapshotNumber(raw.notifyQuantity);
    return {
      stockState: String(raw.stockState || ''),
      quantity,
      notifyQuantity,
      name: String(raw.name || ''),
      url: String(raw.url || ''),
    };
  }
  const text = String(raw || '');
  if (!text) return { stockState: '', quantity: '', notifyQuantity: '', name: '', url: '' };
  const quantity = quantityPart(text);
  return {
    stockState: stockPart(text),
    quantity,
    notifyQuantity: quantity,
    name: '',
    url: '',
  };
}

export function writeSnapshot(product, previousRaw, notified) {
  applyQuantityStockGuard(product);
  const prev = readSnapshot(previousRaw);
  const quantity = hasQuantity(product) ? snapshotNumber(product.quantity) : '';
  let notifyQuantity = prev.notifyQuantity;
  if (notified && quantity !== '') notifyQuantity = quantity;
  else if (notifyQuantity === '' && quantity !== '') notifyQuantity = quantity;
  if (product.stockState && product.stockState !== 'IN_STOCK') notifyQuantity = quantity;
  return {
    stockState: product.stockState,
    quantity,
    notifyQuantity,
    name: product.name || prev.name || '',
    url: product.url || prev.url || '',
    updatedAt: new Date().toISOString(),
  };
}

export const NOTIFY_QTY_DROP = 50;

export function quantityDrop(previousQuantity, currentQuantity) {
  const prev = Number(previousQuantity);
  const cur = Number(currentQuantity);
  if (!Number.isFinite(prev) || !Number.isFinite(cur)) return 0;
  return prev - cur;
}

export function isFunboxAppTicket(product) {
  if (!product || product.platform !== 'Funbox') return false;
  return /APP兌換|交換票券|購買票券/.test(String(product.name || ''));
}

export function shouldNotifyStock(product, kind, options = {}) {
  if (kind !== 'in_stock') return true;
  if (quantityDrop(options.previousQuantity, options.currentQuantity) >= NOTIFY_QTY_DROP) return true;
  return options.notifyEveryInStock === true;
}

export function notifyKindForStock(kind, options = {}) {
  if (kind === 'in_stock' && quantityDrop(options.previousQuantity, options.currentQuantity) >= NOTIFY_QTY_DROP) {
    return 'qty_drop';
  }
  return kind;
}

export function applyFilters(product, rule) {
  const reasons = [];
  if (!matchesAnyKeyword(product.name, rule.include, false)) {
    reasons.push('name does not match include keywords');
  }
  if (matchesAnyKeyword(product.name, rule.exclude, true)) {
    reasons.push('name matches exclude keywords');
  }
  const maxPrice = parsePriceNumber(rule.maxPrice);
  const price = parsePriceNumber(product.price);
  if (maxPrice && price && price > maxPrice) {
    reasons.push(`price ${product.price} exceeds maximum ${maxPrice}`);
  }
  if (product.platform === 'Momo' && product.isFunboxOfficial === false && product.stockState !== 'UNLISTED') {
    reasons.push('not Funbox 品牌旗艦店');
  }
  return { matched: reasons.length === 0, reasons };
}

export function formatStockMessage(shop, kind, name, product, url, extra = {}) {
  const title = kind === 'new' ? `[local] ${shop} 上架`
    : kind === 'restock' ? `[local] ${shop} 補貨`
      : kind === 'qty_drop' ? `[local] ${shop} 庫存下降`
        : `[local] ${shop} 有貨`;
  const drop = quantityDrop(extra.previousQuantity, product && product.quantity);
  const qtyText = kind === 'qty_drop' && hasQuantity(product) && drop > 0
    ? `庫存 ${extra.previousQuantity} → ${product.quantity}（-${drop}）`
    : hasQuantity(product) ? `庫存 ${product.quantity}` : '';
  const details = [
    product.price || '',
    qtyText,
  ].filter(Boolean).join(' · ');
  return [title, name, details, url].filter(Boolean).join('\n');
}

export function stamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

export const TELEGRAM_MAX_CHARS = 3900;

export function splitTelegramText(text, max = TELEGRAM_MAX_CHARS) {
  const value = String(text || '');
  if (!value) return [''];
  if (value.length <= max) return [value];
  const chunks = [];
  let rest = value;
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n\n', max);
    if (cut < max * 0.4) cut = rest.lastIndexOf('\n', max);
    if (cut < max * 0.4) cut = max;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

export function shopLabel(platform) {
  const value = String(platform || '').toLowerCase();
  if (value === 'funbox') return 'Funbox';
  if (value === 'amazon') return 'Amazon';
  if (value === 'mm' || value === 'mm小舖') return 'MM小舖';
  return 'momo';
}

export function inventoryRowsFromState(state) {
  const values = (state && state.values) || {};
  return Object.keys(values).map((key) => {
    const snap = readSnapshot(values[key]);
    const parts = String(key || '').split('|');
    const platform = parts[0] || '';
    const productId = parts.slice(1).join('|');
    return {
      platform,
      productId,
      name: snap.name || `商品 ${productId}`,
      url: snap.url || '',
      quantity: snap.quantity,
      stockState: snap.stockState,
      shop: shopLabel(platform),
    };
  }).filter((row) => row.stockState === 'IN_STOCK');
}

function shopSortKey(shop) {
  const order = { momo: 1, Funbox: 2, MM小舖: 3, Amazon: 4 };
  return order[shop] || 9;
}

export function formatInventoryText(rows, now = Date.now()) {
  const items = (rows || []).slice().sort((a, b) => {
    const shopCmp = shopSortKey(a.shop) - shopSortKey(b.shop);
    if (shopCmp) return shopCmp;
    const qtyA = Number(a.quantity);
    const qtyB = Number(b.quantity);
    if (Number.isFinite(qtyB) && Number.isFinite(qtyA) && qtyB !== qtyA) return qtyB - qtyA;
    return String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hant');
  });
  const lines = [
    'Beyblade 目前庫存',
    `現在：${stampFor(now)}`,
  ];
  if (!items.length) {
    lines.push('目前沒有有貨商品。');
    return lines.join('\n');
  }
  lines.push(`有貨 ${items.length} 件`);
  let shop = '';
  items.forEach((item) => {
    if (item.shop !== shop) {
      shop = item.shop;
      lines.push('', shop);
    }
    const qty = hasQuantity(item) ? `庫存 ${item.quantity}` : '有貨';
    lines.push(`· ${item.name}`);
    lines.push(`  ${qty}`);
    if (item.url) lines.push(`  ${item.url}`);
  });
  return lines.join('\n').slice(0, 12000);
}

function stampFor(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
