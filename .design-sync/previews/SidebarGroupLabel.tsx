import { useState } from 'react';
import { SidebarGroupLabel, SidebarNavItem } from 'react-os-shell';

// SidebarGroupLabel — an uppercase section heading for a SidebarLayout filter
// sidebar, shown above a group of SidebarNavItems.

export function SectionedSidebar() {
  const [active, setActive] = useState('drafts');
  return (
    <div className="p-5 w-64 space-y-0.5">
      <SidebarGroupLabel>Status</SidebarGroupLabel>
      <SidebarNavItem label="Drafts" count={4} active={active === 'drafts'} onClick={() => setActive('drafts')} />
      <SidebarNavItem label="Active" count={27} active={active === 'active'} onClick={() => setActive('active')} />
      <div className="pt-2" />
      <SidebarGroupLabel>Type</SidebarGroupLabel>
      <SidebarNavItem label="Standard" count={19} active={active === 'standard'} onClick={() => setActive('standard')} />
      <SidebarNavItem label="Dropship" count={8} active={active === 'dropship'} onClick={() => setActive('dropship')} />
    </div>
  );
}
