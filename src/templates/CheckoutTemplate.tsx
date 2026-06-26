/**
 * CheckoutTemplate — a two-column checkout: contact/shipping/payment form on the
 * left, an order summary card on the right. Built from Card + FormField + the
 * form inputs + Button, with a Banner for a promo/notice.
 */
import { useState } from 'react';
import Card from '../shell/Card';
import Banner from '../shell/Banner';
import Button from '../forms/Button';
import Input from '../forms/Input';
import Select from '../forms/Select';
import Checkbox from '../forms/Checkbox';
import FormField from '../forms/FormField';

const ITEMS = [
  { name: 'Mechanical keyboard', qty: 1, price: 129 },
  { name: 'USB-C cable (2m)', qty: 2, price: 12 },
  { name: 'Laptop stand', qty: 1, price: 48 },
];

export default function CheckoutTemplate() {
  const [sameAddress, setSameAddress] = useState(true);
  const [country, setCountry] = useState('us');
  const subtotal = ITEMS.reduce((s, i) => s + i.qty * i.price, 0);
  const shipping = 9;
  const total = subtotal + shipping;

  return (
    <div className="h-full overflow-auto bg-gray-50 p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <h1 className="text-xl font-semibold text-gray-900">Checkout</h1>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* Form */}
          <form className="space-y-5 lg:col-span-2" onSubmit={e => e.preventDefault()}>
            <Card header="Contact">
              <div className="space-y-4">
                <FormField label="Email" htmlFor="ck-email" required>
                  <Input id="ck-email" type="email" placeholder="you@example.com" />
                </FormField>
              </div>
            </Card>

            <Card header="Shipping address">
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField label="First name" required><Input placeholder="Alice" /></FormField>
                  <FormField label="Last name" required><Input placeholder="Nguyen" /></FormField>
                </div>
                <FormField label="Address" required><Input placeholder="123 Market St" /></FormField>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <FormField label="City"><Input placeholder="San Francisco" /></FormField>
                  <FormField label="ZIP"><Input placeholder="94103" /></FormField>
                  <FormField label="Country">
                    <Select
                      value={country}
                      onChange={setCountry}
                      options={[
                        { value: 'us', label: 'United States' },
                        { value: 'de', label: 'Germany' },
                        { value: 'jp', label: 'Japan' },
                      ]}
                    />
                  </FormField>
                </div>
                <Checkbox checked={sameAddress} onChange={setSameAddress} label="Billing address same as shipping" />
              </div>
            </Card>

            <Card header="Payment">
              <div className="space-y-4">
                <FormField label="Card number" required><Input placeholder="1234 5678 9012 3456" /></FormField>
                <div className="grid grid-cols-2 gap-4">
                  <FormField label="Expiry" required><Input placeholder="MM / YY" /></FormField>
                  <FormField label="CVC" required><Input placeholder="123" /></FormField>
                </div>
              </div>
            </Card>
          </form>

          {/* Summary */}
          <div className="space-y-4">
            <Card header="Order summary">
              <ul className="space-y-2 text-sm">
                {ITEMS.map(i => (
                  <li key={i.name} className="flex items-center justify-between gap-2 text-gray-700">
                    <span>{i.name} <span className="text-gray-400">×{i.qty}</span></span>
                    <span>${i.qty * i.price}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 space-y-1.5 border-t border-gray-100 pt-3 text-sm text-gray-600">
                <div className="flex justify-between"><span>Subtotal</span><span>${subtotal}</span></div>
                <div className="flex justify-between"><span>Shipping</span><span>${shipping}</span></div>
                <div className="flex justify-between text-base font-semibold text-gray-900"><span>Total</span><span>${total}</span></div>
              </div>
              <Button block className="mt-4">Pay ${total}</Button>
            </Card>
            <Banner tone="success" title="Promo applied">Free returns within 30 days.</Banner>
          </div>
        </div>
      </div>
    </div>
  );
}
