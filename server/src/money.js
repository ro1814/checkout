/**
 * Money helpers. All amounts are integer cents — no floats anywhere.
 *
 * divRoundHalfUp(a, b) computes round_half_up(a / b) using only integer
 * arithmetic, so results are exact:
 *   floor((2a + b) / 2b) === round-half-up of a/b for non-negative integers.
 */
export function divRoundHalfUp(numerator, denominator) {
  if (
    !Number.isInteger(numerator) ||
    !Number.isInteger(denominator) ||
    denominator <= 0 ||
    numerator < 0
  ) {
    throw new TypeError(
      "divRoundHalfUp expects non-negative integer numerator and positive integer denominator",
    );
  }
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

/** round_half_up(amount * pct / 100) for a percentage discount, in cents. */
export function percentageOf(amountCents, pct) {
  return divRoundHalfUp(amountCents * pct, 100);
}

/**
 * VAT portion of a VAT-inclusive total:
 *   vat_included = total - round_half_up(total / (1 + rate))
 * With rate as an integer percent: total / (1 + rate) === total * 100 / (100 + ratePct)
 */
export function vatIncluded(totalCents, ratePct) {
  const net = divRoundHalfUp(totalCents * 100, 100 + ratePct);
  return totalCents - net;
}
