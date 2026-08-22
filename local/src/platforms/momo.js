import { fetchJson, fetchText } from '../http.js';
import { cleanText, firstMatch, htmlToText, parsePriceNumber } from '../util.js';

const CATEGORY_API = 'https://www.momoshop.com.tw/api/moecapp/getCategoryGoodsV3';
const MAX_PAGES = 5;

export function parseMomoCategory(url) {
  const text = String(url || '');
  if (!/momoshop\.com\.tw/i.test(text)) return null;
  const cateCode = firstMatch(text, /\/categories\/(\d+)/i)
    || firstMatch(text, /[?&]d_code=(\d+)/i)
    || firstMatch(text, /[?&]m_code=(\d+)/i)
    || firstMatch(text, /[?&]l_code=(\d+)/i);
  if (!cateCode) return null;
  return {
    cateCode,
    cateLevel: '3',
    path: cateCode === '2186500036' ? 'funbox toys > 兒童玩具 > 戰鬥陀螺' : `momo category ${cateCode}`,
    url: `https://www.momoshop.com.tw/categories/${cateCode}`,
  };
}

export function parseMomoProductId(url) {
  const text = String(url || '');
  if (!/momoshop\.com\.tw/i.test(text)) return '';
  return firstMatch(text, /\/product\/(\d+)/i)
    || firstMatch(text, /[?&]i_code=(\d+)/i)
    || firstMatch(text, /[?&]goodsCode=(\d+)/i);
}

export function canonicalMomoProductUrl(productId) {
  return `https://www.momoshop.com.tw/product/${productId}`;
}

function momoHeaders(referer) {
  return {
    Accept: 'application/json, text/plain, */*',
    Origin: 'https://www.momoshop.com.tw',
    Referer: referer,
  };
}

function payload(cateCode, cateLevel, page) {
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

function itemToProduct(item, category) {
  const productId = String((item && item.goodsCode) || '').trim();
  if (!/^\d+$/.test(productId)) return null;
  const stockValue = parsePriceNumber(item.goodsStock);
  return {
    platform: 'Momo',
    productId,
    url: canonicalMomoProductUrl(productId),
    name: cleanText(item.goodsName),
    price: item.goodsPrice ? `NT$${item.goodsPrice}` : '',
    quantity: item.goodsStock === undefined || item.goodsStock === null || item.goodsStock === '' ? '' : stockValue,
    stockState: 'IN_STOCK',
  };
}

async function fetchCategoryPage(category, page) {
  const fetched = await fetchJson(CATEGORY_API, {
    method: 'POST',
    headers: {
      ...momoHeaders(category.url),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload(category.cateCode, category.cateLevel, page)),
  });
  return fetched.json;
}

export async function fetchMomoCategory(rule) {
  const category = parseMomoCategory(rule.url);
  if (!category) throw new Error('Not a momo category URL');
  const first = await fetchCategoryPage(category, 1);
  if (first.success === false && String(first.resultCode) === '40006') {
    return { path: category.path, products: [], empty: true, emptyReason: 'no listed goods in this official category' };
  }
  if (first.success === false) throw new Error(`momo category API result ${first.resultCode || 'unknown'}`);
  const maxPage = Math.min(Number(first.maxPage) || 1, MAX_PAGES);
  const pages = [first];
  if (maxPage > 1) {
    const rest = await Promise.all(
      Array.from({ length: maxPage - 1 }, (_, i) => fetchCategoryPage(category, i + 2)),
    );
    pages.push(...rest);
  }
  const products = [];
  const seen = {};
  pages.forEach((json) => {
    (((json && json.rtnGoodsData && json.rtnGoodsData.goodsInfoList) || [])).forEach((item) => {
      const product = itemToProduct(item, category);
      if (!product || seen[product.productId]) return;
      seen[product.productId] = true;
      products.push(product);
    });
  });
  return { path: category.path, products, empty: products.length === 0, emptyReason: '' };
}

function readMeta(html, name) {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escaped}["']`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = String(html || '').match(pattern);
    if (match) return htmlToText(match[1]);
  }
  return '';
}

export async function fetchMomoProduct(url) {
  const productId = parseMomoProductId(url);
  if (!productId) throw new Error('Not a momo product URL');
  const canonicalUrl = canonicalMomoProductUrl(productId);
  const fetched = await fetchText(canonicalUrl, {
    headers: { Accept: 'text/html,application/xhtml+xml', Referer: 'https://www.momoshop.com.tw/' },
  });
  const body = fetched.text;
  const text = htmlToText(body);
  const rawName = readMeta(body, 'og:title') || firstMatch(body, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const name = cleanText(String(rawName || '').replace(/\s*-\s*momo[\s\S]*$/i, ''));
  const priceAmount = readMeta(body, 'product:price:amount');
  const availability = readMeta(body, 'product:availability').toLowerCase();
  const unlisted = /商品目前無展售|網頁無法顯示/i.test(text) || (!availability && !name);
  let stockState = 'UNKNOWN';
  if (unlisted) stockState = 'UNLISTED';
  else if (availability === 'out of stock' || /可訂購時通知我|補貨通知/i.test(text)) stockState = 'OUT_OF_STOCK';
  else if (availability === 'in stock' || /加入購物車|立即購買|我要購買/i.test(text)) stockState = 'IN_STOCK';
  return {
    platform: 'Momo',
    productId,
    url: canonicalUrl,
    name,
    price: priceAmount ? `NT$${priceAmount}` : '',
    stockState,
  };
}

export async function runMomoRule(rule) {
  if (parseMomoCategory(rule.url)) {
    const listing = await fetchMomoCategory(rule);
    return { kind: 'listing', path: listing.path, products: listing.products, empty: listing.empty };
  }
  if (parseMomoProductId(rule.url)) {
    return { kind: 'product', products: [await fetchMomoProduct(rule.url)] };
  }
  throw new Error('Momo URL must be a category or product page');
}
