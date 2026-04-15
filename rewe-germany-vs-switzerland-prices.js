/**
 * Pepesto API Example — German Grocery Price Comparison vs Switzerland
 * Supermarket: REWE (shop.rewe.de) vs Coop CH (coop.ch)
 * Built with Pepesto: https://www.pepesto.com/built-with-pepesto/rewe/
 * Docs: https://pepesto.com/api
 *
 * Run: node rewe-germany-vs-switzerland-prices.js
 * Requires: PEPESTO_API_KEY env var
 */

const API_BASE = 'https://s.pepesto.com/api';
const API_KEY = process.env.PEPESTO_API_KEY;

if (!API_KEY) {
  console.error('Error: PEPESTO_API_KEY environment variable is not set.');
  console.error('Get your API key at https://www.pepesto.com/ai-grocery-shopping-agent/#setup-authentication');
  process.exit(1);
}

// 1 CHF ≈ 1.04 EUR (April 2026 approximation)
const CHF_TO_EUR = 1.04;

/**
 * Fetches the full catalog for a given supermarket domain.
 */
async function fetchCatalog(domain) {
  console.log(`Fetching catalog for ${domain}...`);
  const response = await fetch(`${API_BASE}/catalog`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ supermarket_domain: domain }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Pepesto API error for ${domain} — ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data.parsed_products;
}

/**
 * Converts a catalog to a map of category → cheapest product (price in EUR cents).
 * Each product's entity_name is its category (e.g. "Milk", "Butter"). When multiple
 * products share the same category, only the cheapest one is kept — so we always
 * compare the best available price each store offers per category.
 * For CHF prices, applies the conversion rate.
 */
function buildCategoryIndex(catalog, currency) {
  const index = {};

  for (const [url, product] of Object.entries(catalog)) {
    const category = product.entity_name;
    if (!category) continue;

    // Convert price to EUR cents
    let priceEurCents = product.price;
    if (currency === 'CHF') {
      priceEurCents = Math.round(product.price * CHF_TO_EUR);
    }

    // Keep only the cheapest product for this category
    const existing = index[category];
    if (!existing || priceEurCents < existing.priceEurCents) {
      index[category] = {
        name: product.names?.en || product.names?.de || category,
        priceEurCents,
        originalPrice: product.price,
        originalCurrency: currency,
        quantityStr: product.quantity_str || '',
        url,
      };
    }
  }

  return index;
}

/**
 * Groups entity names into broad grocery categories.
 */
function categorise(entityName) {
  const dairy = ['Milk', 'Butter', 'Cheese', 'Mozzarella cheese', 'Parmesan cheese', 'Fresh cheese', 'Cream', 'Yoghurt', 'Sour cream'];
  const pasta = ['Spaghetti', 'Pasta', 'Penne', 'Fusilli', 'Tagliatelle'];
  const meat = ['Ham', 'Beef', 'Ground pork', 'Chicken', 'Sausage', 'Bacon', 'Salami', 'Lamb chops'];
  const produce = ['Tomatoes', 'Onions', 'Garlic', 'Carrots', 'Potatoes', 'Apples', 'Lettuce', 'Spinach', 'Asparagus'];
  const pantry = ['Olive oil', 'Sunflower oil', 'Flour', 'Sugar', 'Salt', 'Chickpeas', 'Canned tomatoes', 'Coconut milk'];

  if (dairy.includes(entityName)) return 'Dairy';
  if (pasta.includes(entityName)) return 'Pasta & grains';
  if (meat.includes(entityName)) return 'Meat & charcuterie';
  if (produce.includes(entityName)) return 'Fruit & vegetables';
  if (pantry.includes(entityName)) return 'Pantry staples';
  return 'Other';
}

/**
 * Matches categories that appear in both catalogs and compares their EUR prices.
 */
