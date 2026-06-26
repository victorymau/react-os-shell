import { Banner } from 'react-os-shell';

// Banner — static in-flow alert (the counterpart to the imperative toast).
// Tone drives bg/border/icon; text stays neutral for dark-mode legibility.

export function Tones() {
  return (
    <div className="max-w-lg space-y-3 p-5">
      <Banner tone="info" title="Heads up">A new version is available.</Banner>
      <Banner tone="success" title="Saved">Your changes were published.</Banner>
      <Banner tone="warning" title="Usage limit near">You've used 90% of your quota.</Banner>
      <Banner tone="danger" title="Payment failed" onDismiss={() => {}}>Update your card to avoid interruption.</Banner>
    </div>
  );
}
