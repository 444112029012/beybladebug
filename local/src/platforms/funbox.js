import { fetchJson } from '../http.js';
import { cleanText, firstMatch } from '../util.js';

const ORIGIN = 'https://shop.funbox.com.tw';

const JSON_HEADERS = {
  Referer: `${ORIGIN}/`,
};

export function funboxCategoryJsonUrl(path) {
  return `${ORIGIN}/categories/${String(path || '').replace(/^\/+|\/+$/g, '')}.json`;
}

export function parseFunboxCategory(url) {
  const text = String(url || '');
  if (!/shop\.funbox\.com\.tw/i.test(text)) return null;
  const path = firstMatch(text, /\/categories\/([A-Za-z0-9/_-]+)/i);
  if (!path) return null;
  const cleanPath = path.replace(/\/+$/, '').replace(/\.json$/i, '');
  return {
    path: cleanPath,
    url: `${ORIGIN}/categories/${cleanPath}`,
    name: cleanPath === 'XI/KB' ? 'Funbox 直營 > 對戰‧競技 > 戰鬥陀螺' : `Funbox 直營 ${cleanPath}`,
    expandCollections: cleanPath === 'XI/KB',
  };
}

export function parseFunboxProductHandle(url) {
  const text = String(url || '');
  const handle = firstMatch(text, /\/products\/([A-Za-z0-9_-]+)/i);
  if (!handle) return '';
  if (/https?:\/\//i.test(text) && !/shop\.funbox\.com\.tw/i.test(text)) return '';
  return handle.replace(/\.json$/i, '');
}

function canonicalProductUrl(handle) {
  return `${ORIGIN}/products/${handle}`;
}

function handleFromItem(item, fallbackHandle) {
  const fromUrl = parseFunboxProductHandle(item && item.url);
  if (fromUrl) return fromUrl;
  if (item && item.handle) return String(item.handle).replace(/\.json$/i, '');
  if (item && item.full_handle) {
    const parts = String(item.full_handle).split('/').filter(Boolean);
    return (parts[parts.length - 1] || '').replace(/\.json$/i, '');
  }
  return String(fallbackHandle || '').replace(/\.json$/i, '');
}

function quantity(item) {
  const variants = (item && item.variants) || [];
  let total = 0;
  let tracked = false;
  variants.forEach((variant) => {
    const qty = Number(variant.inventory_quantity);
    if (!Number.isNaN(qty)) {
      tracked = true;
      total += qty;
    }
  });
  return tracked ? total : '';
}

function stockState(item) {
  if (item && item.available === true) return 'IN_STOCK';
  if (item && item.available === false) return 'OUT_OF_STOCK';
  const variants = (item && item.variants) || [];
  let inStock = false;
  let tracked = false;
  variants.forEach((variant) => {
    const qty = Number(variant.inventory_quantity);
    const policy = String(variant.inventory_policy || '').toLowerCase();
    if (!Number.isNaN(qty)) tracked = true;
    if (qty > 0 || policy === 'continue') inStock = true;
  });
  if (inStock) return 'IN_STOCK';
  if (tracked) return 'OUT_OF_STOCK';
  return 'UNKNOWN';
}

function itemToProduct(item, fallbackHandle) {
  const handle = handleFromItem(item, fallbackHandle);
  if (!handle) return null;
  const price = item.price || (item.variants && item.variants[0] && item.variants[0].price);
  const qty = quantity(item);
  return {
    platform: 'Funbox',
    productId: handle,
    url: canonicalProductUrl(handle),
    name: cleanText(item.title || ''),
    price: price !== undefined && price !== null && price !== '' ? `NT$${price}` : '',
    quantity: qty,
    stockState: stockState(item),
  };
}

function listingItems(json) {
  if (Array.isArray(json)) return json;
  if (json && Array.isArray(json.products)) return json.products;
  if (json && Array.isArray(json.items)) return json.items;
  return [];
}

export async function fetchFunboxCategory(rule) {
  const category = parseFunboxCategory(rule.url);
  if (!category) throw new Error('Not a Funbox category URL');
  const fetched = await fetchJson(funboxCategoryJsonUrl(category.path), { headers: JSON_HEADERS });
  const products = [];
  const seen = {};
  listingItems(fetched.json).forEach((item) => {
    const product = itemToProduct(item, '');
    if (!product || seen[product.productId]) return;
    seen[product.productId] = true;
    products.push(product);
  });
  return { path: category.name, products, empty: products.length === 0 };
}

export async function fetchFunboxProduct(url) {
  const handle = parseFunboxProductHandle(url);
  if (!handle) throw new Error('Not a Funbox product URL');
  const fetched = await fetchJson(`${canonicalProductUrl(handle)}.json`, { headers: JSON_HEADERS });
  const json = fetched.json || {};
  const product = itemToProduct(json.product || json, handle);
  if (!product) throw new Error(`Funbox JSON missing ${handle}`);
  return product;
}

export async function runFunboxRule(rule) {
  if (parseFunboxCategory(rule.url)) {
    const listing = await fetchFunboxCategory(rule);
    return { kind: 'listing', path: listing.path, products: listing.products, empty: listing.empty };
  }
  if (parseFunboxProductHandle(rule.url)) {
    return { kind: 'product', products: [await fetchFunboxProduct(rule.url)] };
  }
  throw new Error('Funbox URL must be a category or product page');
}
