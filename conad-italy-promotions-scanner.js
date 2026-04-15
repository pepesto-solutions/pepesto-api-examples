/**
 * Pepesto API Example — Best Italian promotions this week at Conad
 * Supermarket: Conad (spesaonline.conad.it)
 * Built with Pepesto: https://www.pepesto.com/built-with-pepesto/conad/
 * Docs: https://pepesto.com/api
 *
 * Run: node conad-italy-promotions-scanner.js
 * Requires: PEPESTO_API_KEY env var
 */

const BASE_URL = 'https://s.pepesto.com/api';
const API_KEY  = process.env.PEPESTO_API_KEY;

if (!API_KEY) {
  console.error('Set PEPESTO_API_KEY before running.');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${API_KEY}`,
};

async function fetchConadCatalog() {
  console.log('Fetching full Conad catalog...');
  const res = await fetch(`${BASE_URL}/catalog`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ supermarket_domain: 'spesaonline.conad.it' }),
  });
  if (!res.ok) throw new Error(`/catalog failed: ${res.status}`);
  const data = await res.json();
  return data.parsed_products;
}

function formatPrice(cents) {
  return `€${(cents / 100).toFixed(2)}`;
}

async function main() {
  const catalog = await fetchConadCatalog();
  const allProducts = Object.entries(catalog);

  console.log(`Catalog contains ${allProducts.length} products total.\n`);

  // Filter to products currently on promotion
  const onPromo = allProducts
    .filter(([, p]) => p.promo === true)
    .map(([url, p]) => ({ url, ...p }));

  console.log(`Found ${onPromo.length} products currently on promotion.\n`);

  // Sort by lowest absolute price (best deals relative to quantity)
  // We compute price-per-100g where available, else sort by raw price
  const scored = onPromo.map(p => {
    // Try to extract a numeric per-unit price for fair comparison
    let perUnitScore = p.price;
    if (p.price_per_meausure_unit) {
      const match = p.price_per_meausure_unit.match(/([\d.,]+)/);
      if (match) perUnitScore = parseFloat(match[1].replace(',', '.')) * 100;
    }
    return { ...p, perUnitScore };
  }).sort((a, b) => a.perUnitScore - b.perUnitScore);

  // Display top 25 deals
  const TOP_N = 25;
  console.log(`=== Top ${TOP_N} Conad promotions this week ===\n`);

  scored.slice(0, TOP_N).forEach((p, i) => {
    const name      = p.names.en || p.names.it;
    const price     = formatPrice(p.price);
    const qty       = p.quantity_str || '';
    const deadline  = p.promo_deadline_yyyy_mm_dd ? ` (until ${p.promo_deadline_yyyy_mm_dd})` : '';
    const perUnit   = p.price_per_meausure_unit ? ` @ ${p.price_per_meausure_unit}` : '';
    const category  = p.entity_name;
    const rank      = String(i + 1).padStart(2, ' ');

    console.log(`${rank}. ${name}`);
    console.log(`    Category: ${category} | ${qty} | ${price}${perUnit}${deadline}`);
    if (p.tags && p.tags.length > 0) {
      console.log(`    Tags: ${p.tags.join(', ')}`);
    }
    console.log();
  });

  // Category breakdown
  const byCategory = {};
  onPromo.forEach(p => {
    byCategory[p.entity_name] = (byCategory[p.entity_name] || 0) + 1;
  });
  const topCategories = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  console.log('=== Categories with most promotions ===\n');
  topCategories.forEach(([cat, count]) => {
    console.log(`  ${cat.padEnd(30)} ${count} product${count > 1 ? 's' : ''} on promo`);
  });
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
