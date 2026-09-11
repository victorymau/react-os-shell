import { useEffect, useRef, useState } from 'react';
import Button from './Button';
import MediaUploadField from './MediaUploadField';
import BrandMark, { type BrandMarkSlot, type BrandMarkSurface } from './BrandMark';

export interface BrandAssetPreview {
  label: string;
  slot: BrandMarkSlot;
  surface?: BrandMarkSurface;
  kind?: 'brand-slot' | 'browser-tab' | 'search-result';
  title?: string;
  url?: string;
  description?: string;
}

export interface BrandAssetEditorProps {
  committedUrl?: string | null;
  committedHasAlpha?: boolean | null;
  committedIsLight?: boolean | null;
  /** Read-only inherited asset shown until this surface saves an override. */
  fallbackUrl?: string | null;
  fallbackHasAlpha?: boolean | null;
  fallbackIsLight?: boolean | null;
  subjectName: string;
  assetName: string;
  onSave: (file: File) => void | Promise<void>;
  onRemove: () => void | Promise<void>;
  accept?: string;
  acceptHint?: string;
  maxBytes?: number;
  previews?: BrandAssetPreview[];
  disabled?: boolean;
}

function actionNoun(assetName: string) {
  const words = assetName.trim().toLocaleLowerCase().split(/\s+/);
  return words.at(-1) || 'image';
}

/**
 * Shared staged-upload surface for portal branding. Network and persistence
 * remain consumer-owned through onSave/onRemove; the file contract (`accept`,
 * `maxBytes`) is enforced by the field's shared intake on every gesture, and
 * the preview and file lifecycle are identical everywhere.
 */
export default function BrandAssetEditor({
  committedUrl,
  committedHasAlpha = null,
  committedIsLight = null,
  fallbackUrl,
  fallbackHasAlpha = null,
  fallbackIsLight = null,
  subjectName,
  assetName,
  onSave,
  onRemove,
  // `image/x-icon` alone rejects most real .ico files: browsers report them as
  // `image/vnd.microsoft.icon`, and some report nothing at all — hence the
  // extension rule, which the intake's `acceptsFile` matches on the file name.
  accept = 'image/png,image/x-icon,image/vnd.microsoft.icon,.ico,image/svg+xml,image/jpeg,image/webp',
  acceptHint = 'PNG · ICO · SVG · JPG · WEBP',
  maxBytes = 5 * 1024 * 1024,
  previews = [],
  disabled = false,
}: BrandAssetEditorProps) {
  const objectUrlRef = useRef<string | null>(null);
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [stagedUrl, setStagedUrl] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const noun = actionNoun(assetName);
  const visibleUrl = stagedUrl || committedUrl || fallbackUrl || '';
  const visibleHasAlpha = stagedFile
    ? null : committedUrl ? committedHasAlpha : fallbackHasAlpha;
  const visibleIsLight = stagedFile
    ? null : committedUrl ? committedIsLight : fallbackIsLight;

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  const discardObjectUrl = () => {
    if (!objectUrlRef.current) return;
    URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  };

  /** A file the field already checked against `accept` and `maxBytes`. */
  const stage = (file: File) => {
    if (disabled) return;
    discardObjectUrl();
    const nextUrl = URL.createObjectURL(file);
    objectUrlRef.current = nextUrl;
    setStagedFile(file);
    setStagedUrl(nextUrl);
    setError('');
  };

  const save = async () => {
    if (!stagedFile || disabled || saving) return;
    setSaving(true);
    setError('');
    try {
      await onSave(stagedFile);
      discardObjectUrl();
      setStagedFile(null);
      setStagedUrl('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not save ${noun}.`);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (disabled || removing) return;
    if (stagedFile) {
      discardObjectUrl();
      setStagedFile(null);
      setStagedUrl('');
      setError('');
      return;
    }
    if (!committedUrl) return;
    setRemoving(true);
    setError('');
    try {
      await onRemove();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not remove ${noun}.`);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <section aria-label={`${assetName} for ${subjectName}`} className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <MediaUploadField
          value={visibleUrl}
          onChange={() => {}}
          onFile={stage}
          label={assetName}
          hint={error || `Used for ${subjectName}.`}
          error={error || undefined}
          accept={accept}
          acceptHint={acceptHint}
          maxSizeBytes={maxBytes}
          fit="contain"
          height={180}
          allowRemove={false}
          busy={saving || removing}
          disabled={disabled}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={save} disabled={!stagedFile || disabled} loading={saving}>
            Save {noun}
          </Button>
          {(stagedFile || committedUrl) && (
            <Button variant="ghost-danger" onClick={remove} disabled={disabled} loading={removing}>
              {stagedFile ? 'Discard change' : `Remove ${noun}`}
            </Button>
          )}
        </div>
      </div>
      {previews.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4" aria-label={`${assetName} previews`}>
          <h3 className="text-sm font-semibold text-gray-900">Preview</h3>
          <div className="mt-3 grid gap-3">
            {previews.map(preview => {
              const mark = (
                <BrandMark
                  src={visibleUrl}
                  alt={`${subjectName} ${assetName}`}
                  slot={preview.slot}
                  surface={preview.surface}
                  adaptive
                  hasAlpha={visibleHasAlpha}
                  isLight={visibleIsLight}
                  size={preview.kind === 'browser-tab' ? 16 : undefined}
                />
              );
              return (
                <div
                  key={`${preview.label}-${preview.slot}-${preview.surface ?? 'light'}`}
                  data-brand-preview
                  className={preview.surface === 'dark' ? 'text-white' : 'text-gray-900'}
                >
                  <div className="mb-2 text-xs font-medium text-gray-500">{preview.label}</div>
                  {preview.kind === 'browser-tab' ? (
                    <div className="flex items-end gap-1 border-b border-gray-200">
                      <div className="flex max-w-[220px] items-center gap-2 rounded-t-lg border border-b-0 border-gray-200 bg-white px-3 py-2">
                        {mark}
                        <span className="truncate text-xs text-gray-700">{preview.title ?? subjectName}</span>
                        <span className="text-gray-400">×</span>
                      </div>
                      <span className="mb-1 ml-1 text-gray-400">+</span>
                    </div>
                  ) : preview.kind === 'search-result' ? (
                    <div className="rounded-lg border border-gray-200 bg-white p-3">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-gray-50">{mark}</span>
                        <div className="min-w-0 leading-tight">
                          <div className="truncate text-xs font-medium text-gray-700">{preview.title ?? subjectName}</div>
                          {preview.url && <div className="truncate text-xs text-gray-400">{preview.url}</div>}
                        </div>
                      </div>
                      <div className="mt-1.5 text-sm font-medium text-blue-700">{preview.title ?? subjectName}</div>
                      {preview.description && <div className="text-xs text-gray-500">{preview.description}</div>}
                    </div>
                  ) : (
                    <div className={[
                      'flex items-center gap-3 rounded-md border border-gray-200 p-3',
                      preview.surface === 'dark' ? 'bg-gray-900 text-white' : 'bg-white text-gray-900',
                    ].join(' ')}>
                      {mark}
                      <span className="text-sm">{preview.title ?? preview.label}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
