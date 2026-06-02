// Server-side AI map generation. Centralizing this here gives us, in one place:
//   • abuse control — the AI API is only reachable through an authed, counted call
//   • regen limits — server-enforced (paid map = 5 regens; +₹25 = 5 more)
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
    const { projectId, satelliteBase64, prompt, promptKey, ratio } = body;
    if (!projectId || !satelliteBase64 || !prompt) {
      res.status(400).json({ error: 'Missing projectId, satelliteBase64 or prompt' });
      return;
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) { res.status(401).json({ error: 'Invalid session' }); return; }
    const userId = userData.user.id;

    // Owned project + server-controlled regen counters.
    const { data: project, error: projErr } = await admin
      .from('projects')
      .select('id, regen_allowance, regen_used')
      .eq('id', projectId).eq('user_id', userId).single();
    if (projErr || !project) { res.status(404).json({ error: 'Project not found' }); return; }

    if ((project.regen_used ?? 0) >= (project.regen_allowance ?? 0)) {
      res.status(402).json({
        error: 'regen_limit',
        used: project.regen_used, allowance: project.regen_allowance,
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
    const ts = Date.now();
    const path = `${userId}/${projectId}/${ts}.${ext}`;
    const up = await admin.storage.from(BUCKET).upload(path, buffer, { contentType, upsert: true });
    if (up.error) { console.error('storage upload', up.error); res.status(500).json({ error: 'Storage upload failed' }); return; }
    const publicUrl = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

    // 4) Record it (default-select the newest; deselect older ones for this project).
    await admin.from('image_generations').update({ selected: false }).eq('project_id', projectId);
    await admin.from('image_generations').insert({
      project_id: projectId, user_id: userId,
      prompt_key: promptKey || 'custom', prompt, image_url: publicUrl, selected: true,
    });

    // 5) Count the regeneration (atomic, server-only RPC).
    const { data: used } = await admin.rpc('increment_regen_used', { proj_id: projectId });

    res.status(200).json({
      url: publicUrl,
      used: used ?? (project.regen_used + 1),
      allowance: project.regen_allowance,
      bytes: buffer.length,
    });
  } catch (err: any) {
    console.error('generate-map error:', err?.stack || err);
    res.status(500).json({ error: 'Generation failed' });
  }
}
