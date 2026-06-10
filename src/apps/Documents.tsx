/**
 * Documents — windowed viewer / editor for plain-text and Word documents.
 * TXT-family files (.txt, .md, .csv, .log, .json, .xml, .html, .css, .ts,
 * .tsx, .js, .jsx, .py, .yml, .yaml, .toml, .sh) open in a full-width
 * monospace editor. Word .docx files (and new blank documents) open on a
 * letter-size page (8.5 × 11 in) with rich formatting: bold/italic/…,
 * font size & color, bulleted / numbered lists, text alignment, and
 * images (toolbar button, paste, or drag-drop; click an image to resize
 * or remove it — images embed as data URLs so saved files stay
 * self-contained). .docx conversion uses mammoth (an optional peer dep).
 *
 * Open files via the toolbar's Open button or by dragging them onto
 * the window.
 */
import { useState, useRef, useEffect } from 'react';
import { WindowTitle } from '../shell/Modal';
import { PopupMenu, PopupMenuItem, PopupMenuDivider, PopupMenuLabel } from '../shell/PopupMenu';
import toast from '../shell/toast';
import AboutApp from './_about';

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

const BLANK_DOC: DocData = { filename: 'Untitled', kind: 'docx', content: '', ext: 'docx' };

export default function Documents() {
  // Documents is for editing — open with a blank paper-style canvas so the
  // user can start typing immediately. Loading a file replaces this state.
  const [data, setData] = useState<DocData>(BLANK_DOC);
  const [busy, setBusy] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [edited, setEdited] = useState(false);
  // Floating menu shown when an image in the document is clicked.
  const [imgMenu, setImgMenu] = useState<{ x: number; y: number; el: HTMLImageElement } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  // Apply a formatting command to the current selection in the editor.
  const exec = (cmd: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
    setEdited(true);
  };

  // ── Images ──
  // Inserted at the caret as data URLs, so the document needs no server-side
  // storage and a saved .html round-trips with its images embedded.
  const insertImageFiles = (files: File[]) => {
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      const reader = new FileReader();
      reader.onload = () => {
        editorRef.current?.focus();
        document.execCommand('insertImage', false, String(reader.result));
        setEdited(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const images = Array.from(e.clipboardData?.items ?? [])
      .filter(i => i.kind === 'file' && i.type.startsWith('image/'))
      .map(i => i.getAsFile())
      .filter((f): f is File => !!f);
    if (images.length) {
      e.preventDefault();
      insertImageFiles(images);
    }
  };

  // Click an image → floating resize / remove menu.
  const handleEditorClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'IMG') {
      e.preventDefault();
      setImgMenu({ x: e.clientX, y: e.clientY, el: target as HTMLImageElement });
    }
  };

  const setImageWidth = (width: string | null) => {
    if (!imgMenu) return;
    // Pixel width/height attributes (e.g. from pasted HTML) would fight the
    // percentage style — drop them and let height follow the aspect ratio.
    imgMenu.el.removeAttribute('width');
    imgMenu.el.removeAttribute('height');
    imgMenu.el.style.width = width ?? '';
    imgMenu.el.style.height = width ? 'auto' : '';
    setEdited(true);
    setImgMenu(null);
  };

  const removeImage = () => {
    imgMenu?.el.remove();
    setEdited(true);
    setImgMenu(null);
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
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length === 0) return;
    // Dropped images go INTO the document; anything else opens as a document.
    if (files.every(f => f.type.startsWith('image/'))) {
      insertImageFiles(files);
      return;
    }
    ingestFile(files[0]);
  };

  const downloadCurrent = () => {
    if (!data) return;
    const html = getEditorHtml();
    if (data.kind === 'text') {
      // If the user added formatting, save as .html alongside; otherwise
      // strip back to plain text so the original .txt round-trips cleanly.
      // (`style="…text-align` only matches a real attribute — literal text
      // mentioning text-align gets its quotes escaped to &quot; on load.)
      const hasFormatting = /<(b|strong|i|em|u|font|span style|ul|ol|img)|style="[^"]*text-align/i.test(html);
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
      <AboutApp app="documents" />

      {/* Toolbar */}
      <div className="flex items-center flex-wrap gap-x-2 gap-y-1 px-3 py-2 border-b border-gray-200 bg-gray-50 shrink-0">
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
        <button onClick={downloadCurrent} className="text-xs text-gray-700 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-200 transition-colors">
          Save
        </button>
        <span className="text-[10px] text-gray-400 ml-1">TXT · DOCX · Code</span>
        <div className="h-4 w-px bg-gray-300 mx-1" />
        <span className="text-xs font-medium text-gray-700 truncate max-w-[200px]" title={data.filename}>
          {data.filename}{edited ? ' •' : ''}
        </span>

        {/* Formatting toolbar */}
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

        {/* Alignment */}
        <div className="h-4 w-px bg-gray-300 mx-1" />
        <div className="flex items-center gap-0.5">
          <button onMouseDown={e => e.preventDefault()} onClick={() => exec('justifyLeft')}
            className="px-2 py-1 rounded text-gray-700 hover:bg-gray-200 transition-colors" title="Align left">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" d="M3.75 6h16.5M3.75 12h9.75M3.75 18h14.25" />
            </svg>
          </button>
          <button onMouseDown={e => e.preventDefault()} onClick={() => exec('justifyCenter')}
            className="px-2 py-1 rounded text-gray-700 hover:bg-gray-200 transition-colors" title="Align center">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" d="M3.75 6h16.5M7.125 12h9.75M4.875 18h14.25" />
            </svg>
          </button>
          <button onMouseDown={e => e.preventDefault()} onClick={() => exec('justifyRight')}
            className="px-2 py-1 rounded text-gray-700 hover:bg-gray-200 transition-colors" title="Align right">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" d="M3.75 6h16.5M10.5 12h9.75M6 18h14.25" />
            </svg>
          </button>
          <button onMouseDown={e => e.preventDefault()} onClick={() => exec('justifyFull')}
            className="px-2 py-1 rounded text-gray-700 hover:bg-gray-200 transition-colors" title="Justify">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" d="M3.75 6h16.5M3.75 12h16.5M3.75 18h16.5" />
            </svg>
          </button>
        </div>

        {/* Image insert */}
        <div className="h-4 w-px bg-gray-300 mx-1" />
        <input
          ref={imgInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={e => {
            if (e.target.files?.length) insertImageFiles(Array.from(e.target.files));
            if (imgInputRef.current) imgInputRef.current.value = '';
          }}
        />
        <button onClick={() => imgInputRef.current?.click()}
          className="px-2 py-1 text-xs rounded text-gray-700 hover:bg-gray-200 transition-colors flex items-center gap-1" title="Insert image (or paste / drop one)">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
          </svg>
          Image
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {busy ? (
          <div className="flex items-center justify-center h-full text-sm text-gray-400">Loading…</div>
        ) : (
          <div className={`h-full overflow-auto ${data.kind === 'docx' ? 'bg-gray-100 px-6 py-8' : 'bg-white'}`}>
            {/* Word-style documents render on a US-letter page (8.5 × 11 in,
                1 in margins) that grows past 11 in as content does; the gray
                "desk" scrolls when the window is narrower than the page. */}
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              spellCheck={false}
              onInput={() => setEdited(true)}
              onPaste={handlePaste}
              onClick={handleEditorClick}
              dangerouslySetInnerHTML={{ __html: data.content }}
              className={
                data.kind === 'docx'
                  ? 'docs-editor mx-auto w-[8.5in] min-h-[11in] bg-white p-[1in] shadow text-[14px] leading-relaxed text-gray-800 outline-none focus:ring-2 focus:ring-blue-400/40'
                  : 'docs-editor block w-full min-h-full p-4 font-mono text-[13px] leading-relaxed text-gray-800 bg-white outline-none whitespace-pre-wrap'
              }
            />
          </div>
        )}
      </div>

      {isDragging && (
        <div className="absolute inset-0 bg-blue-500/15 border-4 border-dashed border-blue-500 pointer-events-none flex items-center justify-center z-20">
          <div className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium shadow-lg">
            Drop a document to open · images insert into the page
          </div>
        </div>
      )}

      {/* Image menu — resize / remove the clicked image */}
      {imgMenu && (
        <PopupMenu
          minWidth={150}
          style={{ left: imgMenu.x, top: imgMenu.y }}
          onClose={() => setImgMenu(null)}
        >
          <PopupMenuLabel>Image width</PopupMenuLabel>
          <PopupMenuItem onClick={() => setImageWidth('25%')}>25%</PopupMenuItem>
          <PopupMenuItem onClick={() => setImageWidth('50%')}>50%</PopupMenuItem>
          <PopupMenuItem onClick={() => setImageWidth('75%')}>75%</PopupMenuItem>
          <PopupMenuItem onClick={() => setImageWidth('100%')}>100%</PopupMenuItem>
          <PopupMenuItem onClick={() => setImageWidth(null)}>Original size</PopupMenuItem>
          <PopupMenuDivider />
          <PopupMenuItem danger onClick={removeImage}>Remove image</PopupMenuItem>
        </PopupMenu>
      )}
    </div>
  );
}

