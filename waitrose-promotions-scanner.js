/**
 * Pepesto API Example — Finding Best Promotions This Week at Waitrose
 * Supermarket: Waitrose (waitrose.com)
 * Built with Pepesto: https://www.pepesto.com/built-with-pepesto/waitrose/
 * Docs: https://pepesto.com/api
 *
 * Run: node waitrose-promotions-scanner.js
 * Requires: PEPESTO_API_KEY env var
 *
 * Note: /api/catalog returns a full product snapshot. It is an expensive call
 * (counted separately from other endpoints) and is designed for batch jobs,
 * not real-time lookups. Run it once, cache the result, filter locally.
 */

const API_BASE = 'https://s.pepesto.com/api';
const API_KEY = process.env.PEPESTO_API_KEY;

// How many top promotions to display
const TOP_N = 15;

if (!API_KEY) {
  console.error('Error: PEPESTO_API_KEY environment variable is not set.');
  console.error('Get your API key at https://www.pepesto.com/ai-grocery-shopping-agent/#setup-authentication');
  process.exit(1);
}

/**
 * Fetch the full Waitrose product catalog via /api/catalog.
 * Returns a map of product URL → product object.
 *
 * @returns {Promise<object>} parsed_products map
 */
async function fetchWaitroseCatalog() {
  console.log('Fetching Waitrose catalog (this may take a few seconds)...');

  const response = await fetch(`${API_BASE}/catalog`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      supermarket_domain: 'waitrose.com',
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`/catalog failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  return data.parsed_products;
}

/**
 * Filter the catalog to only promoted items, then sort by promo_percentage
 * descending so the biggest discounts come first.
 *
 * @param {object} products - parsed_products map
 * @returns {Array<object>} sorted promotion entries
 */
function extractPromotions(products) {
  const promoItems = [];

  for (const [url, product] of Object.entries(products)) {
    if (!product.promo) continue;

    promoItems.push({
      url,
      name: product.names?.en || product.entity_name,
      entity: product.entity_name,
      pricePence: product.price,
      promo_percentage: product.promo_percentage || 0,
      pricePerUnit: product.price_per_meausure_unit || '',
      quantity: product.quantity_str || '',
      tags: product.tags || [],
    });
  }

  // Sort by discount percentage, highest first
  promoItems.sort((a, b) => b.promo_percentage - a.promo_percentage);

  return promoItems;
}

/**
 * Format pence as a GBP string.
 * @param {number} pence
 * @returns {string}
 */
function formatGBP(pence) {
  return `£${(pence / 100).toFixed(2)}`;
}

/**
 * Main: pull the catalog, surface every promotion sorted by % saved.
 */
async function main() {
  const products = await fetchWaitroseCatalog();

  const total = Object.keys(products).length;
  console.log(`  Catalog loaded: ${total} products\n`);

  const promotions = extractPromotions(products);
  console.log(`  Products on promotion: ${promotions.length}\n`);

  if (promotions.length === 0) {
    console.log('No promotions found in the current catalog snapshot.');
    return;
  }

  const displayList = promotions.slice(0, TOP_N);

  console.log(`Top ${Math.min(TOP_N, promotions.length)} Waitrose promotions this week, sorted by % saved:\n`);
  console.log(
    '  #'.padEnd(4) +
    'Product'.padEnd(50) +
    'Price'.padEnd(10) +
    'Saving'.padEnd(10) +
    'Per unit'
  );
  console.log('  ' + '─'.repeat(90));

  displayList.forEach((item, i) => {
    const rank = `${i + 1}.`.padEnd(4);
    const name = item.name.slice(0, 47).padEnd(50);
    const price = formatGBP(item.pricePence).padEnd(10);
    const saving = `${item.promo_percentage}% off`.padEnd(10);
    const perUnit = item.pricePerUnit;
    console.log(`  ${rank}${name}${price}${saving}${perUnit}`);
    if (item.tags.length > 0) {
      console.log(`      tags: ${item.tags.join(', ')}`);
    }
  });

  // Summary stats
  const avgDiscount =
    promotions.reduce((sum, p) => sum + p.promo_percentage, 0) / promotions.length;
  console.log('\n' + '─'.repeat(60));
  console.log(`  Average discount across all ${promotions.length} promoted items: ${avgDiscount.toFixed(1)}%`);
  console.log(`  Highest single discount: ${promotions[0].promo_percentage}% on "${promotions[0].name}"`);

  console.log('\nTip: run this script weekly and diff the output to track');
  console.log('which promotions are new, extended, or have ended.');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
