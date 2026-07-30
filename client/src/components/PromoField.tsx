import { useState } from 'react';
import type { PromoStatus } from '../types';

const REJECTION_MESSAGES: Record<string, string> = {
  not_found: "We don't recognise that code. Check the spelling and try again.",
  already_redeemed: 'This code has already been used.',
  min_spend_not_met: "Your order doesn't reach the minimum spend for this code.",
};

interface Props {
  promo: PromoStatus | null;
  disabled: boolean;
  onApply: (code: string) => void;
  onRemove: () => void;
}

/**
 * The promo input only fires a request when the customer presses Apply (or
 * Enter) — never on keystrokes. Applying sets the code in App state, which
 * triggers a single new quote.
 */
export function PromoField({ promo, disabled, onApply, onRemove }: Props) {
  const [draft, setDraft] = useState('');

  const submit = () => {
    const code = draft.trim().toUpperCase();
    if (code) onApply(code);
  };

  if (promo?.status === 'applied') {
    return (
      <div className="promo promo--applied" role="status">
        <span>
          Code <strong>{promo.code}</strong> applied — {promo.description}
        </span>
        <button type="button" className="btn-link" onClick={() => { setDraft(''); onRemove(); }}>
          Remove
        </button>
      </div>
    );
  }

  return (
    <div className="promo">
      <div className="promo__row">
        <label className="field">
          <span className="field__label">Promo code</span>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
            placeholder="e.g. WELCOME10"
            autoComplete="off"
            autoCapitalize="characters"
            disabled={disabled}
          />
        </label>
        <button type="button" className="btn btn--secondary" onClick={submit} disabled={disabled || !draft.trim()}>
          Apply
        </button>
      </div>
      {promo?.status === 'rejected' && (
        <p className="promo__error" role="alert">
          {REJECTION_MESSAGES[promo.reason] ?? 'This code can’t be applied.'}
        </p>
      )}
    </div>
  );
}
