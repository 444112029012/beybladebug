import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyFilters, applyQuantityStockGuard, isPurchasable } from '../src/util.js';
import {
  fetchMomoCategory,
  fetchMomoProduct,
  momoStockStateFromGoodsStock,
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

test('live momo limited-sale listing does not notify CX-18 when quantity is 0', async () => {
  const listing = await fetchMomoCategory({
    url: 'https://www.momoshop.com.tw/categories/2701202072',
  });
  const product = listing.products.find((item) => item.productId === '15670779');
  assert.ok(product, 'CX-18+UX-02 (15670779) should be listed under 2701202072');
  if (Number(product.quantity) <= 0) {
    assert.equal(product.stockState, 'OUT_OF_STOCK');
    assert.equal(wouldNotify(product), false);
  } else {
    assert.equal(product.stockState, 'IN_STOCK');
    assert.equal(wouldNotify(product), true);
  }
});

test('live momo product page for 15670779 is out of stock while quantity is 0', async () => {
  const product = await fetchMomoProduct('https://www.momoshop.com.tw/product/15670779');
  assert.match(product.name, /CX-18/);
  if (product.quantity === '' || Number(product.quantity) <= 0) {
    assert.equal(product.stockState, 'OUT_OF_STOCK');
    assert.equal(wouldNotify(product), false);
  }
});
