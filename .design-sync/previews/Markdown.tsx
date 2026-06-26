import { Markdown } from 'react-os-shell';

// Markdown renders the subset used by in-app articles: ATX headings (## – ####),
// **bold**, *italic*, `inline code`, [links](url), bullet + numbered lists,
// blockquotes and tables — styled with the shell's typography.
const DOC = `## Keyboard shortcuts

The shell ships a small set of global shortcuts. Press **?** anywhere to open
the cheat-sheet.

### Windows

- **Cmd/Ctrl + K** — open global search
- **Alt + Shift + N** — new item in the active window
- **Esc** — close the frontmost modal

### Formatting

Inline \`code\`, **bold**, and *italic* all render. Links like
[react-os-shell](https://github.com/victorymau/react-os-shell) are styled too.

> Blockquotes call out the important bits.

1. Ordered lists keep their numbers
2. And wrap cleanly inside a window body
`;

export function HelpDoc() {
  return (
    <div className="p-6 max-w-2xl">
      <Markdown>{DOC}</Markdown>
    </div>
  );
}

export function ShortText() {
  return (
    <div className="p-6 max-w-2xl">
      <Markdown>{`Welcome back, **Victor**. You have *3* unread notifications and one window pinned on top. Open the [Help Center](#) for the full guide.`}</Markdown>
    </div>
  );
}
