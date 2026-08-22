import { fetchAllJson, fetchJson } from '../http.js';
import { cleanText, firstMatch, toQueryString } from '../util.js';

const ORIGIN = 'https://shop.funbox.com.tw';
const LIMIT = 48;
const MAX_PAGES = 3;
const DEFAULT_COLLECTIONS = ['XIKBXA', 'XIKBXB', 'XIKBXC', 'XIKBXD', 'XIKBXP', 'XIKBBB', 'XIKBAA', 'XIKBCC', 'XIKBCD', 'KB2X'];

const JSON_HEADERS = {
  Referer: `${ORIGIN}/`,
};

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

function productsUrl(path, page) {
  return `${ORIGIN}/category_products/${path}.json?${toQueryString({
    limit: LIMIT,
    page,
    sort_by: 'sell_from-desc',
  })}`;
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
  const handle = parseFunboxProductHandle(item && item.url)
    || String((item && item.handle) || fallbackHandle || '').replace(/\.json$/i, '');
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

async function listingPaths(category) {
  const paths = [category.path];
  if (!category.expandCollections) return paths;
  let collections = DEFAULT_COLLECTIONS;
  try {
    const fetched = await fetchJson(`${ORIGIN}/categories.json`, { headers: JSON_HEADERS });
    const parts = category.path.split('/').filter(Boolean);
    let nodes = Array.isArray(fetched.json) ? fetched.json : [];
    let node = null;
    parts.forEach((handle) => {
      const list = node ? (node.children_categories || []) : nodes;
      node = list.find((item) => String(item.handle) === handle) || null;
    });
    if (node && node.collections && node.collections.length) {
      collections = node.collections.map((item) => String(item.handle || '')).filter(Boolean);
    }
  } catch (error) {
    // Keep the known XI/KB collection list.
  }
  collections.forEach((handle) => {
    const child = `${category.path}/${handle}`;
    if (!paths.includes(child)) paths.push(child);
  });
  return paths;
}

export async function fetchFunboxCategory(rule) {
  const category = parseFunboxCategory(rule.url);
  if (!category) throw new Error('Not a Funbox category URL');
  const paths = await listingPaths(category);
  const products = [];
  const seen = {};
  let pending = paths.map((path) => ({ path, page: 1 }));
  while (pending.length) {
    const urls = pending.map((job) => productsUrl(job.path, job.page));
    const fetchedList = await fetchAllJson(urls, { headers: JSON_HEADERS });
    const nextPending = [];
    fetchedList.forEach((fetched, index) => {
      const items = Array.isArray(fetched.json) ? fetched.json : [];
      items.forEach((item) => {
        const product = itemToProduct(item, '');
        if (!product || seen[product.productId]) return;
        seen[product.productId] = true;
        products.push(product);
      });
      const job = pending[index];
      if (items.length >= LIMIT && job.page < MAX_PAGES) {
        nextPending.push({ path: job.path, page: job.page + 1 });
      }
    });
    pending = nextPending;
  }
  return { path: category.name, products, empty: products.length === 0 };
}

export async function fetchFunboxProduct(url) {
  const handle = parseFunboxProductHandle(url);
  if (!handle) throw new Error('Not a Funbox product URL');
  const fetched = await fetchJson(`${canonicalProductUrl(handle)}.json`, { headers: JSON_HEADERS });
  const product = itemToProduct(fetched.json || {}, handle);
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
