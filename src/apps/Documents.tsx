/**
 * Documents — windowed viewer / light editor for plain-text and Word
 * documents. TXT-family files (.txt, .md, .csv, .log, .json, .xml,
 * .html, .css, .ts, .tsx, .js, .jsx, .py, .yml, .yaml, .toml, .sh)
 * open in an editable textarea. Word .docx files are converted to
 * read-only HTML via mammoth (an optional peer dep).
 *
 * Open files via the toolbar's Open button or by dragging them onto
 * the window.
 */
import { useState, useRef, useEffect } from 'react';
import { WindowTitle } from '../shell/Modal';
import toast from '../shell/toast';

const TITLE_DISPLAY_MAX = 24;
function truncateForTitle(s: string) {
  return s.length > TITLE_DISPLAY_MAX ? `${s.slice(0, TITLE_DISPLAY_MAX - 1)}…` : s;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c] || c));
}

const TEXT_EXTS = new Set([
  'txt', 'md', 'markdown', 'csv', 'tsv', 'log', 'json', 'xml',
  'html', 'htm', 'css', 'js', 'jsx', 'ts', 'tsx', 'py', 'rb',
  'go', 'rs', 'java', 'c', 'h', 'cpp', 'hpp', 'sh', 'bash',
  'yml', 'yaml', 'toml', 'ini', 'conf', 'env', 'sql',
]);
const DOCX_EXTS = new Set(['docx']);

interface DocData {
  filename: string;
  kind: 'text' | 'docx';
  content: string;
  /** Original mime / extension hint for the download button. */
  ext: string;
}

