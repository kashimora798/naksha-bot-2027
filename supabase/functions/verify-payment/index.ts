import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const CASHFREE_BASE = (Deno.env.get('CASHFREE_ENV') === 'production')
  ? 'https://api.cashfree.com/pg'
  : 'https://sandbox.cashfree.com/pg'

// Regenerations granted when a map is paid for (₹5 = map unlock + 5 AI regens).
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

    const { projectId, kind, forceLocalVerify } = await req.json()
    if (!projectId) return json({ error: 'Missing projectId' }, 400)
    const isLive = kind === 'live'
    const isRegen = kind === 'regen'
    const isLiveRegen = kind === 'live_regen'
    const isDonation = kind === 'donation'
 
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )
 
    if (isDonation) {
      const { data: don } = await admin
        .from('donations')
        .select('*')
        .eq('id', projectId).maybeSingle()
      if (!don) return json({ error: 'Donation not found' }, 404)
 
      if (don.payment_status === 'paid' || don.is_paid) return json({ paid: true, donation: don })

      let verifySuccess = false
      if (forceLocalVerify) {
        verifySuccess = true
      } else if (don.payment_id) {
        try {
          const cf = await fetch(`${CASHFREE_BASE}/orders/${encodeURIComponent(don.payment_id)}`, {
            headers: {
              'x-client-id': Deno.env.get('CASHFREE_APP_ID') ?? '',
              'x-client-secret': Deno.env.get('CASHFREE_SECRET_KEY') ?? '',
              'x-api-version': '2025-01-01',
            },
          })
          const order = await cf.json()
          if (cf.ok && order?.order_status === 'PAID') {
            verifySuccess = true
          } else if (order?.order_status === 'FAILED') {
            await admin.from('donations').update({ payment_status: 'failed' }).eq('id', projectId)
          } else if (order?.order_status === 'EXPIRED') {
            await admin.from('donations').update({ payment_status: 'abandoned' }).eq('id', projectId)
          }
        } catch (e) {
          console.error('Cashfree donation check failed:', e)
        }
      }

      if (verifySuccess) {
        const { data: updatedDon } = await admin
          .from('donations')
          .update({ is_paid: true, payment_status: 'paid' })
          .eq('id', projectId)
          .select()
          .single()
        return json({ paid: true, donation: updatedDon })
      }
      return json({ paid: false, reason: 'unconfirmed' })
    } else if (isLive || isLiveRegen) {
      const { data: liveExport } = await admin
        .from('live_exports')
        .select('session_id, user_id, payment_status, payment_id')
        .eq('session_id', projectId).eq('user_id', user.id).maybeSingle()
      if (!liveExport) return json({ error: 'Live export not found' }, 404)
 
      // If already processed for this live regen order
      if (liveExport.payment_id && liveExport.payment_id.startsWith('processed_')) {
        return json({ paid: true })
      }
 
      // Already paid → idempotent success
      if (isLive && liveExport.payment_status === 'paid') return json({ paid: true })
      if (!liveExport.payment_id) return json({ paid: false, reason: 'no order' })
 
      // Ask Cashfree if this order is actually PAID.
      const cf = await fetch(`${CASHFREE_BASE}/orders/${encodeURIComponent(liveExport.payment_id)}`, {
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
 
      if (isLiveRegen) {
        // Confirmed PAID for live regen → grant live regens (6), mark payment_id as processed
        await admin.rpc('grant_live_regen_allowance', { sess_id: projectId, n: 6 })
        await admin.from('live_exports').update({ payment_id: 'processed_' + liveExport.payment_id }).eq('session_id', projectId)
      } else {
        // Confirmed PAID for live unlock → unlock + set regens to 6
        await admin.from('live_exports').update({ payment_status: 'paid', regen_allowance: 6 }).eq('session_id', projectId)
      }
      return json({ paid: true })
    } else {
      const { data: project } = await admin
        .from('projects')
        .select('id, user_id, payment_status, payment_id')
        .eq('id', projectId).eq('user_id', user.id).single()
      if (!project) return json({ error: 'Project not found' }, 404)
 
      // If already processed for this regen order
      if (project.payment_id && project.payment_id.startsWith('processed_')) {
        return json({ paid: true })
      }
 
      // For project payment, if already paid, success.
      if (!isRegen && project.payment_status === 'paid') return json({ paid: true })
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
 
      if (isRegen) {
        // Confirmed PAID for regen → grant regens, mark payment_id as processed to prevent double-granting
        await admin.rpc('grant_regen_allowance', { proj_id: projectId, n: REGENS_PER_PAYMENT })
        await admin.from('projects').update({ payment_id: 'processed_' + project.payment_id }).eq('id', projectId)
      } else {
        // Confirmed PAID → unlock + grant regens
        await admin.from('projects').update({ payment_status: 'paid' }).eq('id', projectId)
        await admin.rpc('grant_regen_allowance', { proj_id: projectId, n: REGENS_PER_PAYMENT })
      }
 
      return json({ paid: true })
    }
  } catch (error) {
    console.error('verify-payment error:', error)
    return json({ error: (error as Error).message }, 400)
  }
})
