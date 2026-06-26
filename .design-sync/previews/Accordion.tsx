import { Accordion } from 'react-os-shell';

// Accordion — collapsible sections. Uncontrolled with defaultOpenIds here.

export function FAQ() {
  return (
    <div className="max-w-lg p-5">
      <Accordion
        defaultOpenIds={['a']}
        items={[
          { id: 'a', title: 'What is included in the Pro plan?', content: 'Unlimited projects, priority support, and advanced analytics.' },
          { id: 'b', title: 'Can I change plans later?', content: 'Yes — upgrade or downgrade anytime from billing settings.' },
          { id: 'c', title: 'Do you offer refunds?', content: 'We offer a 30-day money-back guarantee on annual plans.' },
        ]}
      />
    </div>
  );
}
