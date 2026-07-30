// Fixture data — exactly as given in the brief. All amounts are integer cents, EUR, VAT-inclusive.

export const CATALOGUE = {
  "TSHIRT-001": { name: "Classic Tee", unit_price_cents: 1999 },
  "MUG-042": { name: "Enamel Mug", unit_price_cents: 1250 },
  "SOCK-007": { name: "Wool Socks", unit_price_cents: 890 },
};

// Base shipping prices per country (cents)
export const SHIPPING_TABLE = {
  ES: { standard: 499, express: 999 },
  PT: { standard: 799, express: 1499 },
  FR: { standard: 799, express: 1499 },
  IT: { standard: 799, express: 1499 },
  DE: { standard: 799, express: 1499 },
};

// Standard shipping to ES is free when the *discounted* subtotal is >= this
export const ES_FREE_SHIPPING_THRESHOLD_CENTS = 5000;

// VAT rates (%), used only for the "includes VAT" line
export const VAT_RATES = { ES: 21, PT: 23, FR: 20, IT: 22, DE: 19 };

export const ETAS = {
  ES: { standard: "3-5", express: "1-2" },
  other: { standard: "4-7", express: "2-3" },
};

export const PROMOS = {
  WELCOME10: {
    type: "percentage",
    value: 10,
    min_spend_cents: 3000,
    state: "active",
    description: "10% off",
  },
  FREESHIP: {
    type: "free_shipping",
    min_spend_cents: 2500,
    state: "active",
    description: "Free shipping",
  },
  VIP50: {
    type: "percentage",
    value: 50,
    min_spend_cents: 0,
    state: "redeemed",
    description: "50% off",
  },
};
