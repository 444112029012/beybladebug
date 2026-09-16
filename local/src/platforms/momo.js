import { fetchJson, fetchText } from '../http.js';
import { cleanText, firstMatch, htmlToText, matchesAnyKeyword, parsePriceNumber } from '../util.js';

const CATEGORY_API = 'https://www.momoshop.com.tw/api/moecapp/getCategoryGoodsV3';
const MAX_PAGES = 5;

const FUNBOX_BEYBLADE = {
  cateCode: '2186500036',
  cateLevel: '3',
  path: 'funbox toys > 兒童玩具 > 戰鬥陀螺',
  url: 'https://www.momoshop.com.tw/categories/2186500036',
};
const TOY_MALL_BEYBLADE = {
  cateCode: '2701200114',
  cateLevel: '3',
  path: '玩具 > 人氣IP > 戰鬥陀螺',
  url: 'https://www.momoshop.com.tw/categories/2701200114',
};
const TOY_MALL_BEYBLADE_LIMITED = {
  cateCode: '2701202072',
  cateLevel: '3',
  path: '玩具 > 戰鬥陀螺★限量發售',
  url: 'https://www.momoshop.com.tw/categories/2701202072',
};
const BEYBLADE_LISTINGS = [FUNBOX_BEYBLADE, TOY_MALL_BEYBLADE, TOY_MALL_BEYBLADE_LIMITED];
const BEYBLADE_COMBINED_PATH = 'momo 戰鬥陀螺（品牌旗艦 + 人氣IP + 限量發售）';
const FUNBOX_ENTERPRISE_NO = '006093';
const MAX_FUNBOX_PAGES = 40;

function knownListing(cateCode) {
  return BEYBLADE_LISTINGS.find((item) => item.cateCode === String(cateCode)) || null;
}

export function parseMomoCategory(url) {
  const text = String(url || '');
  if (!/momoshop\.com\.tw/i.test(text)) return null;
  const cateCode = firstMatch(text, /\/categories\/(\d+)/i)
    || firstMatch(text, /[?&]d_code=(\d+)/i)
    || firstMatch(text, /[?&]m_code=(\d+)/i)
    || firstMatch(text, /[?&]l_code=(\d+)/i);
  if (!cateCode) return null;
  const known = knownListing(cateCode);
  let cateLevel = firstMatch(text, /[?&]cateLevel=(\d+)/i);
  if (!cateLevel) {
    if (/l_code=|LgrpCategory/i.test(text) || /0000$/.test(cateCode)) cateLevel = '1';
    else if (/m_code=|MgrpCategory/i.test(text)) cateLevel = '2';
    else cateLevel = '3';
  }
  return {
    cateCode,
    cateLevel: known ? known.cateLevel : cateLevel,
    path: known ? known.path : `momo category ${cateCode}`,
    url: `https://www.momoshop.com.tw/categories/${cateCode}`,
  };
}

