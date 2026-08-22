import { loadConfig } from './config.js';
import { applyFilters, formatStockMessage, packedState, stockPart } from './util.js';
import { loadState, saveState, stateKey } from './state.js';
import { log, notify } from './notify.js';
import { pollTelegramCommands } from './telegram.js';
import { runMomoRule } from './platforms/momo.js';
import { runFunboxRule } from './platforms/funbox.js';
import { isMmPlatform, runMmRule } from './platforms/mm.js';
import { amazonDisplayName, runAmazonRule } from './platforms/amazon.js';

function shopName(product) {
  if (product.platform === 'Funbox') return 'Funbox';
  if (product.platform === 'Amazon') return 'Amazon';
  if (product.platform === 'MM') return 'MM小舖';
  return 'momo';
}

function productLabel(product) {
  if (product.platform === 'Amazon') return amazonDisplayName(product);
  return product.name || `商品 ${product.productId}`;
}

async function runRule(rule) {
  const platform = rule.platform;
  if (/momo/i.test(platform)) return runMomoRule(rule);
  if (/funbox/i.test(platform)) return runFunboxRule(rule);
  if (/amazon/i.test(platform)) return runAmazonRule(rule);
  if (isMmPlatform(platform)) return runMmRule(rule);
  throw new Error(`Unknown platform: ${platform}`);
}

async function handleProduct(config, state, rule, product) {
  const filter = applyFilters(product, rule);
  const key = stateKey(product);
  const previousRaw = state.values[key];
  let notified = 0;
  if (filter.matched && product.stockState === 'IN_STOCK') {
    const previousStock = stockPart(previousRaw);
    const kind = previousStock !== 'IN_STOCK' ? (previousStock ? 'restock' : 'new') : 'in_stock';
    const shouldNotify = config.notifyEveryInStock || kind !== 'in_stock';
    const text = formatStockMessage(shopName(product), kind, productLabel(product), product, product.url);
    if (shouldNotify) {
      await notify(config, text);
      notified = 1;
    } else {
      log(`still in stock: ${product.platform} ${product.productId}`);
    }
  }
  if (product.stockState !== 'UNKNOWN') {
    state.values[key] = packedState(product);
  }
  return notified;
}

async function checkRule(config, state, rule) {
  try {
    const result = await runRule(rule);
    const products = result.products || [];
    let notified = 0;
    for (const product of products) {
      notified += await handleProduct(config, state, rule, product);
    }
    const inStock = products.filter((product) => product.stockState === 'IN_STOCK').length;
    const matched = products.filter((product) => applyFilters(product, rule).matched).length;
    const summary = `${result.path || rule.url}: ${products.length} items, ${inStock} in stock, ${matched} matched, notified=${notified}`;
    log(`${rule.platform} ${summary}`);
    recordRuleStatus(state, rule, summary);
    return { notified, products: products.length };
  } catch (error) {
    recordRuleStatus(state, rule, `Check failed: ${error.message}`);
    throw error;
  }
}

function recordRuleStatus(state, rule, summary) {
  if (!state.meta.rules) state.meta.rules = [];
  const row = {
    id: rule.id,
    platform: rule.platform,
    url: rule.url,
    lastChecked: new Date().toISOString(),
    summary,
  };
  const index = state.meta.rules.findIndex((item) => item.id === rule.id);
  if (index >= 0) state.meta.rules[index] = row;
  else state.meta.rules.push(row);
}

async function runOnce(config, state) {
  const enabled = config.rules.filter((rule) => rule.enabled && /^https:\/\//i.test(rule.url));
  if (!enabled.length) {
    log('No enabled rules in watch.rules.json');
    return;
  }
  const started = Date.now();
  const results = await Promise.allSettled(enabled.map((rule) => checkRule(config, state, rule)));
  let notified = 0;
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      notified += result.value.notified;
      return;
    }
    log(`${enabled[index].platform} failed: ${result.reason && result.reason.message ? result.reason.message : result.reason}`);
  });
  saveState(state);
  log(`check done in ${Date.now() - started}ms; telegram/new alerts this round: ${notified}`);
  await pollTelegramCommands(config, state);
  saveState(state);
}

async function main() {
  const config = loadConfig();
  const state = loadState(config.root);
  log(`local watcher interval=${config.intervalSeconds}s rules=${config.rules.filter((rule) => rule.enabled).length} telegram=${config.telegramToken && config.telegramChatId ? 'on' : 'off'}`);
  await runOnce(config, state);
  if (config.once) return;
  let running = false;
  setInterval(() => {
    if (running) {
      log('previous check still running; skip this tick');
      return;
    }
    running = true;
    runOnce(config, state)
      .catch((error) => log(`loop failed: ${error.message}`))
      .finally(() => { running = false; });
  }, config.intervalSeconds * 1000);
  setInterval(() => {
    pollTelegramCommands(config, state)
      .then(() => saveState(state))
      .catch((error) => log(`telegram poll failed: ${error.message}`));
  }, 2000);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
