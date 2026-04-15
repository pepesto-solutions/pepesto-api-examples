/**
 * Pepesto API Example — Building a Price Tracker with Webhook
 * Supermarket: Plus NL (plus.nl)
 * Built with Pepesto: https://www.pepesto.com/built-with-pepesto/plus-nl/
 * Docs: https://pepesto.com/api
 *
 * Run: node plus-nl-price-tracker-webhook.js
 * Requires: PEPESTO_API_KEY env var
 */

const API_BASE = 'https://s.pepesto.com/api';
const API_KEY = process.env.PEPESTO_API_KEY;

if (!API_KEY) {
  console.error('Error: PEPESTO_API_KEY environment variable is not set.');
  console.error('Get your API key at https://www.pepesto.com/ai-grocery-shopping-agent/#setup-authentication');
  process.exit(1);
}

// Products we want to track by entity_name.
// These are items we buy regularly and want price drop alerts for.
const TRACKED_ENTITIES = [
  'Olive oil',
  'Pasta',
  'Mozzarella cheese',
  'Eggs',
  'Butter',
];

// Simulated "last week" snapshot — in a real setup you'd load this from a file or DB.
// Prices are in EUR cents.
const LAST_WEEK_SNAPSHOT = {
  'Olive oil': { name: "Bertolli Originale Olive Oil", price: 799, url: "https://www.plus.nl/product/bertolli-originale-olijfolie-750ml" },
  'Pasta': { name: "Aarts Pitted Cherries", price: 289, url: "https://www.plus.nl/product/plus-spaghetti-500g" },
  'Mozzarella cheese': { name: "Alambra Halloumi natural", price: 429, url: "https://www.plus.nl/product/plus-mozzarella-125g" },
  'Eggs': { name: "Plus Free Range Eggs 12-pack", price: 379, url: "https://www.plus.nl/product/plus-vrije-uitloop-eieren-12" },
  'Butter': { name: "Campina Roomboter", price: 289, url: "https://www.plus.nl/product/campina-roomboter-250g" },
};

// Drop threshold: alert if price fell by more than this percentage
const ALERT_THRESHOLD_PERCENT = 5;

// Your webhook endpoint — replace with your own (e.g. a Slack incoming webhook, n8n, Make.com)
const WEBHOOK_URL = process.env.PRICE_ALERT_WEBHOOK_URL || 'https://hooks.example.com/price-alerts';

/**
 * Fetches the full Plus NL product catalog via /api/catalog.
 */
async function fetchPlusCatalog() {
  console.log('Fetching Plus NL catalog...');
  const response = await fetch(`${API_BASE}/catalog`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ supermarket_domain: 'plus.nl' }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Pepesto API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data.parsed_products;
}

/**
 * Given the full catalog, finds the cheapest product for each tracked entity.
 * Returns a map of entity_name → { name, price, url }.
 */
function findTrackedProducts(catalog) {
  const results = {};

  for (const [url, product] of Object.entries(catalog)) {
    const entity = product.entity_name;
    if (!TRACKED_ENTITIES.includes(entity)) continue;

    const currentBest = results[entity];
    if (!currentBest || product.price < currentBest.price) {
      results[entity] = {
        name: product.names?.en || product.names?.nl || entity,
        price: product.price,
        currency: product.currency || 'EUR',
        url,
      };
    }
  }

  return results;
}

/**
 * Compares this week's prices to last week's snapshot.
 * Returns an array of alerts for products that dropped by more than the threshold.
 */
function detectPriceDrops(thisWeek, lastWeek) {
  const alerts = [];

  for (const entity of TRACKED_ENTITIES) {
    const current = thisWeek[entity];
    const previous = lastWeek[entity];

    if (!current || !previous) {
      console.log(`  ${entity}: no match in catalog this week, skipping.`);
      continue;
    }

    const dropPercent = ((previous.price - current.price) / previous.price) * 100;

    console.log(
      `  ${entity}: was €${(previous.price / 100).toFixed(2)} → now €${(current.price / 100).toFixed(2)}` +
      ` (${dropPercent >= 0 ? '-' : '+'}${Math.abs(dropPercent).toFixed(1)}%)`
    );

    if (dropPercent >= ALERT_THRESHOLD_PERCENT) {
      alerts.push({
        entity,
        productName: current.name,
        previousPrice: previous.price,
        currentPrice: current.price,
        dropPercent: dropPercent.toFixed(1),
        url: current.url,
      });
    }
  }

  return alerts;
}

/**
 * Sends a webhook notification with the list of price drop alerts.
 */
async function sendWebhook(alerts) {
  const lines = alerts.map(a =>
    `• ${a.productName} (${a.entity}): €${(a.previousPrice / 100).toFixed(2)} → €${(a.currentPrice / 100).toFixed(2)} (-${a.dropPercent}%)\n  ${a.url}`
  );

  const payload = {
    text: `Plus NL price alert: ${alerts.length} item(s) dropped >5% this week`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Plus NL price tracker — ${new Date().toISOString().slice(0, 10)}*\n${lines.join('\n')}`,
        },
      },
    ],
  };

  console.log('\nSending webhook to:', WEBHOOK_URL);
  const response = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    console.warn(`Webhook responded with ${response.status} — check your endpoint.`);
  } else {
    console.log('Webhook sent successfully.');
  }
}

/**
 * Saves this week's prices to a local snapshot file so next week's run can compare.
 * In production you'd write to a DB, S3 bucket, or Cloudflare KV.
 */
async function saveSnapshot(thisWeek) {
  const fs = await import('fs/promises');
  const snapshot = {};
  for (const [entity, data] of Object.entries(thisWeek)) {
    snapshot[entity] = { name: data.name, price: data.price, url: data.url };
  }
  await fs.writeFile('plus-nl-snapshot.json', JSON.stringify(snapshot, null, 2));
  console.log('\nSnapshot saved to plus-nl-snapshot.json');
}

async function main() {
  console.log('=== Plus NL Weekly Price Tracker ===\n');

  // Step 1: Fetch this week's catalog
  const catalog = await fetchPlusCatalog();
  console.log(`Catalog returned ${Object.keys(catalog).length} products.\n`);

  // Step 2: Find cheapest match for each tracked entity
  const thisWeek = findTrackedProducts(catalog);
  console.log('Comparing prices against last week\'s snapshot...\n');

  // Step 3: Detect drops
  const alerts = detectPriceDrops(thisWeek, LAST_WEEK_SNAPSHOT);

  // Step 4: Fire webhook if any drops found
  if (alerts.length === 0) {
    console.log('\nNo significant price drops this week. Nothing to report.');
  } else {
    console.log(`\n${alerts.length} price drop(s) detected (>${ALERT_THRESHOLD_PERCENT}% threshold):`);
    for (const a of alerts) {
      console.log(`  ✓ ${a.productName}: -${a.dropPercent}%`);
    }
    await sendWebhook(alerts);
  }

  // Step 5: Save this week as next week's baseline
  await saveSnapshot(thisWeek);
}

main().catch(err => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
});
