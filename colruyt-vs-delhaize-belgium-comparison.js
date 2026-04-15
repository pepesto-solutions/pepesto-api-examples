/**
 * Pepesto API Example — Belgian Supermarket Showdown: Colruyt vs Delhaize
 * Supermarket: Colruyt (colruyt.be) vs Delhaize (delhaize.be)
 * Built with Pepesto: https://www.pepesto.com/built-with-pepesto/colruyt/
 * Docs: https://pepesto.com/api
 *
 * Run: node colruyt-vs-delhaize-belgium-comparison.js
 * Requires: PEPESTO_API_KEY env var
 */

const API_BASE = 'https://s.pepesto.com/api';
const API_KEY = process.env.PEPESTO_API_KEY;

if (!API_KEY) {
  console.error('Error: PEPESTO_API_KEY environment variable is not set.');
  console.error('Get your API key at https://www.pepesto.com/ai-grocery-shopping-agent/#setup-authentication');
  process.exit(1);
}

/**
 * Fetches the full product catalog for a given supermarket domain.
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
 * Groups entity names into Belgian grocery categories.
 */
function categorise(entityName) {
  const meat = ['Ground pork', 'Beef', 'Lamb chops', 'Ham', 'Chicken', 'Sausage', 'Bacon', 'Minced beef', 'Salami', 'Pork'];
  const dairy = ['Milk', 'Butter', 'Cheese', 'Eggs', 'Cream', 'Yoghurt', 'Mozzarella cheese', 'Fresh cheese'];
  const produce = ['Tomatoes', 'Carrots', 'Onions', 'Garlic', 'Lettuce', 'Potatoes', 'Mushrooms', 'Radishes', 'Spinach', 'Apples', 'Pears'];
  const canned = ['Canned pineapple', 'Canned tomatoes', 'Chickpeas', 'Peaches', 'Canned corn', 'Dried tomatoes'];
  const drinks = ['Beer', 'Wine', 'Juice', 'Water', 'Soda', 'Coffee', 'Tea'];
  const pantry = ['Pasta', 'Spaghetti', 'Rice', 'Flour', 'Sugar', 'Olive oil', 'Sunflower oil', 'Salt', 'Bread'];

  if (meat.includes(entityName)) return 'Meat & charcuterie';
  if (dairy.includes(entityName)) return 'Dairy & eggs';
  if (produce.includes(entityName)) return 'Fruit & vegetables';
  if (canned.includes(entityName)) return 'Canned & preserved';
  if (drinks.includes(entityName)) return 'Drinks';
  if (pantry.includes(entityName)) return 'Pantry staples';
  return 'Other';
}

/**
 * Builds an entity→cheapest-product index from a catalog.
 * Skips unavailable products.
 */
function buildEntityIndex(catalog) {
  const index = {};

  for (const [url, product] of Object.entries(catalog)) {
    if (product.unavailable) continue;
    const entity = product.entity_name;
    if (!entity) continue;

    const existing = index[entity];
    if (!existing || product.price < existing.price) {
      index[entity] = {
        name: product.names?.en || product.names?.nl || entity,
        price: product.price,
        currency: product.currency || 'EUR',
        quantityStr: product.quantity_str || '',
        pricePerUnit: product.price_per_meausure_unit || '',
        promo: product.promo || false,
        url,
      };
    }
  }

  return index;
}

/**
 * Matches entities present in both stores and compares prices.
 */
function compareStores(colruytIndex, delhaizeIndex) {
  const matches = [];

  for (const entity of Object.keys(colruytIndex)) {
    if (!delhaizeIndex[entity]) continue;

    const colruyt = colruytIndex[entity];
    const delhaize = delhaizeIndex[entity];
    const diffCents = colruyt.price - delhaize.price;
    const diffPct = ((colruyt.price - delhaize.price) / delhaize.price) * 100;

    matches.push({
      entity,
      category: categorise(entity),
      colruyt: { name: colruyt.name, price: colruyt.price, quantityStr: colruyt.quantityStr, promo: colruyt.promo },
      delhaize: { name: delhaize.name, price: delhaize.price, quantityStr: delhaize.quantityStr, promo: delhaize.promo },
      diffCents,
      diffPct: diffPct.toFixed(1),
      winner: diffCents < 0 ? 'Colruyt' : diffCents > 0 ? 'Delhaize' : 'tie',
    });
  }

  matches.sort((a, b) => Math.abs(b.diffCents) - Math.abs(a.diffCents));
  return matches;
}

