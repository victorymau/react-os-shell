import { Banner, Button } from 'react-os-shell';

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

// `action` puts the fix in the banner. A notice that names a condition and
// leaves the remedy three menus away is the common shape of a banner nobody
// acts on — so the control sits at the right edge, after the text and before
// the dismiss ×, vertically centred and never squeezed by a message that wraps.

export function WithActions() {
  return (
    <div className="max-w-lg space-y-3 p-5">
      <Banner
        tone="warning" title="Two invoices are overdue"
        action={<Button size="sm" variant="secondary">Review</Button>}
      >
        Payment terms lapse on Friday.
      </Banner>
      <Banner
        tone="danger" title="Payment failed" onDismiss={() => {}}
        action={<Button size="sm" variant="danger">Update card</Button>}
      >
        We could not charge the card ending 4821.
      </Banner>
      {/* A long message wraps; the button keeps its size and its centre line. */}
      <Banner
        tone="info"
        action={<Button size="sm" variant="secondary">Import</Button>}
      >
        Three hundred and twelve supplier part numbers in the last upload have no
        match in the catalogue, and will be skipped unless you import them first.
      </Banner>
      {/* Solid: the action inherits the banner's white ink rather than being
          restyled by the slot, so a caller's variant survives. */}
      <Banner
        tone="danger" emphasis="solid" title="Offline"
        action={<Button size="sm" variant="secondary">Retry</Button>}
      >
        This till cannot take payment until the server is back.
      </Banner>
    </div>
  );
}
