import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Cashfree base URL — set CASHFREE_ENV=production for live, anything else = sandbox.
const CASHFREE_BASE = (Deno.env.get('CASHFREE_ENV') === 'production')
  ? 'https://api.cashfree.com/pg'
  : 'https://sandbox.cashfree.com/pg'
const SECRET = Deno.env.get('CASHFREE_SECRET_KEY') ?? ''
const APP_ID = Deno.env.get('CASHFREE_APP_ID') ?? ''

// Cashfree signs webhooks as base64( HMAC-SHA256( timestamp + rawBody, secretKey ) ),
// sent in x-webhook-signature with x-webhook-timestamp. Verify before trusting ANY
// field — otherwise an attacker can POST a fake PAYMENT_SUCCESS and unlock for free.
async function verifySignature(timestamp: string, rawBody: string, signature: string): Promise<boolean> {
  if (!SECRET || !timestamp || !signature) return false
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(timestamp + rawBody))
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)))
  // constant-time compare
  if (expected.length !== signature.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  return diff === 0
}

// Defense in depth: independently confirm with Cashfree that the order is PAID,
// so we never rely solely on the webhook payload's own "status" field.
async function orderIsPaid(orderId: string): Promise<boolean> {
  try {
    const res = await fetch(`${CASHFREE_BASE}/orders/${encodeURIComponent(orderId)}`, {
      headers: {
        'x-client-id': APP_ID,
        'x-client-secret': SECRET,
        'x-api-version': '2025-01-01',
      },
    })
    if (!res.ok) return false
    const data = await res.json()
    return data?.order_status === 'PAID'
  } catch {
    return false
  }
}

serve(async (req) => {
  try {
    const rawBody = await req.text()
    const signature = req.headers.get('x-webhook-signature') ?? ''
    const timestamp = req.headers.get('x-webhook-timestamp') ?? ''

    if (!(await verifySignature(timestamp, rawBody, signature))) {
      console.error('Webhook signature verification FAILED — rejecting')
      return new Response('invalid signature', { status: 401 })
    }

    const payload = JSON.parse(rawBody)
    const orderId = payload?.data?.order?.order_id

    if (payload?.type === 'PAYMENT_SUCCESS_WEBHOOK' && orderId) {
      if (!(await orderIsPaid(orderId))) {
        console.error('Order not PAID on confirm:', orderId)
        return new Response('not paid', { status: 202 })
      }

      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      )

      const isLive = orderId.startsWith('live_')

      if (isLive) {
        const { data: liveExp } = await supabaseAdmin
          .from('live_exports')
          .select('session_id, payment_status')
          .eq('payment_id', orderId)
          .maybeSingle()

        if (liveExp && liveExp.payment_status !== 'paid') {
          await supabaseAdmin.from('live_exports').update({ payment_status: 'paid' }).eq('session_id', liveExp.session_id)
        }
      } else {
        // order_id was stored in projects.payment_id when the order was created.
        const { data: proj } = await supabaseAdmin
          .from('projects')
          .select('id, payment_status')
          .eq('payment_id', orderId)
          .maybeSingle()

        // Idempotent: only act if not already paid (verify-payment may have run first),
        // so regenerations are granted exactly once per ₹25.
        if (proj && proj.payment_status !== 'paid') {
          await supabaseAdmin.from('projects').update({ payment_status: 'paid' }).eq('id', proj.id)
          await supabaseAdmin.rpc('grant_regen_allowance', { proj_id: proj.id, n: 5 })
        }
      }
    }

    return new Response('ok', { status: 200 })
  } catch (error) {
    console.error('Webhook Error:', error)
    return new Response('error', { status: 400 })
  }
})
