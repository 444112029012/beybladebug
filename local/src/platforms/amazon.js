import { fetchText } from '../http.js';
import { cleanText, firstMatch, htmlDecode, htmlToText } from '../util.js';

const ORIGIN = 'https://www.amazon.co.jp';
const MAX_PAGES = 2;
const HEADERS = {
  'Accept-Language': 'ja-JP,ja;q=0.9,en;q=0.8',
  Cookie: 'i18n-prefs=JPY; lc-acbjp=ja_JP',
  Referer: `${ORIGIN}/`,
};

export function parseAmazonAsin(url) {
  const text = String(url || '');
  if (/https?:\/\//i.test(text) && !/amazon\.co\.jp/i.test(text)) return '';
  return firstMatch(text, /\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/i);
}

export function parseAmazonSearch(url) {
  const text = String(url || '');
  if (!/amazon\.co\.jp/i.test(text)) return null;
  if (parseAmazonAsin(text)) return null;
  if (!/\/s(?:[/?]|$)/i.test(text)) return null;
  return {
    url: text,
    path: /ベイブレード|%E3%83%99%E3%82%A4%E3%83%96%E3%83%AC%E3%83%BC%E3%83%89/i.test(text)
      ? 'Amazon.co.jp おもちゃ > ベイブレードX'
      : 'Amazon.co.jp search',
  };
}

function canonicalUrl(asin) {
  return `${ORIGIN}/dp/${asin}`;
}

function looksLikeUrl(text) {
  return /https?:\/\/|\/dp\/|dib=|ref=sr_/i.test(text);
}

function searchUrlWithPage(url, page) {
  const cleaned = String(url || '')
    .replace(/([?&])page=\d+/ig, '$1')
    .replace(/[?&]$/, '')
    .replace(/&&+/g, '&')
    .replace(/\?&/, '?');
  if (page <= 1) return cleaned;
  return `${cleaned}${cleaned.includes('?') ? '&' : '?'}page=${page}`;
}

function searchTitle(block) {
  const candidates = [
    firstMatch(block, /<h2[^>]*aria-label="([^"]{5,200})"/i),
    firstMatch(block, /<h2[^>]*>[\s\S]*?<span[^>]*>([^<]{5,250})<\/span>/i),
    firstMatch(block, /alt="([^"]{5,200})"/i),
  ];
  for (const candidate of candidates) {
    const name = cleanText(htmlDecode(candidate));
    if (name && !looksLikeUrl(name)) return name;
  }
  return '';
}

function parseSearchResults(html) {
  const products = [];
  const re = /<div[^>]*role="listitem"[^>]*data-asin="([A-Z0-9]{10})"[^>]*data-component-type="s-search-result"/gi;
  const starts = [];
  let match;
  while ((match = re.exec(html))) {
    starts.push({ asin: match[1], index: match.index });
  }
  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i].index;
    const end = i + 1 < starts.length ? starts[i + 1].index : Math.min(html.length, start + 20000);
    const block = html.substring(start, end);
    const unavailable = /現在お取り扱いできません|Currently unavailable/i.test(block);
    const priceWhole = cleanText(firstMatch(block, /a-price-whole">([^<]+)/i)).replace(/[.,]$/, '');
    products.push({
      platform: 'Amazon',
      productId: starts[i].asin,
      url: canonicalUrl(starts[i].asin),
      name: searchTitle(block),
      price: priceWhole ? `¥${priceWhole}` : '',
      stockState: unavailable ? 'OUT_OF_STOCK' : 'IN_STOCK',
    });
  }
  return products;
}

function productName(html) {
  const title = firstMatch(html, /id="productTitle"[^>]*>([\s\S]*?)<\/span>/i)
    || firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  return cleanText(String(title || '').replace(/\s*:\s*Amazon\.co\.jp[\s\S]*$/i, '').replace(/\s*:\s*おもちゃ[\s\S]*$/i, ''));
}

function productPrice(html) {
  const offscreen = firstMatch(html, /class="a-offscreen">\s*(¥[^<]+)</i);
  if (offscreen) return cleanText(offscreen);
  const whole = cleanText(firstMatch(html, /a-price-whole">([^<]+)/i)).replace(/[.,]$/, '');
  return whole ? `¥${whole}` : '';
}

function productStock(html) {
  if (/<input[^>]*(?:id=["']add-to-cart-button["']|name=["']submit\.add-to-cart["'])/i.test(html)) {
    return 'IN_STOCK';
  }
  const avail = firstMatch(html, /id=["']availability(?:InsideBuyBox)?_feature_div["'][^>]*>([\s\S]{0,5000})/i)
    || firstMatch(html, /id=["']availability["'][^>]*>([\s\S]{0,2500})/i);
  const availText = htmlToText(avail);
  if (/現在在庫切れ|Currently unavailable|この商品は現在お取り扱いできません/i.test(availText)) {
    return 'OUT_OF_STOCK';
  }
  if (/在庫あり|カートに入れる|通常\d/i.test(availText)) return 'IN_STOCK';
  const text = htmlToText(html);
  if (/現在在庫切れです|Currently unavailable/i.test(text) && !/<input[^>]*id=["']add-to-cart-button["']/i.test(html)) {
    return 'OUT_OF_STOCK';
  }
  return 'UNKNOWN';
}

export async function fetchAmazonProduct(url) {
  const asin = parseAmazonAsin(url);
  if (!asin) throw new Error('Not an amazon.co.jp product URL');
  const canonical = canonicalUrl(asin);
  const fetched = await fetchText(canonical, { headers: HEADERS });
  const name = productName(fetched.text);
  return {
    platform: 'Amazon',
    productId: asin,
    url: canonical,
    name,
    price: productPrice(fetched.text),
    stockState: productStock(fetched.text),
  };
}

export async function fetchAmazonSearch(rule) {
  const search = parseAmazonSearch(rule.url);
  if (!search) throw new Error('Not an amazon.co.jp search URL');
  const urls = Array.from({ length: MAX_PAGES }, (_, i) => searchUrlWithPage(search.url, i + 1));
  const pages = await Promise.all(urls.map((url) => fetchText(url, { headers: HEADERS })));
  const products = [];
  const seen = {};
  pages.forEach((fetched) => {
    parseSearchResults(fetched.text).forEach((product) => {
      if (seen[product.productId]) return;
      seen[product.productId] = true;
      products.push(product);
    });
  });
  return { path: search.path, products, empty: products.length === 0 };
}

export function amazonDisplayName(product) {
  return product.name && !looksLikeUrl(product.name) ? product.name : `ASIN ${product.productId}`;
}

export async function runAmazonRule(rule) {
  if (parseAmazonSearch(rule.url)) {
    const listing = await fetchAmazonSearch(rule);
    return { kind: 'listing', path: listing.path, products: listing.products, empty: listing.empty };
  }
  if (parseAmazonAsin(rule.url)) {
    return { kind: 'product', products: [await fetchAmazonProduct(rule.url)] };
  }
  throw new Error('Amazon URL must be a search or dp page');
}
