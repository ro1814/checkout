import { formatCents } from '../api';
import type { OrderConfirmation } from '../types';

export function Confirmation({ order }: { order: OrderConfirmation }) {
  return (
    <div className="confirmation" role="status">
      <div className="confirmation__badge" aria-hidden="true">✓</div>
      <h2>Order confirmed</h2>
      <p>Thanks! Your payment of <strong>{formatCents(order.total_cents)}</strong> went through.</p>
      <p className="confirmation__id">
        Order reference: <code>{order.order_id}</code>
      </p>
    </div>
  );
}
