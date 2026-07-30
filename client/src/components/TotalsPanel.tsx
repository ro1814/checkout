import { formatCents } from '../api';
import type { Quote } from '../types';

/**
 * Pure display of the server's numbers. Nothing here adds, subtracts or
 * rounds — the server is the source of truth for money.
 */
export function TotalsPanel({ quote, updating }: { quote: Quote; updating: boolean }) {
  return (
    <dl className={`totals${updating ? ' totals--updating' : ''}`} aria-live="polite" aria-busy={updating}>
      <div className="totals__row">
        <dt>Subtotal</dt>
        <dd>{formatCents(quote.subtotal_cents)}</dd>
      </div>
      {quote.discount_cents > 0 && (
        <div className="totals__row totals__row--discount">
          <dt>Discount{quote.promo?.status === 'applied' ? ` (${quote.promo.code})` : ''}</dt>
          <dd>−{formatCents(quote.discount_cents)}</dd>
        </div>
      )}
      <div className="totals__row">
        <dt>Shipping</dt>
        <dd>{quote.shipping_cents === 0 ? 'Free' : formatCents(quote.shipping_cents)}</dd>
      </div>
      <div className="totals__row totals__row--total">
        <dt>Total</dt>
        <dd>{formatCents(quote.total_cents)}</dd>
      </div>
      <div className="totals__row totals__row--vat">
        <dt>Includes VAT</dt>
        <dd>{formatCents(quote.vat_included_cents)}</dd>
      </div>
    </dl>
  );
}
