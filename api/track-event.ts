// api/track-event.ts
// Server-side event tracking: resolves real client IP from Vercel headers,
// optionally geo-locates it via ip-api.com (free, no key, 45 req/min),
// then inserts into user_events using the service role client.
// Fire-and-forget from client — always returns 200.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

interface TrackPayload {
  fingerprintId?: string;
  eventType: string;
  pagePath?: string;
  userId?: string;
  metadata?: Record<string, any>;
}

interface GeoResult {
  country?: string;
  region?: string;
  city?: string;
  lat?: number;
  lng?: number;
}

async function geoFromIp(ip: string): Promise<GeoResult> {
  // Skip private / loopback IPs
  if (!ip || ip === '::1' || ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('192.168.')) {
    return {};
  }
  try {
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=country,regionName,city,lat,lon&lang=en`,
      { signal: AbortSignal.timeout(2000) }
    );
    if (!res.ok) return {};
    const data: any = await res.json();
    if (data.status === 'fail') return {};
    return {
      country: data.country ?? null,
      region:  data.regionName ?? null,
      city:    data.city ?? null,
      lat:     data.lat ?? null,
      lng:     data.lon ?? null,
    };
  } catch {
    return {};
  }
}

function getClientIp(req: any): string {
  const forwarded = req.headers['x-forwarded-for'] as string | undefined;
  if (forwarded) {
    // x-forwarded-for can be a comma-separated list; first is the real client
    return forwarded.split(',')[0].trim();
  }
  return req.headers['x-real-ip'] as string || req.socket?.remoteAddress || '';
}

export default async function handler(req: any, res: any) {
  // Always return 200 — fire and forget
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(200).json({ ok: true }); return; }

  try {
    if (!SUPABASE_URL || !SERVICE_KEY) {
      res.status(200).json({ ok: true, warn: 'Not configured' });
      return;
    }

    const body: TrackPayload = typeof req.body === 'string'
      ? JSON.parse(req.body || '{}')
      : (req.body || {});

    const { fingerprintId, eventType, pagePath, userId, metadata } = body;

    if (!eventType) {
      res.status(200).json({ ok: true });
      return;
    }

    const ip = getClientIp(req);
    const geo = await geoFromIp(ip);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false }
    });

    await admin.from('user_events').insert({
      user_id:       userId || null,
      fingerprint_id: fingerprintId || null,
      event_type:    eventType,
      ip_address:    ip || null,
      country:       geo.country || null,
      region:        geo.region  || null,
      city:          geo.city    || null,
      lat:           geo.lat     ?? null,
      lng:           geo.lng     ?? null,
      page_path:     pagePath    || null,
      metadata:      metadata    || null,
    });

    res.status(200).json({ ok: true });
  } catch (err: any) {
    // Don't surface errors — tracking should never break the app
    console.error('[track-event]', err?.message || err);
    res.status(200).json({ ok: true });
  }
}
