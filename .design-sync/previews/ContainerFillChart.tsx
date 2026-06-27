import { ContainerFillChart } from 'react-os-shell';

// ContainerFillChart — visualizes a loading list as shipping containers and
// their fill %. Per-unit volume is supplied via getVolume (the lifted app
// concern). When actuals exist, each container row layers instruction (blue)
// and loaded (green) bars.

interface Line { part_number: string; quantity: number; actual_qty: number; vol: number; }

const ITEMS: Line[] = [
  { part_number: 'WHL-18-SLV', quantity: 120, actual_qty: 120, vol: 0.09 },
  { part_number: 'WHL-19-BLK', quantity: 80, actual_qty: 60, vol: 0.11 },
  { part_number: 'WHL-20-GLD', quantity: 40, actual_qty: 0, vol: 0.14 },
  { part_number: 'HUB-CAP-STD', quantity: 200, actual_qty: 200, vol: 0.01 },
];

export function Loaded() {
  return (
    <div className="p-5">
      <ContainerFillChart
        items={ITEMS}
        getVolume={(i) => i.vol}
        isFilled={(i) => Boolean(i.part_number)}
        qtyField="instruction"
        showNewIndicator
      />
    </div>
  );
}
