// Legacy server-side PDF render endpoint — now a thin redirect to verify-download.
// The actual rendering moved client-side because @napi-rs/canvas (native C++ addon)
// is incompatible with Vercel's serverless environment. This endpoint still exists
// so old cached clients don't break — it returns a clear error directing them to
// use the new verify-download flow.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  // Return a structured error so the client knows to use the new flow.
  // Old clients that still call this endpoint will see this message.
  res.status(410).json({
    error: 'Server-side rendering has been replaced. Please reload the page to use the new client-side export.',
    code: 'DEPRECATED',
  });
}
