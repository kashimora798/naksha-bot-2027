import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Price (in INR) lives on the SERVER — never trust an amount from the client.
const MAP_PRICE = 25.00

// CASHFREE_ENV=production for live; anything else uses sandbox.
const CASHFREE_BASE = (Deno.env.get('CASHFREE_ENV') === 'production')
  ? 'https://api.cashfree.com/pg'
  : 'https://sandbox.cashfree.com/pg'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } },
    )

    const { data: { user } } = await supabaseClient.auth.getUser()
    if (!user) throw new Error('Not authenticated')
 
    const { projectId, sessionId, kind } = await req.json()
    const targetKind = kind === 'live' ? 'live' : 'project'
    const targetId = targetKind === 'live' ? sessionId : projectId
    if (!targetId) throw new Error(`Missing ${targetKind === 'live' ? 'sessionId' : 'projectId'}`)
 
    let isAlreadyPaid = false;
    if (targetKind === 'live') {
      const { data: liveExport } = await supabaseClient
        .from('live_exports')
        .select('session_id, payment_status')
        .eq('session_id', targetId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (liveExport?.payment_status === 'paid') isAlreadyPaid = true;
    } else {
      const { data: project } = await supabaseClient
        .from('projects')
        .select('id, payment_status')
        .eq('id', targetId)
        .eq('user_id', user.id)
        .single()
      if (!project) throw new Error('Project not found or unauthorized')
      if (project.payment_status === 'paid') isAlreadyPaid = true;
    }
 
    if (isAlreadyPaid) {
      return new Response(JSON.stringify({ error: 'Already paid' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
 
    // Real customer phone from the profile (Cashfree needs a valid 10-digit number).
    const { data: profile } = await supabaseClient
      .from('user_profiles').select('mobile').eq('id', user.id).maybeSingle()
    const phone = (profile?.mobile || '').replace(/\D/g, '').slice(-10)
    const customerPhone = phone.length === 10 ? phone : '9999999999'
 
    const APP_ID = Deno.env.get('CASHFREE_APP_ID')
    const SECRET_KEY = Deno.env.get('CASHFREE_SECRET_KEY')
 
    // Unique order id per attempt — reusing the projectId breaks retries after a
    // failed/expired order (Cashfree rejects duplicate order_id). We store it in
    // projects.payment_id or live_exports.payment_id; the webhook matches on that.
    const orderId = `${targetKind === 'live' ? 'live' : 'ord'}_${targetId.replace(/-/g, '')}_${Date.now().toString(36)}`.slice(0, 45)
 
    const orderPayload = {
      order_amount: MAP_PRICE,
      order_currency: 'INR',
      order_id: orderId,
      customer_details: {
        customer_id: user.id.replace(/-/g, ''),
        customer_email: user.email || 'surveyor@example.com',
        customer_phone: customerPhone,
        customer_name: user.user_metadata?.full_name || user.email || 'Surveyor',
      },
      order_meta: {
        // Return URL with the correct kind so we know how to handle it
        return_url: `${req.headers.get('origin')}/?payment=success&project_id=${targetId}&kind=${targetKind}`,
      },
    }
 
    const res = await fetch(`${CASHFREE_BASE}/orders`, {
      method: 'POST',
      headers: {
        'x-client-id': APP_ID!,
        'x-client-secret': SECRET_KEY!,
        'x-api-version': '2025-01-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderPayload),
    })
 
    const cashfreeData = await res.json()
    if (!res.ok) {
      console.error('Cashfree error:', cashfreeData)
      throw new Error('Failed to create Cashfree order: ' + JSON.stringify(cashfreeData))
    }
 
    // Persist the order id so the webhook / verify-payment can find this project/live-export.
    // MUST use the service role: payment_id is locked by the guard trigger.
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )
    if (targetKind === 'live') {
      const { error: liveErr } = await admin
        .from('live_exports')
        .upsert({ session_id: targetId, user_id: user.id, payment_id: cashfreeData.order_id, payment_status: 'unpaid' })
      if (liveErr) {
        console.error('Failed to store live payment_id:', liveErr)
        throw new Error('Could not record the live order')
      }
    } else {
      const { error: pidErr } = await admin
        .from('projects')
        .update({ payment_id: cashfreeData.order_id })
        .eq('id', targetId)
      if (pidErr) {
        console.error('Failed to store payment_id:', pidErr)
        throw new Error('Could not record the order — check SUPABASE_SERVICE_ROLE_KEY')
      }
    }
 
    return new Response(JSON.stringify({ paymentSessionId: cashfreeData.payment_session_id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
