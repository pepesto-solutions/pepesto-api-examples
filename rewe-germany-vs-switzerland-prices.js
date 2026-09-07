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

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${API_KEY}`,
};

// The basket both countries have to price. Generic names on purpose:
// /products resolves each one to whatever that chain actually stocks, which is
// what makes a German price and a Swiss price comparable at all. Keep it to 30
// items — that is what /parse accepts in one shopping list.
const BASKET = [
  'milk', 'butter', 'cheese', 'mozzarella cheese', 'eggs', 'yoghurt',
  'beef', 'ground pork', 'chicken', 'bacon', 'sausage',
  'tomatoes', 'onions', 'garlic', 'carrots', 'potatoes', 'lettuce', 'apples', 'bananas',
  'spaghetti', 'rice', 'flour', 'sugar', 'salt', 'olive oil', 'bread',
  'coffee', 'tea', 'orange juice', 'sparkling water',
];

/**
 * Turns the shopping list into a kg_token. Sending the same token to both
 * chains is what lets the two baskets line up item by item.
 */
async function parseBasket() {
  console.log(`Parsing a ${BASKET.length}-item basket...`);
  const response = await fetch(`${API_BASE}/parse`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ recipe_text: BASKET.join('\n') }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Pepesto API error — ${response.status}: ${errorText}`);
  }

  const { kg_token } = await response.json();
  return kg_token;
}

/**
 * Prices the basket at one chain.
 */
async function priceBasketAt(kgToken, domain) {
  console.log(`Pricing the basket at ${domain}...`);
  const response = await fetch(`${API_BASE}/products`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ recipe_kg_tokens: [kgToken], supermarket_domain: domain }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Pepesto API error for ${domain} — ${response.status}: ${errorText}`);
  }

  return response.json();
}

/**
 * Converts a /products response to a map of item → cheapest product, with the
 * price in EUR cents. Each item comes back with several candidate products; the
 * cheapest is kept, so the two countries are always compared on the best price
 * each store offers. Swiss prices go through the conversion rate first.
 */
function buildCategoryIndex(productsData, currency) {
  const index = {};

  for (const item of productsData.items ?? []) {
    const cheapest = (item.products ?? [])
      .filter(p => typeof p.product?.price?.price === 'number')
      .sort((a, b) => a.product.price.price - b.product.price.price)[0];
    if (!cheapest) continue;

    const price = cheapest.product.price.price;
    const priceEurCents = currency === 'CHF' ? Math.round(price * CHF_TO_EUR) : price;

    index[item.item_name] = {
      name: cheapest.product.product_name || item.item_name,
      priceEurCents,
      originalPrice: price,
      originalCurrency: currency,
      url: cheapest.product.product_id || '',
    };
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
      rewe: { name: rewe.name, priceEurCents: rewe.priceEurCents },
      coop: {
        name: coop.name,
        priceEurCents: coop.priceEurCents,
        originalPrice: coop.originalPrice,
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

  const kgToken = await parseBasket();

  // Price the same basket at both chains in parallel
  const [reweData, coopData] = await Promise.all([
    priceBasketAt(kgToken, 'shop.rewe.de'),
    priceBasketAt(kgToken, 'coop.ch'),
  ]);

  // Build the indexes (cheapest product per item, per store)
  const reweIndex = buildCategoryIndex(reweData, 'EUR');
  const coopIndex = buildCategoryIndex(coopData, 'CHF');

  console.log(`\nREWE priced up ${Object.keys(reweIndex).length} of the ${BASKET.length} items`);
  console.log(`Coop CH priced up ${Object.keys(coopIndex).length} of the ${BASKET.length} items\n`);

  // Find items both stores matched and compare
  const matches = compareMarkets(reweIndex, coopIndex);
  console.log(`Found ${matches.length} items present in both stores.\n`);

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
