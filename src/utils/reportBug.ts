/**
 * Report a bug — screenshot the current tab, let the user review + describe it,
 * then hand the payload to the consumer-supplied `submit` callback. Triggered
 * from the wallpaper / taskbar right-click menus.
 *
 * The shell does NOT call any HTTP endpoint here; the caller passes a
 * `BugReportConfig['submit']` (typically resolved via `useBugReport()`).
 */
import toast from '../shell/toast';
import { openBugReportDialog, type BugReportConfig } from '../shell/BugReportDialog';

/** Capture the current tab via the Screen Capture API. OS-level screenshot —
 * immune to the CSS quirks (Tailwind v4, oklch(), backdrop-filter, custom
 * properties) that break DOM-based renderers like html2canvas / html-to-image.
 * preferCurrentTab pre-selects the current tab so the user just clicks Share. */
async function captureViewport(): Promise<Blob | null> {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'browser' } as MediaTrackConstraints,
      audio: false,
      // Chromium-only hints — ignored by other engines, no harm done.
      preferCurrentTab: true,
      selfBrowserSurface: 'include',
      surfaceSwitching: 'exclude',
    } as any);

    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    await video.play();

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);

    stream.getTracks().forEach(t => t.stop());

    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9);
    });
  } catch (err) {
    console.error('Bug report screenshot failed:', err);
    return null;
  }
}

export async function reportBug(submit: BugReportConfig['submit']): Promise<void> {
  const screenshot = await captureViewport();

  // Show review dialog with preview + description box
  const submission = await openBugReportDialog(screenshot);
  if (submission === null) return; // user cancelled

  try {
    await submit({
      description: submission.description || undefined,
      screenshot: screenshot ?? undefined,
      url: window.location.href,
      userAgent: navigator.userAgent,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
    });
    toast.success('Bug report sent to admins.');
  } catch (err: any) {
    toast.error(err?.response?.data?.detail || 'Failed to send bug report.');
  }
}
