import { HelpCenter, Markdown, type HelpCenterDoc } from 'react-os-shell';

/**
 * Demo for the shell's <HelpCenter> — the searchable, two-pane docs viewer a
 * consumer portal feeds its own help articles into. Bodies here are markdown
 * rendered through the shell's <Markdown> component via `renderBody` (the
 * default renderer is preformatted text). Try the search box, collapse a
 * category, or open the draft article to see the Draft badge.
 */

const doc = (
  id: string, category: string, category_label: string, title: string,
  body: string, is_published = true,
  // .trim(): template literals open with a newline, which would otherwise
  // glue an empty first line onto the opening `##` heading block.
): HelpCenterDoc => ({ id, slug: id, title, body: body.trim(), category, category_label, is_published });

const DOCS: HelpCenterDoc[] = [
  doc('welcome', 'getting_started', 'Getting Started', 'Welcome to react-os-shell', `
## What is this?

A **desktop-style UI shell** for React apps: windows, taskbar, start menu,
desktop shortcuts, widgets and a set of bundled apps — published as a single
npm package that portals compose with their own nav, entities and branding.

- Open apps from the start menu (bottom-left) or desktop shortcuts
- Windows minimize to the taskbar, tile, and remember their positions
- Press \`⌘K\` to search, \`?\` for keyboard shortcuts

This Help Center itself is a shell component — the demo feeds it these
markdown articles the same way a real portal feeds its help-desk content.
`),
  doc('windows', 'getting_started', 'Getting Started', 'Working with windows', `
## Windows 101

Every app and entity opens in a **window**:

- Drag the title bar to move, edges to resize
- The title-bar icon menu has **Add to Desktop** — pins a shortcut
- **Exposé** (taskbar right-click) tiles every open window for picking
- Windows restore their last size and position per route
`),
  doc('desktop', 'desktop', 'Desktop', 'Desktop, folders & the trash', `
## The desktop surface

- **Right-click** the wallpaper for sticky notes, folders, widgets and snap-to-grid
- Drag shortcuts onto a **folder** to file them; folders open in the Files app
- The **Trash** is selectable like any icon and opens the Files trash view
- **Widgets** (Weather, Currency, World Clock…) are managed from the right-click menu
`),
  doc('search', 'components', 'Components', 'Global search (⌘K)', `
## Universal search

Press \`⌘K\` anywhere. The shell fans the query out to every registered
**SearchProvider** in parallel and merges the results — in this demo, a
people directory and a project list. Picking a result opens the matching
**entity window** through the window registry.
`),
  doc('data-grid', 'components', 'Components', 'Data & layout primitives', `
## Build screens from the same parts

The Components menu in the start menu opens isolated demos:

- **List** — sortable, resizable, selectable data grid (EntityList)
- **Grid** — spreadsheet-style editable grid (EditableGrid)
- **Kanban** — drag-and-drop board
- **Sidebar / Top Nav / Breadcrumbs** — layout chrome
- **Status Badges** — one palette for every status in the system
`),
  doc('roadmap', 'components', 'Components', 'Roadmap (draft)', `
## Ideas under consideration

- Multi-page letter documents with page breaks
- Shared cursors on the spreadsheet
- Third-party widget API

Nothing here is committed — this draft article exists to show the **Draft**
badge and how unpublished docs render for editors.
`, false),
];

export default function HelpCenterDemo() {
  return (
    <HelpCenter
      docs={DOCS}
      categoryOrder={['getting_started', 'desktop', 'components']}
      renderBody={(d) => <Markdown>{d.body}</Markdown>}
    />
  );
}
