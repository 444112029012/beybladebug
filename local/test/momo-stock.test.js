import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyFilters, applyQuantityStockGuard, isPurchasable } from '../src/util.js';
import {
  fetchMomoCategory,
  fetchMomoProduct,
  isMomoFunboxOfficial,
  momoStockStateFromGoodsStock,
  parseMomoEnterpriseNo,
  parseMomoGoodsStock,
} from '../src/platforms/momo.js';

const CX18_RULE = {
  include: 'BEYBLADE,戰鬥陀螺,爆旋陀螺',
  exclude: 'used,中古,收納,戰鬥盤,陀螺盤',
  maxPrice: '',
};

function wouldNotify(product, rule = CX18_RULE) {
  const filter = applyFilters(product, rule);
  return filter.matched && isPurchasable(product);
}

test('goodsStock 0 is out of stock; missing stock stays listed as in stock', () => {
  assert.equal(momoStockStateFromGoodsStock('0'), 'OUT_OF_STOCK');
  assert.equal(momoStockStateFromGoodsStock(0), 'OUT_OF_STOCK');
  assert.equal(momoStockStateFromGoodsStock('5'), 'IN_STOCK');
  assert.equal(momoStockStateFromGoodsStock(''), 'IN_STOCK');
  assert.equal(momoStockStateFromGoodsStock(undefined), 'IN_STOCK');
});

test('quantity 0 is not purchasable even if a listing was labelled IN_STOCK', () => {
  const product = {
    name: '【TAKARA TOMY】BEYBLADE X 戰鬥陀螺X CX-18+UX-02',
    stockState: 'IN_STOCK',
    quantity: 0,
    price: 'NT$745',
  };
  assert.equal(wouldNotify(product), false);
  assert.equal(product.stockState, 'OUT_OF_STOCK');
  assert.equal(isPurchasable({ stockState: 'IN_STOCK', quantity: 3, name: product.name }), true);
});

test('applyQuantityStockGuard leaves truly in-stock items alone', () => {
  const product = { stockState: 'IN_STOCK', quantity: 2 };
  applyQuantityStockGuard(product);
  assert.equal(product.stockState, 'IN_STOCK');
  assert.equal(isPurchasable(product), true);
});

test('parses goodsStock from escaped momo HTML payloads', () => {
  const body = 'self.__next_f.push([1,"{\\\"goodsStock\\\":\\\"0\\\",\\\"isTracked\\\":false}"])';
  assert.equal(parseMomoGoodsStock(body), '0');
  assert.equal(parseMomoGoodsStock('"goodsStock":"12"'), '12');
  assert.equal(parseMomoGoodsStock('no stock field'), '');
});

test('Funbox official shop is enterpriseNo 006093 / funbox toys 品牌旗艦店', () => {
  const funbox = 'enterpriseNo\\":\\"006093\\",\\"brandName\\":\\"TAKARA TOMY\\",\\"itemTitle\\":\\"funbox toys\\",\\"itemDescription\\":\\"品牌旗艦店\\"';
  const reseller = 'enterpriseNo\\":\\"020641\\",\\"brandName\\":\\"TAKARA TOMY\\",\\"配送方式\\":\\"廠商宅配\\"';
  const sidebarOnly = '精選品牌 ASIA GOAL Tender Leaf FUNBOX ChingChing';
  assert.equal(parseMomoEnterpriseNo(funbox), '006093');
  assert.equal(parseMomoEnterpriseNo(reseller), '020641');
  assert.equal(isMomoFunboxOfficial(funbox), true);
  assert.equal(isMomoFunboxOfficial(reseller), false);
  assert.equal(isMomoFunboxOfficial(sidebarOnly), false);
});

test('reseller momo pages do not match filters even when in stock', () => {
  const product = {
    platform: 'Momo',
    name: '【TAKARA TOMY】戰鬥陀螺X UX-20 榮耀女武神 LF 入門套組',
    stockState: 'IN_STOCK',
    quantity: 29,
    price: 'NT$2380',
    isFunboxOfficial: false,
    enterpriseNo: '020641',
  };
  const filter = applyFilters(product, CX18_RULE);
  assert.equal(filter.matched, false);
  assert.ok(filter.reasons.some((reason) => /Funbox/.test(reason)));
  assert.equal(wouldNotify(product), false);
});

test('live momo category scan keeps Funbox CX-18 and drops reseller shops', async () => {
  const listing = await fetchMomoCategory({
    url: 'https://www.momoshop.com.tw/categories/2701202072',
    ...CX18_RULE,
  });
  assert.ok(listing.listed > listing.products.length, 'toy-mall listings include non-Funbox shops');
  listing.products.forEach((product) => {
    assert.equal(product.isFunboxOfficial, true);
    assert.equal(product.enterpriseNo, '006093');
  });
  const product = listing.products.find((item) => item.productId === '15670779');
  assert.ok(product, 'CX-18+UX-02 (15670779) is Funbox official');
  assert.equal(listing.products.some((item) => item.productId === '15587337'), false);
  if (Number(product.quantity) <= 0) {
    assert.equal(product.stockState, 'OUT_OF_STOCK');
    assert.equal(wouldNotify(product), false);
  }
});

test('live momo product page: CX-18 is Funbox; reseller UX-20 is not', async () => {
  const official = await fetchMomoProduct('https://www.momoshop.com.tw/product/15670779');
  const reseller = await fetchMomoProduct('https://www.momoshop.com.tw/product/15587337');
  assert.match(official.name, /CX-18/);
  assert.equal(official.enterpriseNo, '006093');
  assert.equal(official.isFunboxOfficial, true);
  assert.equal(reseller.isFunboxOfficial, false);
  assert.notEqual(reseller.enterpriseNo, '006093');
  assert.equal(wouldNotify(reseller), false);
});
