import { DonutChart } from 'react-os-shell';

// DonutChart — ring chart with a translucent track and a palette of segments.

export function Traffic() {
  return (
    <div className="p-6">
      <DonutChart
        size={140}
        thickness={18}
        centerLabel={<span className="text-gray-900">100%</span>}
        segments={[
          { label: 'Direct', value: 45 },
          { label: 'Search', value: 30 },
          { label: 'Social', value: 15 },
          { label: 'Email', value: 10 },
        ]}
      />
    </div>
  );
}
