/**
 * Mock payment provider — behaviour depends on the card number.
 * Card numbers are never logged, stored, or returned anywhere in the app.
 */
const OUTCOMES = {
  4111111111111111: { approved: true },
  4000000000000002: { approved: false, reason: "card_declined" },
  4000000000000069: { approved: false, reason: "expired_card" },
};

export function authorize(cardNumber) {
  const normalized = String(cardNumber ?? "").replace(/\s+/g, "");
  return OUTCOMES[normalized] ?? { approved: false, reason: "card_declined" };
}
