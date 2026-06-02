// Server-side, paywalled PDF render. This is the ONLY way to get a clean,
// un-watermarked, print-ready sheet — the browser only ever holds a watermarked,
// low-res preview. We render from the project's DB row (never the request body),
// after confirming payment server-side, so the client cannot forge its way in.
import { createClient } from '@supabase/supabase-js';
import { exportBlockPDF } from '../src/lib/pdf-export';
import { nodeEnv } from '../src/lib/render-env.node';

export const config = { maxDuration: 60 };

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

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
      res.status(500).json({ error: 'Server not configured (missing Supabase env)' });
      return;
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const projectId: string = body.projectId;
    if (!projectId) {
      res.status(400).json({ error: 'Missing projectId' });
      return;
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Validate the caller's JWT and get their user id.
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) {
      res.status(401).json({ error: 'Invalid session' });
      return;
    }
    const userId = userData.user.id;

    // Authoritative read: the row, scoped to the owner. payment_status here can only
    // have been set by the (signature-verified) webhook — the DB trigger blocks clients.
    const { data: project, error: projErr } = await admin
      .from('projects')
      .select('id, user_id, data, payment_status')
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

    const mapData = project.data;
    const orient = (body.orientation === 'landscape' || mapData?.orientation === 'landscape')
      ? 'landscape' : 'portrait';

    const buf = await exportBlockPDF(mapData, orient, () => {}, nodeEnv, 'buffer');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="HLB_${(mapData?.hlbNumber || '0000')}_Naksha_2027.pdf"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(Buffer.from(buf));
  } catch (err: any) {
    console.error('render-pdf error:', err?.stack || err);
    res.status(500).json({ error: 'Render failed' });
  }
}