function compareMarkets(reweIndex, coopIndex) {
  const matches = [];

  for (const category of Object.keys(reweIndex)) {
    if (!coopIndex[category]) continue;

    const rewe = reweIndex[category];
    const coop = coopIndex[category];
    const diffCents = rewe.priceEurCents - coop.priceEurCents;
    const diffPct = ((rewe.priceEurCents - coop.priceEurCents) / coop.priceEurCents) * 100;

    matches.push({
      category,
      categoryGroup: categorise(category),
      rewe: { name: rewe.name, priceEurCents: rewe.priceEurCents, quantityStr: rewe.quantityStr },
      coop: {
        name: coop.name,
        priceEurCents: coop.priceEurCents,
        originalPrice: coop.originalPrice,
        quantityStr: coop.quantityStr,
      },
      diffCents,
      diffPct: diffPct.toFixed(1),
      winner: diffCents < 0 ? 'REWE' : diffCents > 0 ? 'Coop CH' : 'tie',
    });
  }

  // Sort by absolute price difference descending
  matches.sort((a, b) => Math.abs(b.diffCents) - Math.abs(a.diffCents));
  return matches;
}

/**
 * Summarises results by category group — which store wins how many category groups?
 */
function summariseByCategory(matches) {
  const groups = {};

  for (const m of matches) {
    if (!groups[m.categoryGroup]) {
      groups[m.categoryGroup] = { REWE: 0, 'Coop CH': 0, tie: 0, total: 0 };
    }
    groups[m.categoryGroup][m.winner]++;
    groups[m.categoryGroup].total++;
  }

  return groups;
}

function fmt(cents) {
  return `€${(cents / 100).toFixed(2)}`;
}

async function main() {
  console.log('=== REWE (Germany) vs Coop CH (Switzerland) — Price Comparison ===');
  console.log(`CHF→EUR conversion rate: 1 CHF = ${CHF_TO_EUR} EUR\n`);

  // Fetch both catalogs in parallel
  const [reweCatalog, coopCatalog] = await Promise.all([
    fetchCatalog('shop.rewe.de'),
    fetchCatalog('coop.ch'),
  ]);

  console.log(`REWE: ${Object.keys(reweCatalog).length} products`);
  console.log(`Coop CH: ${Object.keys(coopCatalog).length} products\n`);

  // Build category indexes (cheapest product per category, per store)
  const reweIndex = buildCategoryIndex(reweCatalog, 'EUR');
  const coopIndex = buildCategoryIndex(coopCatalog, 'CHF');

  // Find matching categories and compare
  const matches = compareMarkets(reweIndex, coopIndex);
  console.log(`Found ${matches.length} categories present in both stores.\n`);

  // Print top 15 biggest price differences
  console.log('=== Top price differences (converted to EUR) ===\n');
  const top15 = matches.slice(0, 15);
  for (const m of top15) {
    const arrow = m.diffCents < 0 ? '← REWE cheaper' : '← Coop CH cheaper';
    console.log(
      `${m.category.padEnd(28)} REWE: ${fmt(m.rewe.priceEurCents).padEnd(10)} Coop: ${fmt(m.coop.priceEurCents).padEnd(10)} diff: ${m.diffPct}%  ${arrow}`
    );
  }

  // Category summary
  const summary = summariseByCategory(matches);
  console.log('\n=== Category scorecard ===\n');
  let reweWins = 0, coopWins = 0;
  for (const [cat, scores] of Object.entries(summary)) {
    console.log(`${cat}:`);
    console.log(`  REWE cheaper:    ${scores.REWE} / ${scores.total}`);
    console.log(`  Coop CH cheaper: ${scores['Coop CH']} / ${scores.total}`);
    reweWins += scores.REWE;
    coopWins += scores['Coop CH'];
  }

  // Overall verdict
  const overallPct = ((reweWins / (reweWins + coopWins)) * 100).toFixed(0);
  console.log(`\n=== Overall verdict ===`);
  console.log(`REWE cheaper in ${overallPct}% of matched categories.`);
  if (reweWins > coopWins) {
    console.log('Germany is indeed cheaper — but not uniformly, and the gap varies a lot by category.');
  } else {
    console.log('Switzerland holds its own in several categories once you account for pack sizes.');
  }
}

main().catch(err => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
});
