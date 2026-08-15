// src/lib/fingerprint.ts
// FingerprintJS OSS singleton — loads once, reuses the stable visitorId.
// Uses the free @fingerprintjs/fingerprintjs package (MIT licensed, no API key).
import FingerprintJS from '@fingerprintjs/fingerprintjs';

let _visitorId: string | null = null;
let _initPromise: Promise<string> | null = null;

export async function getVisitorId(): Promise<string> {
  if (_visitorId) return _visitorId;
  if (_initPromise) return _initPromise;

  _initPromise = FingerprintJS.load()
    .then(fp => fp.get())
    .then(result => {
      _visitorId = result.visitorId;
      return _visitorId;
    })
    .catch(() => {
      // Silently fail — tracking should never break the app
      _visitorId = 'unknown';
      return _visitorId;
    });

  return _initPromise;
}

/** Fire-and-forget event tracker. Sends to /api/track-event for server-side IP resolution. */
export async function trackEvent(
  eventType: string,
  pagePath?: string,
  userId?: string,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    const fingerprintId = await getVisitorId();
    fetch('/api/track-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fingerprintId, eventType, pagePath, userId, metadata }),
      // keepalive so it completes even if page unloads
      keepalive: true,
    }).catch(() => {}); // fire-and-forget
  } catch {
    // never throw
  }
}
