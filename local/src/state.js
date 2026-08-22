import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

function emptyMeta() {
  return { telegramOffset: '', commandsSet: false, rules: [] };
}

export function loadState(root) {
  const dir = join(root, 'data');
  const file = join(dir, 'state.json');
  if (!existsSync(file)) return { file, values: {}, meta: emptyMeta() };
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) || {};
    if (raw.products && typeof raw.products === 'object') {
      return { file, values: raw.products, meta: { ...emptyMeta(), ...(raw.meta || {}) } };
    }
    return { file, values: raw, meta: emptyMeta() };
  } catch (error) {
    return { file, values: {}, meta: emptyMeta() };
  }
}

export function saveState(state) {
  mkdirSync(join(state.file, '..'), { recursive: true });
  writeFileSync(state.file, `${JSON.stringify({
    meta: state.meta || emptyMeta(),
    products: state.values || {},
  }, null, 2)}\n`);
}

export function stateKey(product) {
  return `${String(product.platform || '').toLowerCase()}|${product.productId}`;
}
