import { CheckoutTemplate } from 'react-os-shell';

// CheckoutTemplate — two-column checkout: contact/shipping/payment form +
// order summary card with a Banner.

export function Checkout() {
  return (
    <div style={{ height: 820 }}>
      <CheckoutTemplate />
    </div>
  );
}
