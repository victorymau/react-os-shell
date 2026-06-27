import { PdfActionButton } from 'react-os-shell';

// PdfActionButton — a dropdown button to Preview (in the shell's Preview
// window), Download, or Email a PDF. Transport-agnostic: the host supplies
// fetchPdf(); here it's a stub so the closed-dropdown button renders.

export function Default() {
  return (
    <div className="p-5 flex gap-3">
      <PdfActionButton fetchPdf={async () => null} filename="Invoice_INV-1043.pdf" label="Invoice PDF" />
    </div>
  );
}

export function WithEmail() {
  return (
    <div className="p-5 flex gap-3">
      <PdfActionButton
        fetchPdf={async () => null}
        filename="ProForma_PF-9921.pdf"
        label="Pro forma"
        onEmail={() => {}}
      />
    </div>
  );
}
