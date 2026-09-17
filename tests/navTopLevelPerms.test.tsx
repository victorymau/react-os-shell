import { test } from 'node:test';
import assert from 'node:assert/strict';
// Must come before the component imports — see the note in tests/dom.ts.
import { render, act } from './dom';
import StartMenu from '../src/shell/StartMenu';
import Sidebar from '../src/shell/Sidebar';
import { ShellAuthProvider } from '../src/shell/ShellAuth';
import type { NavItem, NavSection, StartMenuCategories } from '../src/shell/nav-types';

/**
 * A top-level nav row is permission-checked like every other row.
 *
 * `navSections` takes bare `NavItem`s beside the sections — a portal's
 * Dashboard, say. The desktop Start menu (both taskbar layouts) and the sidebar
 * split those out as `topItems` and drew them straight from the raw list, so a
 * row carrying `perms` or `allPerms` showed to users who held none of them and
 * opened a page that refused. Only the mobile sheet ran `navVisible` on them.
 * The customer portal had to drop such rows itself before handing the nav over.
 *
 * The same raw list decided whether the divider between the top rows and the
 * sections is drawn, so a menu whose only top-level row was hidden still drew
 * a rule above the sections with nothing on the other side of it.
 *
 * The sidebar had a second hole of the same kind: it told a section from a
 * virtual one by `'perms' in section`, so a section that set no `perms` of its
 * own skipped the row filter and drew every row inside it.
 */

const noop = () => {};

/** Mirrors a host's `hasAnyPerm`: true when ANY requested perm is granted. */
const allow = (granted: string[]) => (perms: string[]) => perms.some(p => granted.includes(p));

const DASHBOARD: NavItem = { to: '/dashboard', label: 'Dashboard', perms: ['view_dashboard'] };
const ORDERS: NavSection = { label: 'Orders', items: [{ to: '/orders', label: 'Order List' }] };
const CATEGORIES: StartMenuCategories = { erp: ['Orders'], system: [] };

const LAYOUTS = [
  { taskbarPosition: 'bottom', name: 'horizontal (bottom taskbar)' },
  { taskbarPosition: 'left', name: 'vertical (side taskbar)' },
] as const;

function mountStartMenu(
  taskbarPosition: 'bottom' | 'left',
  hasAnyPerm: (perms: string[]) => boolean,
  navSections: (NavSection | NavItem)[] = [DASHBOARD, ORDERS],
) {
  return render(
    <ShellAuthProvider value={{ hasAnyPerm }}>
      <StartMenu
        open
        onClose={noop}
        openPage={noop}
        openWindows={[]}
        profile={{ first_name: 'Test' }}
        user={{ email: 'test@example.com' }}
        onLogout={noop}
        onNavigate={noop}
        taskbarPosition={taskbarPosition}
        taskbarH={48}
        taskbarW={48}
        navSections={navSections}
        categories={CATEGORIES}
      />
    </ShellAuthProvider>,
  );
}

function mountSidebar(
  hasAnyPerm: (perms: string[]) => boolean,
  navSections: (NavSection | NavItem)[] = [DASHBOARD, ORDERS],
  categories: StartMenuCategories = CATEGORIES,
) {
  return render(
    <ShellAuthProvider value={{ hasAnyPerm }}>
      <Sidebar
        width={240}
        openPage={noop}
        profile={{ first_name: 'Test' }}
        user={{ email: 'test@example.com' }}
        onLogout={noop}
        onNavigate={noop}
        navSections={navSections}
        categories={categories}
      />
    </ShellAuthProvider>,
  );
}

const labels = (container: HTMLElement) =>
  [...container.querySelectorAll('button')].map(b => b.textContent?.trim());

/** The rules both menus draw between groups — `border-t … my-1.5 mx-2`. The
 *  search header and profile strip carry a border too, without the margins. */
const dividers = (container: HTMLElement) =>
  container.querySelectorAll('div.border-t.mx-2.my-1\\.5').length;

