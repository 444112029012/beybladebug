import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  NOTIFY_QTY_DROP,
  formatInventoryText,
  inventoryRowsFromState,
  shouldNotifyStock,
  splitTelegramText,
  writeSnapshot,
} from '../src/util.js';
import { buildInventoryText, telegramCommand } from '../src/telegram.js';

test('Telegram /stock and 庫存 map to the inventory command', () => {
  assert.equal(telegramCommand('/stock'), 'stock');
  assert.equal(telegramCommand('/stock@mybot'), 'stock');
  assert.equal(telegramCommand('/stock_local'), 'stock');
  assert.equal(telegramCommand('/inventory'), 'stock');
  assert.equal(telegramCommand('庫存'), 'stock');
  assert.equal(telegramCommand('列出庫存'), 'stock');
  assert.equal(telegramCommand('/status_local'), 'status_local');
  assert.equal(telegramCommand('/help'), 'help');
});

test('in-stock re-alert waits for a drop of 50 from the last notify baseline', () => {
  assert.equal(NOTIFY_QTY_DROP, 50);
  const quiet = { notifyEveryInStock: false };
  assert.equal(shouldNotifyStock({}, 'new', quiet), true);
  assert.equal(shouldNotifyStock({}, 'restock', quiet), true);
  assert.equal(shouldNotifyStock({}, 'in_stock', { ...quiet, previousQuantity: 100, currentQuantity: 51 }), false);
  assert.equal(shouldNotifyStock({}, 'in_stock', { ...quiet, previousQuantity: 100, currentQuantity: 50 }), true);
  assert.equal(shouldNotifyStock({}, 'in_stock', { ...quiet, previousQuantity: 100, currentQuantity: 49 }), true);
});

test('/stock lists only in-stock items, grouped by shop, with quantities', () => {
  const state = {
    values: {
      'momo|15670779': writeSnapshot({
        platform: 'Momo',
        productId: '15670779',
        name: '【TAKARA TOMY】BEYBLADE X 戰鬥陀螺X CX-18+UX-02',
        url: 'https://www.momoshop.com.tw/product/15670779',
        stockState: 'IN_STOCK',
        quantity: 3,
      }, '', true),
      'funbox|bbpr08914': writeSnapshot({
        platform: 'Funbox',
        productId: 'bbpr08914',
        name: '【APP兌換】交換票券_戰鬥陀螺',
        url: 'https://shop.funbox.com.tw/products/bbpr08914',
        stockState: 'IN_STOCK',
        quantity: 354,
      }, '', true),
      'momo|15462752': writeSnapshot({
        platform: 'Momo',
        productId: '15462752',
        name: '缺貨陀螺',
        url: 'https://www.momoshop.com.tw/product/15462752',
        stockState: 'OUT_OF_STOCK',
        quantity: 0,
      }, '', false),
    },
  };
  const rows = inventoryRowsFromState(state);
  assert.equal(rows.length, 2);
  const text = buildInventoryText(state, Date.parse('2026-11-18T08:00:00Z'));
  assert.match(text, /Beyblade 目前庫存/);
  assert.match(text, /有貨 2 件/);
  assert.match(text, /momo[\s\S]*CX-18\+UX-02[\s\S]*庫存 3/);
  assert.match(text, /Funbox[\s\S]*庫存 354/);
  assert.doesNotMatch(text, /缺貨陀螺/);
  assert.equal(formatInventoryText([], Date.parse('2026-11-18T08:00:00Z')).includes('目前沒有有貨商品'), true);
});

test('long inventory text splits on blank lines under the Telegram limit', () => {
  const chunks = splitTelegramText(`${'a'.repeat(2000)}\n\n${'b'.repeat(2500)}`, 3900);
  assert.equal(chunks.length, 2);
  assert.ok(chunks[0].length <= 3900);
  assert.ok(chunks[1].length <= 3900);
});
