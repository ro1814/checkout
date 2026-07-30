import {
  CATALOGUE,
  SHIPPING_TABLE,
  ES_FREE_SHIPPING_THRESHOLD_CENTS,
  VAT_RATES,
  ETAS,
  PROMOS,
} from "./fixtures.js";
import { percentageOf, vatIncluded } from "./money.js";

/** Thrown for invalid input; the API layer maps it to a 400 response. */
export class ValidationError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = "ValidationError";
    this.code = code;
  }
}

const SHIPPING_METHODS = ["standard", "express"];

/** Validates cart shape and returns enriched line items. Throws ValidationError. */
export function validateItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new ValidationError(
      "empty_cart",
      "Cart must contain at least one item",
    );
  }
  return items.map((item) => {
    const product = CATALOGUE[item?.sku];
    if (!product) {
      throw new ValidationError("unknown_sku", `Unknown SKU: ${item?.sku}`);
    }
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new ValidationError(
        "invalid_quantity",
        `Quantity for ${item.sku} must be a positive integer`,
      );
    }
    return {
      sku: item.sku,
      name: product.name,
      quantity: item.quantity,
      unit_price_cents: product.unit_price_cents,
      line_total_cents: product.unit_price_cents * item.quantity,
    };
  });
}

/**
 * Validates a promo code against the (pre-discount) subtotal.
 * Never throws for a bad code — the quote must still succeed, the customer
 * still needs to see their price. Returns null when no code was sent.
 */
export function evaluatePromo(promoCode, subtotalCents) {
  if (promoCode === undefined || promoCode === null || promoCode === "")
    return null;

  const promo = PROMOS[promoCode];
  if (!promo) {
    return { code: promoCode, status: "rejected", reason: "not_found" };
  }
  if (promo.state === "redeemed") {
    return { code: promoCode, status: "rejected", reason: "already_redeemed" };
  }
  // Min spend is checked against the subtotal *before* any discount.
  if (subtotalCents < promo.min_spend_cents) {
    return { code: promoCode, status: "rejected", reason: "min_spend_not_met" };
  }
  return {
    code: promoCode,
    status: "applied",
    description: promo.description,
    type: promo.type,
    value: promo.value,
  };
}

/** Price of one shipping option, applying ES threshold + free-shipping promo. */
function shippingPriceFor(
  country,
  method,
  discountedSubtotalCents,
  freeShippingApplies,
) {
  if (freeShippingApplies) return 0;
  const base = SHIPPING_TABLE[country][method];
  if (
    country === "ES" &&
    method === "standard" &&
    discountedSubtotalCents >= ES_FREE_SHIPPING_THRESHOLD_CENTS
  ) {
    return 0;
  }
  return base;
}

/**
 * The full quote. Follows the brief's pricing steps in this exact order:
 *  1. subtotal = Σ (unit_price × quantity)
 *  2. validate promo against subtotal (min spend before any discount)
 *  3. discount: percentage → round_half_up; free shipping → discount 0, selected shipping becomes 0
 *  4. discounted_subtotal = subtotal − discount
 *  5. shipping from the table; ES free threshold checked against discounted_subtotal
 *  6. total = discounted_subtotal + shipping
 *  7. vat_included = total − round_half_up(total / (1 + rate))
 */
export function quote({ items, country, shipping_method, promo_code }) {
  const lineItems = validateItems(items);

  if (!SHIPPING_TABLE[country]) {
    throw new ValidationError(
      "country_not_supported",
      `Country ${country} is not supported`,
    );
  }
  if (!SHIPPING_METHODS.includes(shipping_method)) {
    throw new ValidationError(
      "invalid_shipping_method",
      `Unknown shipping method: ${shipping_method}`,
    );
  }

  // 1. subtotal
  const subtotal_cents = lineItems.reduce(
    (sum, li) => sum + li.line_total_cents,
    0,
  );

  // 2. promo validation (never fails the quote)
  const promo = evaluatePromo(promo_code, subtotal_cents);
  const promoApplied = promo?.status === "applied";

  // 3. discount
  let discount_cents = 0;
  if (promoApplied && promo.type === "percentage") {
    discount_cents = percentageOf(subtotal_cents, promo.value);
  }
  const freeShippingApplies = promoApplied && promo.type === "free_shipping";

  // 4. discounted subtotal
  const discounted_subtotal_cents = subtotal_cents - discount_cents;

  // 5. shipping — the free-shipping promo zeroes only the *selected* option
  const etas = ETAS[country === "ES" ? "ES" : "other"];
  const shipping_options = SHIPPING_METHODS.map((method) => ({
    method,
    label: method === "standard" ? "Standard" : "Express",
    price_cents: shippingPriceFor(
      country,
      method,
      discounted_subtotal_cents,
      freeShippingApplies && method === shipping_method,
    ),
    eta_days: etas[method],
  }));
  const shipping_cents = shipping_options.find(
    (o) => o.method === shipping_method,
  ).price_cents;

  // 6. total
  const total_cents = discounted_subtotal_cents + shipping_cents;

  // 7. VAT-included line
  const vat_included_cents = vatIncluded(total_cents, VAT_RATES[country]);

  return {
    currency: "EUR",
    items: lineItems,
    subtotal_cents,
    discount_cents,
    shipping_cents,
    total_cents,
    vat_included_cents,
    promo: promo
      ? {
          code: promo.code,
          status: promo.status,
          ...(promo.status === "applied"
            ? { description: promo.description }
            : { reason: promo.reason }),
        }
      : null,
    shipping_options,
  };
}
