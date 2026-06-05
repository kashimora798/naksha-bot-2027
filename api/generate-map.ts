// Server-side AI map generation with per-user daily rate limiting (6/day).
// Centralizing here gives us:
//   • abuse control — the AI API is only reachable through an authed call
//   • daily limit — 6 generations per user per calendar day (UTC), free
//   • caching — result stored in Supabase Storage + image_generations
import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 60 };

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const AI_BASE = process.env.VITE_API_BASE || 'https://pixelster.vercel.app';
const BUCKET = 'ai-maps';
const DAILY_LIMIT = 6;

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  try {
    const auth = req.headers['authorization'] || req.headers['Authorization'];
    const token = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) { res.status(401).json({ error: 'Not authenticated' }); return; }
    if (!SUPABASE_URL || !SERVICE_KEY) { res.status(500).json({ error: 'Server not configured' }); return; }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { projectId, satelliteBase64, prompt, promptKey, ratio, kind } = body;
    const isLive = kind === 'live';
    if (!projectId || !satelliteBase64 || !prompt) {
      res.status(400).json({ error: 'Missing projectId, satelliteBase64 or prompt' });
      return;
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) { res.status(401).json({ error: 'Invalid session' }); return; }
    const userId = userData.user.id;

    // ── Daily rate limit: 6 AI generations per user per UTC calendar day ──
    const todayUTC = new Date().toISOString().split('T')[0]; // "YYYY-MM-DD"
    const todayStart = `${todayUTC}T00:00:00.000Z`;

    // Count today's generations across both project and live tables
    const [{ count: projCount }, { count: liveCount }] = await Promise.all([
      admin.from('image_generations')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', todayStart),
      admin.from('live_image_generations')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', todayStart),
    ]);
    const usedToday = (projCount ?? 0) + (liveCount ?? 0);
    const remaining = Math.max(0, DAILY_LIMIT - usedToday);

    if (usedToday >= DAILY_LIMIT) {
      res.status(429).json({
        error: 'daily_limit',
        used: usedToday,
        limit: DAILY_LIMIT,
        remaining: 0,
        resetsAt: `${todayUTC}T23:59:59Z`,
      });
      return;
    }

    // Verify project ownership (or create live_exports draft row)
    if (isLive) {
      const { data: liveExport } = await admin
        .from('live_exports')
        .select('session_id')
        .eq('session_id', projectId)
        .eq('user_id', userId)
        .maybeSingle();

      if (!liveExport) {
        const { error: insErr } = await admin.from('live_exports').insert({
          session_id: projectId,
          user_id: userId,
          payment_status: 'free',
          regen_allowance: DAILY_LIMIT,
          regen_used: 0,
        });
        if (insErr) {
          res.status(500).json({ error: 'Failed to initialize live export record' });
          return;
        }
      }
    } else {
      const { data: proj, error: projErr } = await admin
        .from('projects')
        .select('id')
        .eq('id', projectId).eq('user_id', userId).single();
      if (projErr || !proj) { res.status(404).json({ error: 'Project not found' }); return; }
    }

    // 1) Call the AI image API
    const aiResp = await fetch(`${AI_BASE}/api/pti`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, ratio: ratio || '1:1', imageBase64: satelliteBase64 }),
    });
    if (!aiResp.ok) { res.status(502).json({ error: `AI error (${aiResp.status})` }); return; }
    const aiData = await aiResp.json();
    if (!aiData?.success || !aiData?.imageUrl) { res.status(502).json({ error: 'AI returned no image' }); return; }

    // 2) Download image buffer
    const imgResp = await fetch(aiData.imageUrl);
    if (!imgResp.ok) { res.status(502).json({ error: 'Failed to fetch generated image' }); return; }
    const arrayBuffer = await imgResp.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = imgResp.headers.get('content-type') || 'image/jpeg';
    let ext = 'jpg';
    if (contentType.includes('webp')) ext = 'webp';
    else if (contentType.includes('png')) ext = 'png';

    // 3) Store in Supabase Storage
    try {
      const { data: bucketExists } = await admin.storage.getBucket(BUCKET);
      if (!bucketExists) {
        await admin.storage.createBucket(BUCKET, {
          public: true,
          allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
          fileSizeLimit: 52428800,
        });
      }
    } catch { /* bucket may already exist */ }

    const ts = Date.now();
    const path = `${userId}/${projectId}/${ts}.${ext}`;
    const up = await admin.storage.from(BUCKET).upload(path, buffer, { contentType, upsert: true });
    if (up.error) { res.status(500).json({ error: 'Storage upload failed' }); return; }
    const publicUrl = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

    // 4) Record in image_generations / live_image_generations
    if (isLive) {
      await admin.from('live_image_generations').update({ selected: false }).eq('session_id', projectId);
      await admin.from('live_image_generations').insert({
        session_id: projectId, user_id: userId,
        prompt_key: promptKey || 'custom', prompt, image_url: publicUrl, selected: true,
      });
    } else {
      await admin.from('image_generations').update({ selected: false }).eq('project_id', projectId);
      await admin.from('image_generations').insert({
        project_id: projectId, user_id: userId,
        prompt_key: promptKey || 'custom', prompt, image_url: publicUrl, selected: true,
      });
    }

    res.status(200).json({
      url: publicUrl,
      used: usedToday + 1,
      limit: DAILY_LIMIT,
      remaining: remaining - 1,
      bytes: buffer.length,
    });
  } catch (err: any) {
    console.error('generate-map error:', err?.stack || err);
    res.status(500).json({ error: 'Generation failed' });
  }
}
