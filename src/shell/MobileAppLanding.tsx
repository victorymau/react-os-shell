/**
 * Mobile landing screen — shown by <Layout> in place of the desktop chrome on
 * phone/tablet-portrait viewports (see useIsMobile).
 *
 * The shell no longer ships its own touch "mobile mode". Instead the consumer
 * wires a link to their dedicated mobile app (native deep link, App Store /
 * Play Store page, or a mobile-optimised web app) through Layout's `mobileApp`
 * prop, and this screen surfaces it. With no link configured it degrades to a
 * plain "best viewed on desktop" notice so a consumer that hasn't adopted the
 * prop yet still gets a coherent small-screen screen rather than the cramped
 * desktop shell.
 */
import type { CSSProperties } from 'react';
import { glassStyle } from '../utils/glass';

export interface MobileAppConfig {
  /** Link the primary button opens — a native deep link, an App Store /
   *  Play Store page, or a mobile-optimised web app. When omitted the screen
   *  still renders (branding + message) but without a call-to-action. */
  url?: string;
  /** Primary button label. Defaults to `Open the app`. */
  ctaLabel?: string;
  /** Headline. Defaults to a message built from the product name. */
  heading?: string;
  /** Supporting copy under the headline. */
  description?: string;
}

interface MobileAppLandingProps {
  productName: string;
  productIcon: string;
  /** Consumer-wired mobile-app link + copy. */
  config?: MobileAppConfig;
  /** Wallpaper / background style computed by Layout so the user's chosen
   *  desktop background carries onto the landing screen. */
  wallpaperStyle?: CSSProperties;
}

export default function MobileAppLanding({
  productName,
  productIcon,
  config,
  wallpaperStyle,
}: MobileAppLandingProps) {
  const hasLink = !!config?.url;
  const heading =
    config?.heading ??
    (hasLink
      ? `Continue in the ${productName} app`
      : `${productName} works best on desktop`);
  const description =
    config?.description ??
    (hasLink
      ? 'This experience is built for the mobile app. Open it to continue on your phone.'
      : 'Open this page on a larger screen to continue.');
  const ctaLabel = config?.ctaLabel ?? 'Open the app';

  return (
    <div
      className="flex-1 flex items-center justify-center p-6"
      style={{ ...wallpaperStyle, paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}
    >
      <div
        className="w-full max-w-sm rounded-3xl p-8 flex flex-col items-center text-center"
        style={glassStyle()}
      >
        <div className="h-20 w-20 rounded-2xl overflow-hidden bg-white/60 flex items-center justify-center shadow-sm mb-5">
          <img src={productIcon} alt="" className="h-full w-full object-contain p-3" />
        </div>

        <h1 className="text-xl font-semibold text-gray-900 leading-snug">{heading}</h1>
        <p className="mt-2 text-sm text-gray-600 leading-relaxed">{description}</p>

        {hasLink && (
          <a
            href={config!.url}
            rel="noopener noreferrer"
            className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 active:bg-blue-800"
          >
            {ctaLabel}
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </a>
        )}
      </div>
    </div>
  );
}
