/**
 * format-currency.js
 * Utility functions for formatting grocery prices from the Pepesto API.
 *
 * Pepesto returns prices as integers (smallest currency unit):
 *   NOK/PLN/BGN  → øre / groszy / stotinki  (divide by 100)
 *   EUR/GBP/CHF  → cents                     (divide by 100)
 *
 * Usage:
 *   import { formatPrice, pricePerUnit } from '../utils/format-currency.js';
 *   formatPrice(4990, 'NOK')          // → "49.90 kr"
 *   pricePerUnit(4990, 'NOK', 'kg')   // → "49.90 kr / kg"
 */

const CURRENCY_CONFIG = {
  EUR: { symbol: '€', position: 'before', divisor: 100 },
  GBP: { symbol: '£', position: 'before', divisor: 100 },
  CHF: { symbol: 'CHF ', position: 'before', divisor: 100 },
  NOK: { symbol: ' kr', position: 'after', divisor: 100 },
  PLN: { symbol: ' zł', position: 'after', divisor: 100 },
  BGN: { symbol: ' лв.', position: 'after', divisor: 100 },
  // Aliases used in some Pepesto catalog responses
  kr:  { symbol: ' kr', position: 'after', divisor: 100 },
  zł:  { symbol: ' zł', position: 'after', divisor: 100 },
};

/**
 * Format a price integer from the Pepesto API into a human-readable string.
 *
 * @param {number} priceCents - Price as returned by the API (integer, smallest unit)
 * @param {string} currency   - Currency code or symbol (e.g. "NOK", "PLN", "EUR", "kr", "zł")
 * @returns {string}          - e.g. "49.90 kr", "€4.99", "CHF 3.50"
 */
export function formatPrice(priceCents, currency) {
  const config = CURRENCY_CONFIG[currency] ?? { symbol: ` ${currency}`, position: 'after', divisor: 100 };
  const amount = (priceCents / config.divisor).toFixed(2);

  return config.position === 'before'
    ? `${config.symbol}${amount}`
    : `${amount}${config.symbol}`;
}

/**
 * Format a price per unit string (e.g. "49.90 kr / kg").
 *
 * @param {number} priceCents - Price as returned by the API (integer, smallest unit)
 * @param {string} currency   - Currency code or symbol
 * @param {string} unitStr    - Unit label (e.g. "kg", "l", "100g")
 * @returns {string}          - e.g. "49.90 kr / kg"
 */
export function pricePerUnit(priceCents, currency, unitStr) {
  return `${formatPrice(priceCents, currency)} / ${unitStr}`;
}
