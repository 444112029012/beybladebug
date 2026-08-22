import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

function emptyMeta() {
  return { telegramOffset: '', commandsSet: false, rules: [] };
}

function parseStateFile(file) {
  const raw = JSON.parse(readFileSync(file, 'utf8')) || {};
  if (raw.products && typeof raw.products === 'object') {
    return { values: raw.products, meta: { ...emptyMeta(), ...(raw.meta || {}) } };
  }
  return { values: raw, meta: emptyMeta() };
}

export function loadState(root) {
  const dir = join(root, 'data');
  const file = join(dir, 'state.json');
  const backup = `${file}.bak`;
  if (!existsSync(file) && !existsSync(backup)) {
    return { file, values: {}, meta: emptyMeta() };
  }
  try {
    if (existsSync(file)) {
      const parsed = parseStateFile(file);
      return { file, ...parsed };
    }
  } catch (error) {
    // Fall through to backup after a crash mid-write.
  }
  try {
    if (existsSync(backup)) {
      const parsed = parseStateFile(backup);
      return { file, ...parsed };
    }
  } catch (error) {
    // Both copies unreadable.
  }
  return { file, values: {}, meta: emptyMeta() };
}

export function saveState(state) {
  mkdirSync(join(state.file, '..'), { recursive: true });
  const payload = `${JSON.stringify({
    meta: state.meta || emptyMeta(),
    products: state.values || {},
  }, null, 2)}\n`;
  const tmp = `${state.file}.${process.pid}.tmp`;
  const backup = `${state.file}.bak`;
  writeFileSync(tmp, payload);
  try {
    if (existsSync(state.file)) {
      try { rmSync(backup, { force: true }); } catch (error) { /* ignore */ }
      renameSync(state.file, backup);
    }
    renameSync(tmp, state.file);
  } catch (error) {
    try { rmSync(tmp, { force: true }); } catch (cleanup) { /* ignore */ }
    throw error;
  }
}

export function stateKey(product) {
  return `${String(product.platform || '').toLowerCase()}|${product.productId}`;
}
