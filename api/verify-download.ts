// Lightweight payment verification for client-side PDF rendering.
// Returns a time-limited, HMAC-signed render token that the client must
// present to the export function to unlock watermark-free rendering.
// No native dependencies — runs on any Vercel serverless environment.
import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'node:crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
// Used to sign render tokens — falls back to SERVICE_KEY if not set.
const TOKEN_SECRET = process.env.RENDER_TOKEN_SECRET || SERVICE_KEY;

function signToken(projectId: string, userId: string, ts: number): string {
  const payload = `${projectId}:${userId}:${ts}`;
  const sig = createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex').slice(0, 16);
  return Buffer.from(JSON.stringify({ p: projectId, u: userId, t: ts, s: sig })).toString('base64');
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const auth = req.headers['authorization'] || req.headers['Authorization'];
    const token = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    if (!SUPABASE_URL || !SERVICE_KEY) {
      res.status(500).json({ error: 'Server not configured' });
      return;
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const projectId: string = body.projectId;
    if (!projectId) {
      res.status(400).json({ error: 'Missing projectId' });
      return;
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) {
      res.status(401).json({ error: 'Invalid session' });
      return;
    }
    const userId = userData.user.id;

    const { data: project, error: projErr } = await admin
      .from('projects')
      .select('id, user_id, payment_status, export_count')
      .eq('id', projectId)
      .eq('user_id', userId)
      .single();

    if (projErr || !project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    if (project.payment_status !== 'paid') {
      res.status(402).json({ error: 'Payment required' });
      return;
    }

    // Generate a time-limited render token (valid for 5 minutes)
    const now = Date.now();
    const renderToken = signToken(projectId, userId, now);

    res.status(200).json({
      ok: true,
      renderToken,
      exportCount: project.export_count || 0,
    });
  } catch (err: any) {
    console.error('verify-download error:', err?.stack || err);
    res.status(500).json({ error: 'Verification failed' });
  }
}