export default function Documents() {
  const [data, setData] = useState<DocData | null>(null);
  const [busy, setBusy] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [edited, setEdited] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  // Apply a formatting command to the current selection in the editor.
  const exec = (cmd: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
    setEdited(true);
  };

  // Pull current HTML out of the editor (for save).
  const getEditorHtml = () => editorRef.current?.innerHTML ?? '';
  const getEditorText = () => editorRef.current?.innerText ?? '';

  const ingestFile = async (file: File) => {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    setBusy(true);
    try {
      if (TEXT_EXTS.has(ext) || (!DOCX_EXTS.has(ext) && file.type.startsWith('text/'))) {
        const text = await file.text();
        // Convert plain text → HTML so the contenteditable shows
        // line breaks correctly. Escape HTML special chars first.
        const html = escapeHtml(text).replace(/\n/g, '<br>');
        setData({ filename: file.name, kind: 'text', content: html, ext });
        setEdited(false);
      } else if (DOCX_EXTS.has(ext)) {
        try {
          // mammoth is an optional peer dep — convert .docx → HTML.
          const mammoth = await import(/* @vite-ignore */ 'mammoth' as any);
          const buf = await file.arrayBuffer();
          const result = await mammoth.convertToHtml({ arrayBuffer: buf });
          setData({ filename: file.name, kind: 'docx', content: result.value || '<p><em>(empty document)</em></p>', ext });
          setEdited(false);
        } catch (err) {
          toast.error('Install the optional "mammoth" peer dep to read .docx files.');
        }
      } else if (ext === 'doc') {
        toast.error('.doc is the legacy Word binary format — convert to .docx first.');
      } else {
        toast.error(`Unsupported file type: .${ext || 'unknown'}`);
      }
    } finally {
      setBusy(false);
    }
  };

  const handlePick = () => fileRef.current?.click();
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) ingestFile(file);
    if (fileRef.current) fileRef.current.value = '';
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) ingestFile(file);
  };

  const downloadCurrent = () => {
    if (!data) return;
    const html = getEditorHtml();
    if (data.kind === 'text') {
      // If the user added formatting, save as .html alongside; otherwise
      // strip back to plain text so the original .txt round-trips cleanly.
      const hasFormatting = /<(b|strong|i|em|u|font|span style)/i.test(html);
      if (hasFormatting) {
        const blob = new Blob([`<!doctype html><meta charset="utf-8"><title>${escapeHtml(data.filename)}</title><body style="font-family:ui-monospace,monospace;white-space:pre-wrap">${html}`], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `${data.filename.replace(/\.[^.]+$/, '')}.html`; a.click();
        URL.revokeObjectURL(url);
      } else {
        const text = getEditorText();
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = data.filename; a.click();
        URL.revokeObjectURL(url);
      }
    } else {
      const blob = new Blob([`<!doctype html><meta charset="utf-8"><title>${escapeHtml(data.filename)}</title>${html}`], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${data.filename.replace(/\.docx$/i, '')}.html`; a.click();
      URL.revokeObjectURL(url);
    }
  };

  const titleName = data?.filename ? truncateForTitle(data.filename) : 'Untitled';

  return (
    <div
      className="relative flex flex-col h-full"
      onDragOver={(e) => { e.preventDefault(); if (!isDragging) setIsDragging(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setIsDragging(false); }}
      onDrop={handleDrop}
    >
      <WindowTitle title={`${titleName}${edited ? ' •' : ''} - Documents`} />

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-gray-50 shrink-0">
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.md,.csv,.tsv,.log,.json,.xml,.html,.htm,.css,.js,.jsx,.ts,.tsx,.py,.rb,.go,.rs,.java,.c,.h,.cpp,.hpp,.sh,.bash,.yml,.yaml,.toml,.ini,.conf,.env,.sql,.docx,text/*"
          onChange={handleFile}
          className="hidden"
        />
        <button onClick={handlePick} className="text-xs text-gray-700 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-200 transition-colors flex items-center gap-1">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
          </svg>
          Open
        </button>
        {data && (
          <button onClick={downloadCurrent} className="text-xs text-gray-700 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-200 transition-colors">
            Save
          </button>
        )}
        <span className="text-[10px] text-gray-400 ml-1">TXT · DOCX · Code</span>
        {data?.filename && (
          <>
            <div className="h-4 w-px bg-gray-300 mx-1" />
            <span className="text-xs font-medium text-gray-700 truncate max-w-[200px]" title={data.filename}>
              {data.filename}{edited ? ' •' : ''}
            </span>
          </>
        )}

        {/* Formatting toolbar — only meaningful when a document is open. */}
        {data && (
          <>
            <div className="h-4 w-px bg-gray-300 mx-1" />
            <div className="flex items-center gap-0.5">
              <button onMouseDown={e => e.preventDefault()} onClick={() => exec('bold')}
                className="px-2 py-1 text-xs rounded font-bold text-gray-700 hover:bg-gray-200 transition-colors" title="Bold">B</button>
              <button onMouseDown={e => e.preventDefault()} onClick={() => exec('italic')}
                className="px-2 py-1 text-xs rounded italic text-gray-700 hover:bg-gray-200 transition-colors" title="Italic">I</button>
              <button onMouseDown={e => e.preventDefault()} onClick={() => exec('underline')}
                className="px-2 py-1 text-xs rounded underline text-gray-700 hover:bg-gray-200 transition-colors" title="Underline">U</button>
              <button onMouseDown={e => e.preventDefault()} onClick={() => exec('strikeThrough')}
                className="px-2 py-1 text-xs rounded line-through text-gray-700 hover:bg-gray-200 transition-colors" title="Strikethrough">S</button>
            </div>
            <div className="h-4 w-px bg-gray-300 mx-1" />
            <select onMouseDown={e => e.preventDefault()} onChange={e => { exec('fontSize', e.target.value); e.currentTarget.value = ''; }}
              defaultValue="" className="text-xs border border-gray-300 rounded px-1 py-0.5 bg-white">
              <option value="" disabled>Size</option>
              <option value="1">XS</option>
              <option value="2">S</option>
              <option value="3">M</option>
              <option value="4">L</option>
              <option value="5">XL</option>
              <option value="6">2XL</option>
            </select>
            <input type="color" defaultValue="#000000" onChange={e => exec('foreColor', e.target.value)}
              className="w-7 h-6 border border-gray-300 rounded cursor-pointer" title="Text color" />
            <div className="h-4 w-px bg-gray-300 mx-1" />
            <button onMouseDown={e => e.preventDefault()} onClick={() => exec('insertUnorderedList')}
              className="px-2 py-1 text-xs rounded text-gray-700 hover:bg-gray-200 transition-colors" title="Bulleted list">• List</button>
            <button onMouseDown={e => e.preventDefault()} onClick={() => exec('insertOrderedList')}
              className="px-2 py-1 text-xs rounded text-gray-700 hover:bg-gray-200 transition-colors" title="Numbered list">1.</button>
          </>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {busy ? (
          <div className="flex items-center justify-center h-full text-sm text-gray-400">Loading…</div>
        ) : !data ? (
          <EmptyState onPick={handlePick} />
        ) : (
          <div className={`h-full overflow-auto ${data.kind === 'docx' ? 'bg-gray-100 px-12 py-10' : 'bg-white'}`}>
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              spellCheck={false}
              onInput={() => setEdited(true)}
              dangerouslySetInnerHTML={{ __html: data.content }}
              className={
                data.kind === 'docx'
                  ? 'mx-auto max-w-[760px] bg-white p-12 shadow text-[14px] leading-relaxed text-gray-800 outline-none focus:ring-2 focus:ring-blue-400/40 prose prose-sm'
                  : 'block w-full min-h-full p-4 font-mono text-[13px] leading-relaxed text-gray-800 bg-white outline-none whitespace-pre-wrap'
              }
            />
          </div>
        )}
      </div>

      {isDragging && (
        <div className="absolute inset-0 bg-blue-500/15 border-4 border-dashed border-blue-500 pointer-events-none flex items-center justify-center z-20">
          <div className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium shadow-lg">
            Drop to open
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ onPick }: { onPick: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-gray-500 text-sm gap-3 p-8 text-center">
      <svg className="h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6M9 16h6" />
      </svg>
      <p className="font-medium text-gray-700">
        Drop a file here, or click <button onClick={onPick} className="text-blue-600 hover:underline">Open</button>.
      </p>
      <div className="text-xs text-gray-500 max-w-md">
        <p className="font-semibold uppercase tracking-wide text-[10px] text-gray-400 mb-1">Supported formats</p>
        <ul className="space-y-0.5">
          <li><span className="font-mono text-gray-700">.txt .md .csv .log .json .xml .yaml .toml .ini .env .sql</span> — editable plain text</li>
          <li><span className="font-mono text-gray-700">.html .css .js .ts .tsx .jsx .py .rb .go .rs .java .c .cpp .sh</span> — code as plain text</li>
          <li><span className="font-mono text-gray-700">.docx</span> — Word documents (read-only; requires the optional <span className="font-mono">mammoth</span> peer dep)</li>
        </ul>
        <p className="mt-2 text-[11px] text-gray-400 italic">.doc (legacy Word binary) needs to be converted to .docx first.</p>
      </div>
    </div>
  );
}