function listingCategories(category) {
  if (!knownListing(category.cateCode)) return [category];
  return BEYBLADE_LISTINGS.map((item) => ({ ...item }));
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

export function momoQuantityFromGoodsStock(goodsStock) {
  if (goodsStock === undefined || goodsStock === null || goodsStock === '') return '';
  return parsePriceNumber(goodsStock);
}

export function momoStockStateFromGoodsStock(goodsStock) {
  const qty = momoQuantityFromGoodsStock(goodsStock);
  if (qty === '') return 'IN_STOCK';
  return Number(qty) > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK';
}

export function parseMomoGoodsStock(body) {
  return firstMatch(body, /goodsStock\\?"\s*:\s*\\?"(\d+)/);
}

export function parseMomoEnterpriseNo(body) {
  return firstMatch(body, /enterpriseNo\\?"\s*:\s*\\?"(\d+)/)
    || firstMatch(body, /entpCode\\?"\s*:\s*\\?"(\d+)/);
}

export function isMomoFunboxOfficial(body) {
  const html = String(body || '');
  if (parseMomoEnterpriseNo(html) === FUNBOX_ENTERPRISE_NO) return true;
  return /itemTitle\\?"\s*:\s*\\?"funbox toys/i.test(html) && /品牌旗艦店/.test(html);
}

function itemToProduct(item, category) {
  const productId = String((item && item.goodsCode) || '').trim();
  if (!/^\d+$/.test(productId)) return null;
  const quantity = momoQuantityFromGoodsStock(item && item.goodsStock);
  return {
    platform: 'Momo',
    productId,
    url: canonicalMomoProductUrl(productId),
    name: cleanText(item.goodsName),
    price: item.goodsPrice ? `NT$${item.goodsPrice}` : '',
    quantity,
    stockState: momoStockStateFromGoodsStock(item && item.goodsStock),
    categoryPath: category.path,
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

async function fetchOneCategory(category) {
  const first = await fetchCategoryPage(category, 1);
  if (first.success === false && String(first.resultCode) === '40006') {
    return { path: category.path, products: [], empty: true, emptyReason: `no listed goods in ${category.path}` };
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

function mergeProducts(parts) {
  const products = [];
  const seen = {};
  parts.forEach((part) => {
    part.products.forEach((product) => {
      const previous = seen[product.productId];
      if (!previous) {
        seen[product.productId] = product;
        products.push(product);
        return;
      }
      if (previous.stockState !== 'IN_STOCK' && product.stockState === 'IN_STOCK') {
        Object.assign(previous, product);
      }
    });
  });
  return products;
}

function keywordMatched(product, rule) {
  return matchesAnyKeyword(product.name, rule && rule.include, false)
    && !matchesAnyKeyword(product.name, rule && rule.exclude, true);
}

async function keepFunboxOfficial(products, rule) {
  const candidates = products.filter((product) => keywordMatched(product, rule)).slice(0, MAX_FUNBOX_PAGES);
  const pages = await Promise.all(candidates.map(async (product) => {
    try {
      const page = await fetchMomoProduct(product.url);
      return { product, page };
    } catch (error) {
      return { product, page: null };
    }
  }));
  const kept = [];
  pages.forEach(({ product, page }) => {
    if (!page || !page.isFunboxOfficial) return;
    kept.push({
      ...product,
      enterpriseNo: page.enterpriseNo,
      isFunboxOfficial: true,
    });
  });
  return kept;
}

export async function fetchMomoCategory(rule) {
  const category = parseMomoCategory(rule.url);
  if (!category) throw new Error('Not a momo category URL');
  const categories = listingCategories(category);
  const parts = await Promise.all(categories.map((item) => fetchOneCategory(item)));
  const listed = mergeProducts(parts);
  const products = await keepFunboxOfficial(listed, rule);
  const emptyReason = parts.map((part) => part.emptyReason).find(Boolean) || '';
  return {
    path: categories.length > 1 ? BEYBLADE_COMBINED_PATH : category.path,
    products,
    listed: listed.length,
    empty: products.length === 0,
    emptyReason: products.length === 0 ? (emptyReason || 'no Funbox 品牌旗艦 goods in these momo 戰鬥陀螺 categories') : '',
  };
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
  const stockRaw = parseMomoGoodsStock(body);
  const quantity = stockRaw === '' ? '' : Number(stockRaw);
  const enterpriseNo = parseMomoEnterpriseNo(body);
  const isFunboxOfficial = isMomoFunboxOfficial(body);
  const unlisted = /商品目前無展售|網頁無法顯示/i.test(text) || (!availability && !name);
  let stockState = 'UNKNOWN';
  if (unlisted) stockState = 'UNLISTED';
  else if (availability === 'out of stock' || /可訂購時通知我|補貨通知/i.test(text)) stockState = 'OUT_OF_STOCK';
  else if (quantity !== '' && quantity <= 0) stockState = 'OUT_OF_STOCK';
  else if (availability === 'in stock' || /加入購物車|立即購買|我要購買/i.test(text)) stockState = 'IN_STOCK';
  return {
    platform: 'Momo',
    productId,
    url: canonicalUrl,
    name,
    price: priceAmount ? `NT$${priceAmount}` : '',
    quantity,
    stockState,
    enterpriseNo,
    isFunboxOfficial,
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
