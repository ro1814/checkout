import { useEffect, useRef, useState } from 'react';
import { ApiRequestError, fetchQuote, placeOrder } from './api';
import type { CartItem, Country, OrderConfirmation, Quote, ShippingMethod } from './types';
import { CartList } from './components/CartList';
import { PromoField } from './components/PromoField';
import { TotalsPanel } from './components/TotalsPanel';
import { Confirmation } from './components/Confirmation';

// Demo cart. The brief's checkout summary step starts from an existing cart,
// so this is fixed data rather than an editable basket.
const CART: CartItem[] = [
  { sku: 'TSHIRT-001', quantity: 2 },
  { sku: 'MUG-042', quantity: 1 },
];

const COUNTRIES: { code: Country; label: string }[] = [
  { code: 'ES', label: 'Spain' },
  { code: 'PT', label: 'Portugal' },
  { code: 'FR', label: 'France' },
  { code: 'IT', label: 'Italy' },
  { code: 'DE', label: 'Germany' },
];

const DECLINE_MESSAGES: Record<string, string> = {
  card_declined: 'Your card was declined. Please try a different card.',
  expired_card: 'That card has expired. Please use a different card.',
};

export default function App() {
  // Quote inputs
  const [country, setCountry] = useState<Country>('ES');
  const [shippingMethod, setShippingMethod] = useState<ShippingMethod>('standard');
  const [promoCode, setPromoCode] = useState<string | null>(null);

  // Quote state. The last good quote is kept on screen while a new one loads,
  // so the totals don't flicker to a spinner on every change.
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteUpdating, setQuoteUpdating] = useState(true);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  // Order state
  const [email, setEmail] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<OrderConfirmation | null>(null);

  // One idempotency key per payment attempt. It is reused when retrying after
  // a network failure (that's the whole point — the retry can't double-charge)
  // and discarded when the inputs change or a card is declined, since those
  // are genuinely new orders/attempts.
  const idempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    // Inputs changed: any in-flight payment attempt context is stale.
    idempotencyKey.current = null;

    const controller = new AbortController();
    setQuoteUpdating(true);
    setQuoteError(null);

    fetchQuote(
      { items: CART, country, shipping_method: shippingMethod, promo_code: promoCode ?? undefined },
      controller.signal,
    )
      .then((q) => {
        setQuote(q);
        setQuoteUpdating(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return; // a newer request took over
        setQuoteError(err instanceof ApiRequestError ? err.message : 'We couldn’t update your totals. Check your connection and retry.');
        setQuoteUpdating(false);
      });

    // Cleanup aborts the stale request: if the country changes twice quickly,
    // only the latest quote can ever reach state. Latest request wins.
    return () => controller.abort();
  }, [country, shippingMethod, promoCode, retryTick]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!quote || quoteUpdating || quoteError || submitting) return;

    idempotencyKey.current ??= crypto.randomUUID();
    setSubmitting(true);
    setOrderError(null);

    try {
      const order = await placeOrder(
        {
          items: CART,
          country,
          shipping_method: shippingMethod,
          promo_code: promoCode ?? undefined,
          email: email.trim(),
          card_number: cardNumber.replace(/\s+/g, ''),
        },
        idempotencyKey.current,
      );
      setConfirmation(order);
    } catch (err: unknown) {
      if (err instanceof ApiRequestError && err.code === 'payment_declined') {
        setOrderError(DECLINE_MESSAGES[err.reason ?? ''] ?? 'Payment was declined.');
        idempotencyKey.current = null; // a new attempt is a new payment
      } else if (err instanceof ApiRequestError) {
        setOrderError(err.message);
        idempotencyKey.current = null;
      } else {
        // Network error: keep the key so the retry is idempotent.
        setOrderError('We couldn’t reach the server. Your card was not charged twice — retry safely.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (confirmation) {
    return (
      <main className="page">
        <Confirmation order={confirmation} />
      </main>
    );
  }

  const busy = quoteUpdating || submitting;

  return (
    <main className="page">
      <header className="page__header">
        <h1>Checkout</h1>
        <p className="page__sub">Review your order and pay</p>
      </header>

      <form className="layout" onSubmit={handleSubmit}>
        <section className="card" aria-labelledby="cart-heading">
          <h2 id="cart-heading">Your order</h2>
          {quote && <CartList items={quote.items} />}
        </section>

        <section className="card" aria-labelledby="delivery-heading">
          <h2 id="delivery-heading">Delivery</h2>

          <label className="field">
            <span className="field__label">Country</span>
            <select value={country} onChange={(e) => setCountry(e.target.value as Country)} disabled={submitting}>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
            </select>
          </label>

          <fieldset className="field" disabled={submitting}>
            <legend className="field__label">Shipping method</legend>
            {(quote?.shipping_options ?? []).map((option) => (
              <label key={option.method} className="radio">
                <input
                  type="radio"
                  name="shipping_method"
                  value={option.method}
                  checked={shippingMethod === option.method}
                  onChange={() => setShippingMethod(option.method)}
                />
                <span className="radio__label">
                  {option.label} <span className="radio__eta">({option.eta_days} days)</span>
                </span>
                <span className="radio__price">{option.price_cents === 0 ? 'Free' : `€${(option.price_cents / 100).toFixed(2)}`}</span>
              </label>
            ))}
          </fieldset>

          <PromoField
            promo={quote?.promo ?? null}
            disabled={busy}
            onApply={(code) => setPromoCode(code)}
            onRemove={() => setPromoCode(null)}
          />
        </section>

        <section className="card card--summary" aria-labelledby="summary-heading">
          <h2 id="summary-heading">Summary</h2>

          {quoteError ? (
            <div className="error-panel" role="alert">
              <p>{quoteError}</p>
              <button type="button" className="btn btn--secondary" onClick={() => setRetryTick((t) => t + 1)}>
                Retry
              </button>
            </div>
          ) : quote ? (
            <TotalsPanel quote={quote} updating={quoteUpdating} />
          ) : (
            <p className="loading" role="status">Loading your totals…</p>
          )}

          <label className="field">
            <span className="field__label">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
              disabled={submitting}
            />
          </label>

          <label className="field">
            <span className="field__label">Card number</span>
            <input
              type="text"
              inputMode="numeric"
              value={cardNumber}
              onChange={(e) => setCardNumber(e.target.value)}
              placeholder="4111 1111 1111 1111"
              autoComplete="cc-number"
              required
              disabled={submitting}
            />
            <span className="field__hint">Test cards: 4111… approves, 4000…0002 declines, 4000…0069 is expired.</span>
          </label>

          {orderError && (
            <p className="order-error" role="alert">{orderError}</p>
          )}

          <button type="submit" className="btn btn--primary" disabled={busy || !!quoteError || !quote}>
            {submitting ? 'Placing order…' : quote && !quoteUpdating ? `Pay €${(quote.total_cents / 100).toFixed(2)}` : 'Updating totals…'}
          </button>
        </section>
      </form>
    </main>
  );
}
