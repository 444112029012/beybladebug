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

export const NOTIFY_QTY_DROP = 30;

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
  const title = kind === 'new' ? `${shop} 上架`
    : kind === 'restock' ? `${shop} 補貨`
      : kind === 'qty_drop' ? `${shop} 庫存下降`
        : `${shop} 有貨`;
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