for (const { taskbarPosition, name } of LAYOUTS) {
  test(`Start menu, ${name}: a top-level row the user lacks perms for is hidden`, () => {
    const view = mountStartMenu(taskbarPosition, allow([]));
    try {
      assert.ok(!labels(view.container).includes('Dashboard'), `menu shows ${JSON.stringify(labels(view.container))}`);
      assert.ok(labels(view.container).includes('Orders'), 'the ungated section still renders');
    } finally {
      view.unmount();
    }
  });

  test(`Start menu, ${name}: the row shows once the permission is held`, () => {
    const view = mountStartMenu(taskbarPosition, allow(['view_dashboard']));
    try {
      assert.ok(labels(view.container).includes('Dashboard'));
    } finally {
      view.unmount();
    }
  });

  test(`Start menu, ${name}: allPerms gates a top-level row too`, () => {
    const priceSheets: NavItem = { to: '/price-sheets', label: 'Price Sheets', perms: ['view_sheet'], allPerms: ['view_prices'] };
    const view = mountStartMenu(taskbarPosition, allow(['view_sheet']), [priceSheets, ORDERS]);
    try {
      assert.ok(!labels(view.container).includes('Price Sheets'), 'holding perms alone is not enough');
    } finally {
      view.unmount();
    }
  });

  test(`Start menu, ${name}: a top-level group with no visible children is dropped`, () => {
    const reports: NavItem = { to: '/reports', label: 'Reports', children: [{ to: '/reports/sales', label: 'Sales', perms: ['view_sales'] }] };
    const view = mountStartMenu(taskbarPosition, allow([]), [reports, ORDERS]);
    try {
      assert.ok(!labels(view.container).includes('Reports'));
    } finally {
      view.unmount();
    }
  });

  test(`Start menu, ${name}: no divider when the only top-level row is hidden`, () => {
    // Control first: with the row visible the divider is there, so the zero
    // below is the condition working and not the selector missing.
    const shown = mountStartMenu(taskbarPosition, allow(['view_dashboard']));
    try {
      assert.equal(dividers(shown.container), 1, 'a visible top-level row is divided from the sections');
    } finally {
      shown.unmount();
    }
    const hidden = mountStartMenu(taskbarPosition, allow([]));
    try {
      assert.equal(dividers(hidden.container), 0, 'nothing is left above the sections to divide');
    } finally {
      hidden.unmount();
    }
  });
}

test('Sidebar: a top-level row the user lacks perms for is hidden', () => {
  const view = mountSidebar(allow([]));
  try {
    assert.ok(!labels(view.container).includes('Dashboard'), `sidebar shows ${JSON.stringify(labels(view.container))}`);
    assert.ok(labels(view.container).includes('Orders'), 'the ungated section still renders');
  } finally {
    view.unmount();
  }
  const granted = mountSidebar(allow(['view_dashboard']));
  try {
    assert.ok(labels(granted.container).includes('Dashboard'), 'and shows once the permission is held');
  } finally {
    granted.unmount();
  }
});

test('Sidebar: no divider when the only top-level row is hidden', () => {
  const shown = mountSidebar(allow(['view_dashboard']));
  try {
    assert.equal(dividers(shown.container), 1, 'a visible top-level row is divided from the sections');
  } finally {
    shown.unmount();
  }
  const hidden = mountSidebar(allow([]));
  try {
    assert.equal(dividers(hidden.container), 0, 'nothing is left above the sections to divide');
  } finally {
    hidden.unmount();
  }
});

test('Sidebar: rows inside a section that sets no perms of its own are still filtered', () => {
  // The customer portal's Help & Feedback section: no section-level `perms`,
  // and a Messages row gated on its own permission.
  const help: NavSection = {
    label: 'Help & Feedback',
    items: [
      { to: '/messages', label: 'Messages', perms: ['use_chat'] },
      { to: '/help', label: 'Help Centre' },
    ],
  };
  const view = mountSidebar(allow([]), [help], { erp: [], system: ['Help & Feedback'] });
  try {
    const header = [...view.container.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Help & Feedback');
    assert.ok(header, `sidebar shows ${JSON.stringify(labels(view.container))}`);
    act(() => { header.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    assert.ok(labels(view.container).includes('Help Centre'), 'the section expanded');
    assert.ok(!labels(view.container).includes('Messages'), 'the gated row inside it did not');
  } finally {
    view.unmount();
  }
});
