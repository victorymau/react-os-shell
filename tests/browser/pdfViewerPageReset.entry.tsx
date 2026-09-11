/**
 * A `PdfViewer` handed a second document, deliberately WITHOUT a `key`.
 *
 * Keying it would remount the component and hide the thing under test. A
 * consumer that must remember to key has not been given a working component.
 */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GlobalWorkerOptions } from 'pdfjs-dist';
import PdfViewer from '../../src/apps/PdfViewer';

// Served by scripts/test-browser.mjs from the installed pdfjs-dist. The package
// default is a unpkg URL, and a test that reaches the public internet fails
// when npm does.
GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

/** The smallest valid PDF with `pages` blank A4 pages, as an object URL. */
function pdfObjectUrl(pages: number): string {
  const objs = [
    '<</Type/Catalog/Pages 2 0 R>>',
    `<</Type/Pages/Kids[${Array.from({ length: pages }, (_, i) => `${i + 3} 0 R`).join(' ')}]/Count ${pages}>>`,
    ...Array.from({ length: pages }, () => '<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>'),
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(body.length); body += `${i + 1} 0 obj${o}endobj\n`; });
  const startxref = body.length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
    + offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')
    + `trailer<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${startxref}\n%%EOF\n`;
  const bytes = Uint8Array.from(body, c => c.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
}

const THREE_PAGES = pdfObjectUrl(3);
const ONE_PAGE = pdfObjectUrl(1);

function Harness() {
  const [url, setUrl] = useState(THREE_PAGES);
  return (
    <>
      <button type="button" data-testid="swap" onClick={() => setUrl(ONE_PAGE)}>
        Swap in the one-page document
      </button>
      <div style={{ height: 480, width: 900 }}>
        <PdfViewer url={url} filename={url === THREE_PAGES ? 'three.pdf' : 'one.pdf'} />
      </div>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
