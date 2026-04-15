/**
 * find-promotions.js
 * Utility function for extracting promotional items from a Pepesto /api/catalog response.
 *
 * The Pepesto catalog endpoint returns a `parsed_products` object keyed by product URL.
 * Promoted products carry `promo: true` and a `promo_percentage` field.
 *
 * Usage:
 *   import { findPromotions } from '../utils/find-promotions.js';
 *
 *   const catalog = await fetch('https://s.pepesto.com/api/catalog', { ... }).then(r => r.json());
 *   const promos = findPromotions(catalog.parsed_products, 10);
 *   // → [{ name, price, currency, promo_percentage, url }, ...]
 *
 * Used in: waitrose, migros, conad, plus-nl, auchan-pl scripts.
 */

/**
 * Extract and sort promoted products from a Pepesto catalog `parsed_products` object.
 *
 * @param {Record<string, object>} parsedProducts
 *   The `parsed_products` value from a POST /api/catalog response.
 * @param {number} [minPercentage=5]
 *   Only return items with a promo discount of at least this percentage.
 * @returns {Array<{ name: string, price: number, currency: string, promo_percentage: number, url: string }>}
 *   Sorted by promo_percentage descending (best deal first).
 */
export function findPromotions(parsedProducts, minPercentage = 5) {
  const results = [];

  for (const [url, product] of Object.entries(parsedProducts)) {
    if (!product.promo || typeof product.promo_percentage !== 'number') continue;
    if (product.promo_percentage < minPercentage) continue;

    // Prefer English name, fall back to any available locale
    const names = product.names ?? {};
    const name = names.en ?? names.pl ?? names.bg ?? names.no ?? names.nl ?? product.entity_name ?? 'Unknown product';

    results.push({
      name,
      price: product.price,
      currency: product.currency ?? 'EUR',
      promo_percentage: product.promo_percentage,
      url,
    });
  }

  // Best deal first
  results.sort((a, b) => b.promo_percentage - a.promo_percentage);

  return results;
}
