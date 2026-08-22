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

export function stockPart(raw) {
  return String(raw || '').split('|')[0];
}

export function packedState(product) {
  return hasQuantity(product) ? `${product.stockState}|${product.quantity}` : product.stockState;
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
  return { matched: reasons.length === 0, reasons };
}

export function formatStockMessage(shop, kind, name, product, url) {
  const title = kind === 'new' ? `${shop} 上架` : kind === 'restock' ? `${shop} 補貨` : `${shop} 有貨`;
  const details = [
    product.price || '',
    hasQuantity(product) ? `庫存 ${product.quantity}` : '',
  ].filter(Boolean).join(' · ');
  return [title, name, details, url].filter(Boolean).join('\n');
}

export function stamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}
