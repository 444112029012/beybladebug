import { fetchAllJson, fetchJson } from '../http.js';
import { cleanText, firstMatch, toQueryString } from '../util.js';

const ORIGIN = 'https://mmtoyshop.com';
const MAX_PAGES = 5;
const SLUG = '🌀戰鬥陀螺';
const JSON_HEADERS = { Referer: `${ORIGIN}/` };

export function isMmPlatform(platform) {
  return /^(mm|mm小舖|m\.?m\s*小舖|mmtoyshop)$/i.test(String(platform || '').trim());
}

function decodeComponent(value) {
  try {
    return decodeURIComponent(String(value || '').replace(/\+/g, ' '));
  } catch (error) {
    return String(value || '');
  }
}

export function parseMmProductHandle(url) {
  const text = String(url || '');
  if (/https?:\/\//i.test(text) && !/mmtoyshop\.com/i.test(text)) return '';
  return firstMatch(text, /\/(?:item|products)\/([^/?#]+)/i);
}

export function parseMmListing(url) {
  const text = String(url || '').trim();
  if (!/mmtoyshop\.com/i.test(text)) return null;
  if (parseMmProductHandle(text)) return null;
  const keyword = firstMatch(text, /[?&]keyword=([^&]+)/i);
  if (keyword) {
    const decoded = decodeComponent(keyword);
    return { kind: 'search', keyword: decoded, slug: '', path: `MM 小舖搜尋 ${decoded}` };
  }
  const slug = firstMatch(text, /\/category\/([^/?#]+)/i);
  if (!slug || /^query$/i.test(slug)) return null;
  const decoded = decodeComponent(slug);
  return {
    kind: 'category',
    keyword: '',
    slug: decoded,
    path: decoded === SLUG ? 'MM 小舖 > 🌀 戰鬥陀螺' : `MM 小舖 > ${decoded}`,
  };
}

function listingQueryUrl(listing, page) {
  if (listing.kind === 'search') {
    return `${ORIGIN}/category/query?${toQueryString({ keyword: listing.keyword, page })}`;
  }
  const base = `${ORIGIN}/category/query/${encodeURIComponent(listing.slug)}`;
  return page > 1 ? `${base}?page=${page}` : base;
}

function specName(spec) {
  return String((spec && (spec.option_name || spec.size_name || spec.name)) || '');
}

function trackedSpecs(item) {
  const specs = (item && item.specs) || [];
  if (!specs.length) return null;
  return specs.filter((spec) => /不補/.test(specName(spec)) && !/客訂/.test(specName(spec)));
}

function mmQuantity(item) {
  const tracked = trackedSpecs(item);
  if (tracked) {
    if (!tracked.length) return 0;
    let total = 0;
    let counted = false;
    tracked.forEach((spec) => {
      const qty = Number(spec.quantity);
      if (!Number.isNaN(qty)) {
        counted = true;
        total += qty;
      }
    });
    return counted ? total : 0;
  }
  const qty = Number(item && item.quantity);
  return Number.isNaN(qty) ? '' : qty;
}

function mmPrice(item) {
  const price = item && (item.shownPrice !== undefined && item.shownPrice !== null && item.shownPrice !== ''
    ? item.shownPrice
    : item.price);
  return price !== undefined && price !== null && price !== '' ? `NT$${price}` : '';
}

function mmStockState(item) {
  const qty = mmQuantity(item);
  const restocking = /補貨中/.test(cleanText(item && item.soldout_hint));
  if (restocking || qty === '' || Number(qty) <= 0) return 'OUT_OF_STOCK';
  return 'IN_STOCK';
}

function itemToProduct(item) {
  const prod = (item && item.prod) || item || {};
  const handle = String(prod.route || '').trim();
  const productId = String(prod.id || handle || '');
  if (!productId) return null;
  return {
    platform: 'MM',
    productId,
    url: handle ? `${ORIGIN}/item/${handle}` : `${ORIGIN}/category/${encodeURIComponent(SLUG)}`,
    name: cleanText(prod.title || ''),
    price: mmPrice(prod),
    quantity: mmQuantity(prod),
    stockState: mmStockState(prod),
  };
}

export async function fetchMmListing(rule) {
  const listing = parseMmListing(rule.url);
  if (!listing) throw new Error('Not an MM category or search URL');
  const first = await fetchJson(listingQueryUrl(listing, 1), { headers: JSON_HEADERS });
  const lastPage = Math.min(Number(first.json && first.json.lastPage) || 1, MAX_PAGES);
  const pageJsons = [first.json];
  if (lastPage > 1) {
    const urls = [];
    for (let page = 2; page <= lastPage; page += 1) urls.push(listingQueryUrl(listing, page));
    const rest = await fetchAllJson(urls, { headers: JSON_HEADERS });
    rest.forEach((fetched) => pageJsons.push(fetched.json));
  }
  const products = [];
  const seen = {};
  pageJsons.forEach((pageJson) => {
    ((pageJson && pageJson.products) || []).forEach((item) => {
      const product = itemToProduct(item);
      if (!product || seen[product.productId]) return;
      seen[product.productId] = true;
      products.push(product);
    });
  });
  return { path: listing.path, products, empty: products.length === 0 };
}

export async function fetchMmProduct(url) {
  const handle = parseMmProductHandle(url);
  if (!handle) throw new Error('Not an MM product URL');
  const fetched = await fetchJson(`${ORIGIN}/item/query/${encodeURIComponent(handle)}`, { headers: JSON_HEADERS });
  const product = itemToProduct((fetched.json && fetched.json.response) || fetched.json || {});
  if (!product) throw new Error(`MM JSON missing ${handle}`);
  return product;
}

export async function runMmRule(rule) {
  if (parseMmListing(rule.url)) {
    const listing = await fetchMmListing(rule);
    return { kind: 'listing', path: listing.path, products: listing.products, empty: listing.empty };
  }
  if (parseMmProductHandle(rule.url)) {
    return { kind: 'product', products: [await fetchMmProduct(rule.url)] };
  }
  throw new Error('MM URL must be a category, search, or item page');
}
