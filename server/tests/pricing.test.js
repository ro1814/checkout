import { quote, ValidationError } from "../src/pricing.js";
import { divRoundHalfUp, percentageOf, vatIncluded } from "../src/money.js";

// Base cart used across tests: 2 × Classic Tee (1999) + 1 × Enamel Mug (1250) = 5248
const CART = [
  { sku: "TSHIRT-001", quantity: 2 },
  { sku: "MUG-042", quantity: 1 },
];

describe("money helpers (integer round-half-up)", () => {
  test("rounds .5 up", () => {
    expect(divRoundHalfUp(889, 2)).toBe(445); // 444.5 -> 445
    expect(divRoundHalfUp(887, 2)).toBe(444); // 443.5 -> 444
  });
  test("percentage discount matches the brief example: 10% of 5248 -> 525", () => {
    expect(percentageOf(5248, 10)).toBe(525); // 524.8 rounds up
  });
  test("vat_included = total - round_half_up(total / (1 + rate))", () => {
    // 4723 gross at 21%: net = rhu(4723 / 1.21) = rhu(3903.30) = 3903 -> VAT 820 (brief example)
    expect(vatIncluded(4723, 21)).toBe(820);
  });
});

describe("quote: subtotal, shipping and VAT", () => {
  test("ES standard, no promo: subtotal 5248 crosses the ES free-shipping threshold", () => {
    const q = quote({
      items: CART,
      country: "ES",
      shipping_method: "standard",
    });
    expect(q.subtotal_cents).toBe(5248);
    expect(q.discount_cents).toBe(0);
    expect(q.shipping_cents).toBe(0); // 5248 >= 5000 -> free standard
    expect(q.total_cents).toBe(5248);
    expect(q.vat_included_cents).toBe(5248 - divRoundHalfUp(5248 * 100, 121));
  });

  test("DE standard: flat 799 shipping, 19% VAT line", () => {
    const q = quote({
      items: [{ sku: "SOCK-007", quantity: 3 }],
      country: "DE",
      shipping_method: "standard",
    });
    expect(q.subtotal_cents).toBe(2670);
    expect(q.shipping_cents).toBe(799);
    expect(q.total_cents).toBe(3469);
    expect(q.vat_included_cents).toBe(3469 - divRoundHalfUp(3469 * 100, 119)); // 554
  });

  test("unsupported country is rejected with country_not_supported", () => {
    expect(() =>
      quote({ items: CART, country: "US", shipping_method: "standard" }),
    ).toThrow(expect.objectContaining({ code: "country_not_supported" }));
  });

  test("unknown SKU and bad quantities are rejected", () => {
    expect(() =>
      quote({
        items: [{ sku: "NOPE", quantity: 1 }],
        country: "ES",
        shipping_method: "standard",
      }),
    ).toThrow(ValidationError);
    expect(() =>
      quote({
        items: [{ sku: "MUG-042", quantity: 0 }],
        country: "ES",
        shipping_method: "standard",
      }),
    ).toThrow(ValidationError);
  });
});

describe("quote: promo codes", () => {
  test("WELCOME10 applies 10% (round half up) and its discount can push ES back under the free-shipping threshold", () => {
    const q = quote({
      items: CART,
      country: "ES",
      shipping_method: "standard",
      promo_code: "WELCOME10",
    });
    expect(q.promo).toEqual({
      code: "WELCOME10",
      status: "applied",
      description: "10% off",
    });
    expect(q.discount_cents).toBe(525); // rhu(5248 * 10 / 100)
    // Discounted subtotal 4723 < 5000, so the threshold (checked against the
    // discounted subtotal, per the pricing steps) no longer grants free shipping.
    expect(q.shipping_cents).toBe(499);
    expect(q.total_cents).toBe(4723 + 499);
  });

  test("min spend is checked before any discount: 1250 cart rejects WELCOME10 but the quote still succeeds", () => {
    const q = quote({
      items: [{ sku: "MUG-042", quantity: 1 }],
      country: "ES",
      shipping_method: "standard",
      promo_code: "WELCOME10",
    });
    expect(q.promo).toEqual({
      code: "WELCOME10",
      status: "rejected",
      reason: "min_spend_not_met",
    });
    expect(q.discount_cents).toBe(0);
    expect(q.total_cents).toBe(1250 + 499);
  });

  test("VIP50 is single-use and already redeemed", () => {
    const q = quote({
      items: CART,
      country: "ES",
      shipping_method: "standard",
      promo_code: "VIP50",
    });
    expect(q.promo).toEqual({
      code: "VIP50",
      status: "rejected",
      reason: "already_redeemed",
    });
    expect(q.discount_cents).toBe(0);
  });

  test("unknown code is rejected with not_found, quote still succeeds", () => {
    const q = quote({
      items: CART,
      country: "ES",
      shipping_method: "standard",
      promo_code: "BOGUS",
    });
    expect(q.promo).toEqual({
      code: "BOGUS",
      status: "rejected",
      reason: "not_found",
    });
  });

  test("FREESHIP: discount stays 0 and the selected shipping option becomes 0", () => {
    const q = quote({
      items: CART,
      country: "PT",
      shipping_method: "express",
      promo_code: "FREESHIP",
    });
    expect(q.discount_cents).toBe(0);
    expect(q.shipping_cents).toBe(0);
    expect(q.total_cents).toBe(5248);
    const express = q.shipping_options.find((o) => o.method === "express");
    const standard = q.shipping_options.find((o) => o.method === "standard");
    expect(express.price_cents).toBe(0); // selected option zeroed
    expect(standard.price_cents).toBe(799); // the other option keeps its price
  });

  test("FREESHIP below its 2500 min spend is rejected and shipping is charged", () => {
    const q = quote({
      items: [{ sku: "SOCK-007", quantity: 1 }],
      country: "ES",
      shipping_method: "standard",
      promo_code: "FREESHIP",
    });
    expect(q.promo.reason).toBe("min_spend_not_met");
    expect(q.shipping_cents).toBe(499);
  });
});
