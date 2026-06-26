import { BarChart } from 'react-os-shell';

// BarChart — simple dependency-free bar chart. Bar color from the parent
// `text-*` class, or per-bar via `colors`.

const DATA = [12, 18, 14, 22, 19, 27, 24, 31];
const LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S', 'M'];

export function Weekly() {
  return (
    <div className="max-w-md p-5 text-blue-600">
      <BarChart data={DATA} labels={LABELS} height={140} />
    </div>
  );
}
