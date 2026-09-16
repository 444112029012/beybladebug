import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatStockMessage, isFunboxAppTicket, NOTIFY_QTY_DROP, readSnapshot, shouldNotifyStock, writeSnapshot } from '../src/util.js';
import { fetchFunboxCategory, funboxCategoryJsonUrl } from '../src/platforms/funbox.js';

test('Funbox listing JSON matches the Chrome extension URL, without category_products query', () => {
  assert.equal(funboxCategoryJsonUrl('XI/KB'), 'https://shop.funbox.com.tw/categories/XI/KB.json');
  assert.equal(funboxCategoryJsonUrl('/XI/KB/'), 'https://shop.funbox.com.tw/categories/XI/KB.json');
  assert.ok(!funboxCategoryJsonUrl('XI/KB').includes('?'));
  assert.ok(!funboxCategoryJsonUrl('XI/KB').includes('category_products'));
});

test('live Funbox XI/KB listing returns JSON products instead of a wait page', async () => {
  const listing = await fetchFunboxCategory({
    url: 'https://shop.funbox.com.tw/categories/XI/KB',
  });
  assert.equal(listing.empty, listing.products.length === 0);
  listing.products.forEach((product) => {
    assert.equal(product.platform, 'Funbox');
    assert.ok(product.productId);
    assert.match(product.url, /\/products\/[A-Za-z0-9_-]+/);
  });
});

test('local notifies new/restock, or when quantity drops by 30, not every in-stock poll', () => {
  const ticket = {
    platform: 'Funbox',
    name: '【APP兌換】交換票券_戰鬥陀螺 CX-00 龍神勇氣G4-70I 金屬塗裝：水藍',
    quantity: 374,
  };
  const product = {
    platform: 'Funbox',
    name: 'BEYBLADE X 戰鬥陀螺 CX-18+UX-02',
    quantity: 12,
  };
  const quiet = { notifyEveryInStock: false };
  assert.equal(isFunboxAppTicket(ticket), true);
  assert.equal(isFunboxAppTicket(product), false);
  assert.equal(shouldNotifyStock(ticket, 'new', quiet), true);
  assert.equal(shouldNotifyStock(product, 'restock', quiet), true);
  assert.equal(shouldNotifyStock(product, 'in_stock', { ...quiet, previousQuantity: 12, currentQuantity: 12 }), false);
  assert.equal(shouldNotifyStock(product, 'in_stock', { ...quiet, previousQuantity: 41, currentQuantity: 11 }), true);
  assert.equal(shouldNotifyStock(ticket, 'in_stock', { ...quiet, previousQuantity: 404, currentQuantity: 374 }), true);
  assert.equal(shouldNotifyStock(ticket, 'in_stock', { ...quiet, previousQuantity: 404, currentQuantity: 403 }), false);
  assert.equal(NOTIFY_QTY_DROP, 30);
  assert.match(
    formatStockMessage('Funbox', 'qty_drop', ticket.name, ticket, 'https://shop.funbox.com.tw/products/bbpr08914', {
      previousQuantity: 404,
    }),
    /\[local\] Funbox 庫存下降[\s\S]*庫存 404 → 374（-30）/,
  );
});

test('inventory snapshot keeps notifyQuantity across 1-unit polls until drop reaches 30', () => {
  let snap = writeSnapshot({
    platform: 'Funbox',
    name: 'ticket',
    url: 'https://shop.funbox.com.tw/products/bbpr08914',
    stockState: 'IN_STOCK',
    quantity: 404,
  }, '', true);
  assert.equal(snap.notifyQuantity, 404);
  assert.equal(readSnapshot('IN_STOCK|404').notifyQuantity, 404);

  for (let qty = 403; qty >= 375; qty -= 1) {
    const opts = { previousQuantity: snap.notifyQuantity, currentQuantity: qty };
    assert.equal(shouldNotifyStock({}, 'in_stock', opts), false);
    snap = writeSnapshot({ stockState: 'IN_STOCK', quantity: qty, name: 'ticket' }, snap, false);
    assert.equal(snap.quantity, qty);
    assert.equal(snap.notifyQuantity, 404);
  }

  assert.equal(shouldNotifyStock({}, 'in_stock', { previousQuantity: snap.notifyQuantity, currentQuantity: 374 }), true);
  snap = writeSnapshot({ stockState: 'IN_STOCK', quantity: 374, name: 'ticket' }, snap, true);
  assert.equal(snap.notifyQuantity, 374);
  assert.equal(snap.quantity, 374);
});
