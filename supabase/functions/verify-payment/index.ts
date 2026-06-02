import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const CASHFREE_BASE = (Deno.env.get('CASHFREE_ENV') === 'production')
  ? 'https://api.cashfree.com/pg'
  : 'https://sandbox.cashfree.com/pg'

// Regenerations granted when a map is paid for (₹25 = map unlock + 5 AI regens).
const REGENS_PER_PAYMENT = 5

// Called by the app right after the Cashfree redirect. Instead of trusting the URL
// or waiting for the webhook, we ask Cashfree directly whether the order is PAID,
// then flip payment_status + grant regens with the service role (idempotent).
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } },
    )
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'Not authenticated' }, 401)

    const { projectId } = await req.json()
    if (!projectId) return json({ error: 'Missing projectId' }, 400)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: project } = await admin
      .from('projects')
      .select('id, user_id, payment_status, payment_id')
      .eq('id', projectId).eq('user_id', user.id).single()
    if (!project) return json({ error: 'Project not found' }, 404)

    // Already paid → idempotent success (no double-granting of regens).
    if (project.payment_status === 'paid') return json({ paid: true })
    if (!project.payment_id) return json({ paid: false, reason: 'no order' })

    // Ask Cashfree if this order is actually PAID.
    const cf = await fetch(`${CASHFREE_BASE}/orders/${encodeURIComponent(project.payment_id)}`, {
      headers: {
        'x-client-id': Deno.env.get('CASHFREE_APP_ID') ?? '',
        'x-client-secret': Deno.env.get('CASHFREE_SECRET_KEY') ?? '',
        'x-api-version': '2025-01-01',
      },
    })
    const order = await cf.json()
    if (!cf.ok || order?.order_status !== 'PAID') {
      return json({ paid: false, reason: order?.order_status || 'unconfirmed' })
    }

    // Confirmed PAID → unlock + grant regens (service role passes the guard trigger).
    await admin.from('projects').update({ payment_status: 'paid' }).eq('id', projectId)
    await admin.rpc('grant_regen_allowance', { proj_id: projectId, n: REGENS_PER_PAYMENT })

    return json({ paid: true })
  } catch (error) {
    console.error('verify-payment error:', error)
    return json({ error: (error as Error).message }, 400)
  }
})
