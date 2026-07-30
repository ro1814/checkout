import { formatCents } from '../api';
import type { QuoteLineItem } from '../types';

export function CartList({ items }: { items: QuoteLineItem[] }) {
  return (
    <ul className="cart-list" aria-label="Cart items">
      {items.map((item) => (
        <li key={item.sku} className="cart-line">
          <div>
            <span className="cart-line__name">{item.name}</span>
            <span className="cart-line__meta">
              {formatCents(item.unit_price_cents)} × {item.quantity}
            </span>
          </div>
          <span className="cart-line__total">{formatCents(item.line_total_cents)}</span>
        </li>
      ))}
    </ul>
  );
}
