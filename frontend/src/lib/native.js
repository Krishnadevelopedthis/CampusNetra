import { Capacitor } from '@capacitor/core'

/**
 * True inside the Android/iOS app (Capacitor), false in a browser.
 *
 * The app serves its own copy of the pages from https://localhost, so anything
 * that has to name the real website (a QR code printed on an asset, a link
 * someone else will open) uses PUBLIC_SITE_URL instead of window.location.
 */
export const isNativeApp = () => Capacitor.isNativePlatform()

export const PUBLIC_SITE_URL = 'https://campusnetra.dpdns.org'

/** Origin to put in links meant for other people: the real site inside the app. */
export const shareableOrigin = () => (isNativeApp() ? PUBLIC_SITE_URL : window.location.origin)
