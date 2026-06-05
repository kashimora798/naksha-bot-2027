// Server-side AI map generation. Centralizing this here gives us, in one place:
//   • abuse control — the AI API is only reachable through an authed, counted call
//   • regen limits — server-enforced (paid map = 5 regens; +₹5 = 5 more)
//   • caching — the result is stored in Supabase Storage + image_generations, so
//     the AI API is never hit again for an image the user already has
//   • lossless compression — removed server-side @napi-rs/canvas compilation dependency.
//     Now directly proxies and stores the generated image to avoid native C++ crashes on Vercel.
import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 60 };

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const AI_BASE = process.env.VITE_API_BASE || 'https://pixelster.vercel.app';
const BUCKET = 'ai-maps';

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

    let regenAllowance = 1;
    let regenUsed = 0;
    let project: any = null;

    if (isLive) {
      const { data: liveExport, error: liveErr } = await admin
        .from('live_exports')
        .select('session_id, regen_allowance, regen_used')
        .eq('session_id', projectId)
        .eq('user_id', userId)
        .maybeSingle();

      if (liveErr) { res.status(500).json({ error: 'Database check failed' }); return; }

      if (!liveExport) {
        // First generation before payment — insert draft row
        const { error: insErr } = await admin
          .from('live_exports')
          .insert({
            session_id: projectId,
            user_id: userId,
            payment_status: 'unpaid',
            regen_allowance: 1,
            regen_used: 0
          });
        if (insErr) {
          res.status(500).json({ error: 'Failed to initialize live export limits' });
          return;
        }
      } else {
        regenAllowance = liveExport.regen_allowance ?? 1;
        regenUsed = liveExport.regen_used ?? 0;
      }
    } else {
      // Owned project + server-controlled regen counters.
      const { data: proj, error: projErr } = await admin
        .from('projects')
        .select('id, regen_allowance, regen_used')
        .eq('id', projectId).eq('user_id', userId).single();
      if (projErr || !proj) { res.status(404).json({ error: 'Project not found' }); return; }
      project = proj;
      regenAllowance = project.regen_allowance ?? 1;
      regenUsed = project.regen_used ?? 0;
    }

    if (regenUsed >= regenAllowance) {
      res.status(402).json({
        error: 'regen_limit',
        used: regenUsed, allowance: regenAllowance,
      });
      return;
    }

    // 1) Call the AI image API (the ONLY place this is reachable from).
    const aiResp = await fetch(`${AI_BASE}/api/pti`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, ratio: ratio || '1:1', imageBase64: satelliteBase64 }),
    });
    if (!aiResp.ok) { res.status(502).json({ error: `AI error (${aiResp.status})` }); return; }
    const aiData = await aiResp.json();
    if (!aiData?.success || !aiData?.imageUrl) { res.status(502).json({ error: 'AI returned no image' }); return; }

    // 2) Download image buffer directly (avoid @napi-rs/canvas runtime dependency).
    const imgResp = await fetch(aiData.imageUrl);
    if (!imgResp.ok) { res.status(502).json({ error: 'Failed to fetch generated image from URL' }); return; }
    
    const arrayBuffer = await imgResp.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Determine content type and extension
    const contentType = imgResp.headers.get('content-type') || 'image/jpeg';
    let ext = 'jpg';
    if (contentType.includes('webp')) ext = 'webp';
    else if (contentType.includes('png')) ext = 'png';

    // 3) Store in Supabase Storage (public bucket "ai-maps").
    try {
      const { data: bucketExists } = await admin.storage.getBucket(BUCKET);
      if (!bucketExists) {
        const { error: createErr } = await admin.storage.createBucket(BUCKET, {
          public: true,
          allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
          fileSizeLimit: 52428800
        });
        if (createErr) console.error('Failed to create ai-maps bucket:', createErr);
      }
    } catch (err) {
      console.warn('Error checking/creating bucket, trying upload:', err);
    }

    const ts = Date.now();
    const path = `${userId}/${projectId}/${ts}.${ext}`;
    const up = await admin.storage.from(BUCKET).upload(path, buffer, { contentType, upsert: true });
    if (up.error) { console.error('storage upload', up.error); res.status(500).json({ error: 'Storage upload failed' }); return; }
    const publicUrl = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

    // 4) Record it (default-select the newest; deselect older ones).
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

    // 5) Count the regeneration (atomic, server-only RPC).
    let used = 0;
    if (isLive) {
      const { data: usedVal } = await admin.rpc('increment_live_regen_used', { sess_id: projectId });
      used = usedVal ?? (regenUsed + 1);
    } else {
      const { data: usedVal } = await admin.rpc('increment_regen_used', { proj_id: projectId });
      used = usedVal ?? (project.regen_used + 1);
    }

    res.status(200).json({
      url: publicUrl,
      used,
      allowance: regenAllowance,
      bytes: buffer.length,
    });
  } catch (err: any) {
    console.error('generate-map error:', err?.stack || err);
    res.status(500).json({ error: 'Generation failed' });
  }
}
