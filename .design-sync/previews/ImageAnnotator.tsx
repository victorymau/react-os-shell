import { ImageAnnotator } from 'react-os-shell';

// ImageAnnotator layers vector annotations over an image on a <canvas> +
// <svg> stack and fills its container, so give it a fixed-height host. `src`
// must be a decodable image — an inline SVG data-URI standing in for a
// product screenshot keeps the preview self-contained. Standalone mode
// (onApply/onCancel) renders the Apply / Cancel pills in the toolbar.
const PHOTO = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#1e3a8a"/>
        <stop offset="1" stop-color="#0ea5e9"/>
      </linearGradient>
    </defs>
    <rect width="640" height="400" fill="url(#g)"/>
    <rect x="40" y="40" width="560" height="56" rx="10" fill="#ffffff" opacity="0.92"/>
    <circle cx="72" cy="68" r="12" fill="#3b82f6"/>
    <rect x="96" y="60" width="180" height="16" rx="6" fill="#cbd5e1"/>
    <rect x="40" y="120" width="270" height="240" rx="12" fill="#ffffff" opacity="0.92"/>
    <rect x="330" y="120" width="270" height="115" rx="12" fill="#ffffff" opacity="0.92"/>
    <rect x="330" y="245" width="270" height="115" rx="12" fill="#ffffff" opacity="0.92"/>
    <rect x="64" y="148" width="150" height="14" rx="5" fill="#94a3b8"/>
    <rect x="64" y="178" width="220" height="10" rx="5" fill="#e2e8f0"/>
    <rect x="64" y="198" width="200" height="10" rx="5" fill="#e2e8f0"/>
    <rect x="64" y="300" width="120" height="32" rx="8" fill="#3b82f6"/>
  </svg>`
)}`;

export function Standalone() {
  return (
    <div className="p-5">
      <div style={{ height: 480 }} className="rounded-lg border border-gray-200 overflow-hidden">
        <ImageAnnotator
          src={PHOTO}
          filename="dashboard-mockup.png"
          onApply={() => {}}
          onCancel={() => {}}
        />
      </div>
    </div>
  );
}

export function Embedded() {
  return (
    <div className="p-5">
      <div style={{ height: 480 }} className="rounded-lg border border-gray-200 overflow-hidden">
        <ImageAnnotator src={PHOTO} filename="screenshot-2026-06-26.png" />
      </div>
    </div>
  );
}
