/**
 * Pepesto API Example — IE vs GB price gap: same products, different prices
 * Supermarket: Tesco IE (tesco.ie) vs Tesco GB (tesco.com)
 * Built with Pepesto: https://www.pepesto.com/built-with-pepesto/tesco-ie/
 * Docs: https://pepesto.com/api
 *
 * Run: node tesco-ie-vs-gb-price-gap.js
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

async function fetchCatalog(domain) {
  console.log(`Fetching catalog for ${domain}...`);
  const res = await fetch(`${BASE_URL}/catalog`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ supermarket_domain: domain }),
  });
  if (!res.ok) throw new Error(`/catalog ${domain} failed: ${res.status}`);
  const data = await res.json();
  return data.parsed_products;
}

function buildEntityMap(products) {
  const map = {};
  for (const [url, product] of Object.entries(products)) {
    const key = product.entity_name;
    if (!map[key]) map[key] = [];
    map[key].push({ url, ...product });
  }
  return map;
}

function bestPrice(products) {
  return products.reduce((min, p) => p.price < min.price ? p : min, products[0]);
}

async function main() {
  // Fetch both catalogs in parallel
  const [ieProducts, gbProducts] = await Promise.all([
    fetchCatalog('tesco.ie'),
    fetchCatalog('tesco.com'),
  ]);

  const ieMap = buildEntityMap(ieProducts);
  const gbMap = buildEntityMap(gbProducts);

  // Find entities present in both catalogs
  const shared = Object.keys(ieMap).filter(e => gbMap[e]);

  console.log(`\nComparing ${shared.length} shared product categories between Tesco IE and Tesco GB`);
  console.log('Note: prices shown in local currency (EUR for IE, GBP for GB).');
  console.log('EUR/GBP are approximately at parity for easy comparison.\n');

  const rows = [];
  for (const entity of shared) {
    const ie = bestPrice(ieMap[entity]);
    const gb = bestPrice(gbMap[entity]);
    const ieCents  = ie.price;
    const gbPence  = gb.price;
    const diff     = ieCents - gbPence; // negative = IE cheaper
    rows.push({
      entity,
      ieName: ie.names?.en ?? "No name provided",
      gbName: gb.names?.en ?? "No name provided",
      ieCents,
      gbPence,
      diff,
    });
  }

  // Sort: biggest gap first
  rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  console.log('=== Top price differences ===\n');
  rows.slice(0, 20).forEach(r => {
    const ieStr  = `€${(r.ieCents / 100).toFixed(2)} (${r.ieName})`;
    const gbStr  = `£${(r.gbPence / 100).toFixed(2)} (${r.gbName})`;
    const winner = r.diff < 0 ? 'IE cheaper' : 'GB cheaper';
    const gap    = `${Math.abs(r.diff / 100).toFixed(2)}`;
    console.log(`${r.entity.padEnd(28)} IE: ${ieStr.padEnd(40)} GB: ${gbStr.padEnd(40)} → ${winner} by ${gap}`);
  });

  // Summary stats
  const ieCheaper = rows.filter(r => r.diff < 0).length;
  const gbCheaper = rows.filter(r => r.diff > 0).length;

  console.log('\n=== Summary ===');
  console.log(`Categories where IE is cheaper: ${ieCheaper}`);
  console.log(`Categories where GB is cheaper: ${gbCheaper}`);
  console.log(`Categories with equal price:    ${rows.length - ieCheaper - gbCheaper}`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