/**
 * Calculates a category-level scorecard.
 */
function categoryScorecard(matches) {
  const cards = {};

  for (const m of matches) {
    if (!cards[m.category]) {
      cards[m.category] = { Colruyt: 0, Delhaize: 0, tie: 0, total: 0 };
    }
    cards[m.category][m.winner]++;
    cards[m.category].total++;
  }

  return cards;
}

function fmt(cents) {
  return `€${(cents / 100).toFixed(2)}`;
}

async function main() {
  console.log('=== Colruyt vs Delhaize — Belgian Grocery Price Showdown ===\n');
  console.log('Fetching both catalogs in parallel...\n');

  const [colruytCatalog, delhaizeCatalog] = await Promise.all([
    fetchCatalog('colruyt.be'),
    fetchCatalog('delhaize.be'),
  ]);

  console.log(`Colruyt:  ${Object.keys(colruytCatalog).length} products`);
  console.log(`Delhaize: ${Object.keys(delhaizeCatalog).length} products\n`);

  const colruytIndex = buildEntityIndex(colruytCatalog);
  const delhaizeIndex = buildEntityIndex(delhaizeCatalog);

  const matches = compareStores(colruytIndex, delhaizeIndex);
  console.log(`Matched ${matches.length} product categories between the two stores.\n`);

  // Top 15 biggest differences
  console.log('=== Biggest price differences ===\n');
  console.log(`${'Product'.padEnd(30)} ${'Colruyt'.padEnd(12)} ${'Delhaize'.padEnd(12)} ${'Diff'.padEnd(8)} Winner`);
  console.log('─'.repeat(80));

  for (const m of matches.slice(0, 15)) {
    const col = fmt(m.colruyt.price);
    const del = fmt(m.delhaize.price);
    const diff = `${m.diffPct > 0 ? '+' : ''}${m.diffPct}%`;
    const winner = m.winner === 'Colruyt' ? '← Colruyt' : m.winner === 'Delhaize' ? '← Delhaize' : 'tie';
    console.log(`${m.entity.padEnd(30)} ${col.padEnd(12)} ${del.padEnd(12)} ${diff.padEnd(8)} ${winner}`);
  }

  // Category scorecard
  const scorecard = categoryScorecard(matches);
  console.log('\n=== Category scorecard ===\n');
  console.log(`${'Category'.padEnd(28)} ${'Colruyt wins'.padEnd(16)} ${'Delhaize wins'.padEnd(16)} ${'Total items'}`);
  console.log('─'.repeat(72));

  let totalColruyt = 0, totalDelhaize = 0;
  for (const [cat, scores] of Object.entries(scorecard)) {
    console.log(
      `${cat.padEnd(28)} ${String(scores.Colruyt).padEnd(16)} ${String(scores.Delhaize).padEnd(16)} ${scores.total}`
    );
    totalColruyt += scores.Colruyt;
    totalDelhaize += scores.Delhaize;
  }

  // Verdict
  const total = totalColruyt + totalDelhaize;
  const colruytPct = ((totalColruyt / total) * 100).toFixed(0);
  console.log('\n=== Verdict ===\n');
  console.log(`Colruyt cheaper:  ${colruytPct}% of matched product categories`);
  console.log(`Delhaize cheaper: ${(100 - parseInt(colruytPct))}% of matched product categories\n`);

  if (totalColruyt > totalDelhaize) {
    console.log('Colruyt wins overall — consistent with its reputation as Belgium\'s');
    console.log('price leader. But Delhaize competes on specific categories (ready meals,');
    console.log('premium produce) and is more conveniently located in city centres.');
  } else {
    console.log('Delhaize edges ahead in this snapshot — though results vary week to week');
    console.log('depending on which store currently has the most promotions running.');
  }

  console.log('\nRun this weekly to track how the gap changes over time.');
}

main().catch(err => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
});
