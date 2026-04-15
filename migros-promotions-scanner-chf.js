/**
 * Pepesto API Example — CHF Promotions Scanner
 * Supermarket: Migros (migros.ch)
 * Built with Pepesto: https://www.pepesto.com/built-with-pepesto/migros/
 * Docs: https://pepesto.com/api
 *
 * Run: node migros-promotions-scanner-chf.js
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
 * Fetches the full Migros CH product catalog.
 */
async function fetchMigrosCatalog() {
  console.log('Fetching Migros CH catalog...');
  const response = await fetch(`${API_BASE}/catalog`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ supermarket_domain: 'migros.ch' }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Pepesto API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data.parsed_products;
}

/**
 * Filters the catalog to only items with promo: true.
 * Returns an array sorted by promo_percentage descending.
 *
 * The catalog includes a promo_percentage field when available;
 * if it's absent we skip that product in the sorted output.
 */
function extractPromos(catalog) {
  const promos = [];

  for (const [url, product] of Object.entries(catalog)) {
    if (!product.promo) continue;

    promos.push({
      url,
      name: product.names?.en || product.names?.de || product.entity_name,
      nameDe: product.names?.de || '',
      entity: product.entity_name,
      price: product.price,
      currency: product.currency || 'CHF',
      quantityStr: product.quantity_str || '',
      pricePerUnit: product.price_per_meausure_unit || '',
      deadline: product.promo_deadline_yyyy_mm_dd || null,
      tags: product.tags || [],
    });
  }

  // Sort: items with a deadline first (soonest first), then remaining promos
  promos.sort((a, b) => {
    if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return a.price - b.price;
  });

  return promos;
}

/**
 * Groups promos by broad category (entity_name based).
 */
function groupByCategory(promos) {
  const groups = {};

  for (const p of promos) {
    const cat = p.entity;
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(p);
  }

  return groups;
}

/**
 * Formats the promo list as a plain-text email body.
 * In a real script you'd send this via SendGrid, Resend, or similar.
 */
function formatEmailBody(promos, fetchedAt) {
  const lines = [
    `Migros Promotions Summary — ${fetchedAt}`,
    `Total items on promotion: ${promos.length}`,
    '',
    '=== Items expiring soonest ===',
  ];

  const withDeadline = promos.filter(p => p.deadline).slice(0, 10);
  for (const p of withDeadline) {
    const price = `CHF ${(p.price / 100).toFixed(2)}`;
    lines.push(`  • ${p.name} (${p.quantityStr}) — ${price}  [expires ${p.deadline}]`);
  }

  lines.push('', '=== All current promotions ===');
  for (const p of promos) {
    const price = `CHF ${(p.price / 100).toFixed(2)}`;
    const tags = p.tags.length ? ` [${p.tags.join(', ')}]` : '';
    lines.push(`  • ${p.name} (${p.quantityStr}) — ${price}${tags}`);
  }

  lines.push('', '---');
  lines.push('Powered by the Pepesto Grocery API — https://pepesto.com/api');

  return lines.join('\n');
}

async function main() {
  console.log('=== Migros CH Promotions Scanner ===\n');

  const catalog = await fetchMigrosCatalog();
  console.log(`Catalog returned ${Object.keys(catalog).length} total products.\n`);

  const promos = extractPromos(catalog);
  const fetchedAt = new Date().toISOString().slice(0, 10);

  if (promos.length === 0) {
    console.log('No promotions found in today\'s catalog snapshot. Try again later.');
    return;
  }

  console.log(`Found ${promos.length} products on promotion.\n`);

  // Print top 20 by soonest deadline
  console.log('=== Promotions (soonest expiry first) ===\n');
  const display = promos.slice(0, 20);
  for (const p of display) {
    const price = `CHF ${(p.price / 100).toFixed(2)}`;
    const deadline = p.deadline ? ` — expires ${p.deadline}` : '';
    const tags = p.tags.length ? ` [${p.tags.join(', ')}]` : '';
    console.log(`  ${p.name.padEnd(50)} ${price.padEnd(12)} ${p.quantityStr.padEnd(10)}${deadline}${tags}`);
  }

  // Category breakdown
  const groups = groupByCategory(promos);
  console.log('\n=== Promos by category ===\n');
  const sorted = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  for (const [cat, items] of sorted.slice(0, 10)) {
    console.log(`  ${cat.padEnd(35)} ${items.length} item(s)`);
  }

  // Generate email body
  const emailBody = formatEmailBody(promos, fetchedAt);
  console.log('\n=== Email preview (first 20 lines) ===\n');
  console.log(emailBody.split('\n').slice(0, 20).join('\n'));
  console.log('...');
  console.log('\nIn production: pass emailBody to your email sender (Resend, SendGrid, etc.)');
}

main().catch(err => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
});
