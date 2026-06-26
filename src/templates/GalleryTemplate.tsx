/**
 * GalleryTemplate — a media/photo grid with a Tabs filter and Card tiles that
 * carry a StatusBadge overlay. Tiles use a gradient placeholder (inline style)
 * in place of real images. Scrollable page.
 */
import { useState } from 'react';
import Card from '../shell/Card';
import Tabs from '../shell/Tabs';
import Button from '../forms/Button';
import StatusBadge, { StatusBadgeProvider } from '../shell/StatusBadge';
import type { SemanticGroup } from '../shell/StatusBadge';

const GROUPS: Record<string, SemanticGroup> = { featured: 'success', new: 'active', draft: 'draft' };

const GRADIENTS = [
  'linear-gradient(135deg,#60a5fa,#a78bfa)',
  'linear-gradient(135deg,#34d399,#10b981)',
  'linear-gradient(135deg,#fbbf24,#f59e0b)',
  'linear-gradient(135deg,#f472b6,#ec4899)',
  'linear-gradient(135deg,#38bdf8,#6366f1)',
  'linear-gradient(135deg,#fb7185,#ef4444)',
  'linear-gradient(135deg,#4ade80,#22c55e)',
  'linear-gradient(135deg,#c084fc,#8b5cf6)',
];

const ITEMS = GRADIENTS.map((g, i) => ({
  id: i,
  title: ['Sunrise', 'Forest', 'Desert', 'Bloom', 'Ocean', 'Ember', 'Meadow', 'Dusk'][i],
  tag: ['featured', 'new', 'draft'][i % 3],
  bg: g,
}));

export default function GalleryTemplate() {
  const [filter, setFilter] = useState('all');
  const shown = filter === 'all' ? ITEMS : ITEMS.filter(i => i.tag === filter);

  return (
    <StatusBadgeProvider groups={GROUPS}>
      <div className="h-full overflow-auto bg-gray-50 p-6">
        <div className="mx-auto max-w-5xl space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-xl font-semibold text-gray-900">Gallery</h1>
            <Button size="sm">Upload</Button>
          </div>

          <Tabs
            value={filter}
            onChange={setFilter}
            variant="pill"
            items={[
              { id: 'all', label: 'All' },
              { id: 'featured', label: 'Featured' },
              { id: 'new', label: 'New' },
              { id: 'draft', label: 'Drafts' },
            ]}
          />

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {shown.map(item => (
              <Card key={item.id} padded={false} className="overflow-hidden">
                <div className="relative h-28" style={{ background: item.bg }}>
                  <span className="absolute right-2 top-2"><StatusBadge status={item.tag} /></span>
                </div>
                <div className="flex items-center justify-between gap-2 p-3">
                  <span className="truncate text-sm font-medium text-gray-900">{item.title}</span>
                  <span className="text-xs text-gray-400">2.4 MB</span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </StatusBadgeProvider>
  );
}
