/**
 * Pepesto API Example — Cross-supermarket Pasta Price Comparison (AH vs Jumbo vs Plus)
 * Supermarket: Albert Heijn (ah.nl) + Jumbo (jumbo.com) + Plus (plus.nl)
 * Built with Pepesto: https://www.pepesto.com/built-with-pepesto/albert-heijn/
 * Docs: https://pepesto.com/api
 *
 * Run: node albert-heijn-price-comparison-nl.js
 * Requires: PEPESTO_API_KEY env var
 *
 * Note: /api/catalog returns a full product snapshot. Cache the results
 * locally if you plan to run comparisons repeatedly — each call counts
 * against your catalog quota.
 */

const API_BASE = 'https://s.pepesto.com/api';
const API_KEY = process.env.PEPESTO_API_KEY;

if (!API_KEY) {
  console.error('Error: PEPESTO_API_KEY environment variable is not set.');
  console.error('Get your API key at https://www.pepesto.com/ai-grocery-shopping-agent/#setup-authentication');
  process.exit(1);
}

// Keywords that indicate a pasta product (Dutch + English)
const PASTA_KEYWORDS = [
  'pasta', 'spaghetti', 'penne', 'fusilli', 'rigatoni',
  'tagliatelle', 'farfalle', 'linguine', 'macaroni', 'maccheroni',
  'lasagne', 'lasagna', 'tortellini', 'gnocchi',
];

const SUPERMARKETS = ['ah.nl', 'jumbo.com', 'plus.nl'];

/**
 * Fetch the full product catalog for a supermarket.
 *
 * @param {string} domain
 * @returns {Promise<object>} parsed_products map
 */
async function fetchCatalog(domain) {
  const response = await fetch(`${API_BASE}/catalog`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ supermarket_domain: domain }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`/catalog failed for ${domain}: ${response.status} ${text}`);
  }

  const data = await response.json();
  return data.parsed_products;
}

/**
 * Filter a catalog to only pasta-related products, based on product name
 * and entity_name matching our keyword list.
 *
 * @param {object} products
 * @returns {Array<object>}
 */
function filterPastaProducts(products) {
  const results = [];

  for (const [url, product] of Object.entries(products)) {
    const namesToSearch = [
      product.entity_name || '',
      product.names?.en || '',
      product.names?.nl || '',
    ].join(' ').toLowerCase();

    const isPasta = PASTA_KEYWORDS.some(kw => namesToSearch.includes(kw));
    if (!isPasta) continue;

    // Only include products sold by weight (grams) so we can compare per 100g
    const hundredGrams = product.quantity?.Unit?.HundredGrams;
    if (!hundredGrams || hundredGrams === 0) continue;

    const pricePer100g = product.price / hundredGrams;

    results.push({
      url,
      name: product.names?.en || product.names?.nl || product.entity_name,
      nameDutch: product.names?.nl || '',
      priceCents: product.price,        // price in euro cents
      hundredGrams,
      pricePer100g,                     // euro cents per 100g
      quantityStr: product.quantity_str,
      promo: !!product.promo,
      promo_percentage: product.promo_percentage || 0,
      tags: product.tags || [],
    });
  }

  // Sort by price per 100g ascending
  results.sort((a, b) => a.pricePer100g - b.pricePer100g);

  return results;
}

/**
 * Format euro cents as a EUR string.
 * @param {number} cents
 * @returns {string}
 */
function formatEUR(cents) {
  return `€${(cents / 100).toFixed(2)}`;
}

/**
 * Print a formatted table of pasta products for one supermarket.
 *
 * @param {string} domain
 * @param {Array<object>} items
 */
function printSupermarketTable(domain, items) {
  const label = domain.toUpperCase().padEnd(15);
  console.log(`\n${label} — ${items.length} pasta products found\n`);

  if (items.length === 0) {
    console.log('  No pasta products matched.\n');
    return;
  }

  // Show top 10 cheapest per 100g
  const topItems = items.slice(0, 10);

  console.log(
    '  ' + 'Product name'.padEnd(48) +
    'Price'.padEnd(10) +
    'Per 100g'.padEnd(12) +
    'Size'
  );
  console.log('  ' + '─'.repeat(85));

  topItems.forEach(item => {
    const name = item.name.slice(0, 45).padEnd(48);
    const price = formatEUR(item.priceCents).padEnd(10);
    const per100g = formatEUR(item.pricePer100g).padEnd(12);
    const qty = item.quantityStr;
    const promoMark = item.promo ? ` [−${item.promo_percentage}%]` : '';
    console.log(`  ${name}${price}${per100g}${qty}${promoMark}`);
  });
}

/**
 * Compare the cheapest pasta (per 100g) across all three supermarkets.
 *
 * @param {object} catalogsByDomain - { domain: filteredPastaItems[] }
 */
function printComparison(catalogsByDomain) {
  console.log('\n' + '═'.repeat(60));
  console.log('  HEAD-TO-HEAD: Cheapest pasta per 100g');
  console.log('═'.repeat(60));

  const winners = [];

  for (const [domain, items] of Object.entries(catalogsByDomain)) {
    if (items.length === 0) continue;
    const cheapest = items[0]; // already sorted by pricePer100g
    winners.push({ domain, product: cheapest });
    console.log(`\n  ${domain}`);
    console.log(`    "${cheapest.name}" (${cheapest.quantityStr})`);
    console.log(`    ${formatEUR(cheapest.priceCents)} → ${formatEUR(cheapest.pricePer100g)} / 100g`);
    if (cheapest.promo) {
      console.log(`    Currently on promotion: −${cheapest.promo_percentage}%`);
    }
  }

  if (winners.length > 0) {
    winners.sort((a, b) => a.product.pricePer100g - b.product.pricePer100g);
    const winner = winners[0];
    console.log('\n' + '─'.repeat(60));
    console.log(`  Winner: ${winner.domain} with "${winner.product.name}"`);
    console.log(`  at ${formatEUR(winner.product.pricePer100g)} per 100g`);

    if (winners.length > 1) {
      const runner = winners[1];
      const diff = runner.product.pricePer100g - winner.product.pricePer100g;
      console.log(`  That's ${formatEUR(diff)} cheaper per 100g than ${runner.domain}`);
    }
  }

  console.log('═'.repeat(60) + '\n');
}

/**
 * Main: fetch all three catalogs in parallel, filter for pasta, compare.
 */
async function main() {
  console.log('Fetching catalogs for AH, Jumbo, and Plus in parallel...\n');

  const [ahProducts, jumboProducts, plusProducts] = await Promise.all(
    SUPERMARKETS.map(fetchCatalog)
  );

  const catalogMap = {
    'ah.nl': ahProducts,
    'jumbo.com': jumboProducts,
    'plus.nl': plusProducts,
  };

  const filteredByDomain = {};

  for (const [domain, products] of Object.entries(catalogMap)) {
    const total = Object.keys(products).length;
    console.log(`  ${domain}: ${total} products loaded`);
    filteredByDomain[domain] = filterPastaProducts(products);
  }

  // Print each supermarket's pasta list
  for (const [domain, items] of Object.entries(filteredByDomain)) {
    printSupermarketTable(domain, items);
  }

  // Cross-supermarket comparison
  printComparison(filteredByDomain);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
