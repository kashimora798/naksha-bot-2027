import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // TODO: restrict to production domain before launch
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Price (in INR) lives on the SERVER — never trust an amount from the client.
const MAP_PRICE = 5.00

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

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: { user } } = await supabaseClient.auth.getUser()
 
    const { projectId, sessionId, kind } = await req.json()
    const targetKind = kind === 'live' ? 'live' : kind === 'regen' ? 'regen' : kind === 'live_regen' ? 'live_regen' : kind === 'donation' ? 'donation' : 'project'
    const targetId = (targetKind === 'live' || targetKind === 'live_regen') ? (sessionId || projectId) : projectId
    if (!targetId) throw new Error(`Missing ${targetKind.startsWith('live') ? 'sessionId' : 'projectId'}`)

    if (!user && targetKind !== 'donation') throw new Error('Not authenticated')
 
    let isAlreadyPaid = false;
    let donationAmount = MAP_PRICE;

    if (targetKind === 'donation') {
      const { data: don } = await supabaseClient
        .from('donations')
        .select('*')
        .eq('id', targetId)
        .maybeSingle()
      if (!don) throw new Error('Donation record not found')
      if (don.is_paid || don.payment_status === 'paid') isAlreadyPaid = true;
      donationAmount = Number(don.amount);
    } else if (targetKind === 'live') {
      const { data: liveExport } = await supabaseClient
        .from('live_exports')
        .select('session_id, payment_status')
        .eq('session_id', targetId)
        .eq('user_id', user!.id)
        .maybeSingle()
      if (liveExport?.payment_status === 'paid') isAlreadyPaid = true;
    } else if (targetKind === 'live_regen') {
      const { data: liveExport } = await supabaseClient
        .from('live_exports')
        .select('session_id, payment_status')
        .eq('session_id', targetId)
        .eq('user_id', user!.id)
        .maybeSingle()
      if (!liveExport) throw new Error('Live survey session not found')
      if (liveExport.payment_status !== 'paid') {
        throw new Error('Live survey must be paid for before purchasing extra generations')
      }
    } else if (targetKind === 'project') {
      const { data: project } = await admin
        .from('projects')
        .select('id, user_id, payment_status')
        .eq('id', targetId)
        .maybeSingle()

      if (!project) throw new Error('Project not found')
      
      // If project has an owner and it doesn't match the current user, reject
      if (project.user_id && project.user_id !== user!.id) {
        throw new Error('Unauthorized project access')
      }

      // If project has no owner (guest project), retroactively link it to the user
      if (!project.user_id) {
        await admin.from('projects').update({ user_id: user!.id }).eq('id', targetId)
      }

      if (project.payment_status === 'paid') isAlreadyPaid = true;
    } else if (targetKind === 'regen') {
      // For regen, make sure the project exists and is already paid for first
      const { data: project } = await admin
        .from('projects')
        .select('id, user_id, payment_status')
        .eq('id', targetId)
        .maybeSingle()

      if (!project) throw new Error('Project not found')
      
      if (project.user_id && project.user_id !== user!.id) {
        throw new Error('Unauthorized project access')
      }

      if (!project.user_id) {
        await admin.from('projects').update({ user_id: user!.id }).eq('id', targetId)
      }

      if (project.payment_status !== 'paid') {
        throw new Error('Project must be paid for before purchasing extra generations')
      }
    }
 
    if (targetKind !== 'regen' && targetKind !== 'donation' && isAlreadyPaid) {
      return new Response(JSON.stringify({ error: 'Already paid' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
 
    // Real customer details
    const customerId = user ? user.id.replace(/-/g, '') : 'guest_donator'
    const customerEmail = user ? (user.email || 'surveyor@example.com') : 'guest@example.com'
    const customerName = user ? (user.user_metadata?.full_name || user.email || 'Surveyor') : 'Guest Donator'

    let customerPhone = '9999999999'
    if (user) {
      const { data: profile } = await supabaseClient
        .from('user_profiles').select('mobile').eq('id', user.id).maybeSingle()
      const phone = (profile?.mobile || '').replace(/\D/g, '').slice(-10)
      if (phone.length === 10) customerPhone = phone
    }
 
    const APP_ID = Deno.env.get('CASHFREE_APP_ID')
    const SECRET_KEY = Deno.env.get('CASHFREE_SECRET_KEY')
 
    // Unique order id per attempt — reusing the projectId breaks retries after a
    // failed/expired order (Cashfree rejects duplicate order_id). We store it in
    // projects.payment_id or live_exports.payment_id; the webhook matches on that.
    const orderPrefix = targetKind === 'live' ? 'live' : targetKind === 'regen' ? 'reg' : targetKind === 'live_regen' ? 'lrg' : targetKind === 'donation' ? 'don' : 'ord'
    const orderId = `${orderPrefix}_${targetId.replace(/-/g, '')}_${Date.now().toString(36)}`.slice(0, 45)
 
    // Use SITE_URL env var for production (must be HTTPS for Cashfree).
    // Fallback: read the request Origin header (works fine on localhost with sandbox mode).
    const rawOrigin = req.headers.get('origin') || ''
    const siteUrl = (Deno.env.get('SITE_URL') || rawOrigin).replace(/\/$/, '')

    const orderPayload = {
      order_amount: targetKind === 'donation' ? donationAmount : MAP_PRICE,
      order_currency: 'INR',
      order_id: orderId,
      customer_details: {
        customer_id: customerId,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        customer_name: customerName,
      },
      order_meta: {
        // Return URL: neutral param so we can distinguish real success from cancel/fail via Cashfree API
        return_url: targetKind === 'donation'
          ? `${siteUrl}/app?donation_return=${targetId}`
          : (targetKind === 'live' || targetKind === 'live_regen')
          ? `${siteUrl}/live-session/${targetId}?payment=success&kind=${targetKind}`
          : `${siteUrl}/app?payment=success&project_id=${targetId}&kind=${targetKind}`,
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
 
    // Persist the order id so the webhook / verify-payment can find this project/live-export/donation.
    // MUST use the service role.
    if (targetKind === 'donation') {
      const { error: donErr } = await admin
        .from('donations')
        .update({ payment_id: cashfreeData.order_id, payment_session_id: cashfreeData.payment_session_id, payment_status: 'unpaid' })
        .eq('id', targetId)
      if (donErr) {
        console.error('Failed to store donation payment_id:', donErr)
        throw new Error('Could not record the donation order')
      }
    } else if (targetKind === 'live_regen') {
      const { error: liveErr } = await admin
        .from('live_exports')
        .update({ payment_id: cashfreeData.order_id })
        .eq('session_id', targetId)
        .eq('user_id', user!.id)
      if (liveErr) {
        console.error('Failed to store live regen payment_id:', liveErr)
        throw new Error('Could not record the live regen order')
      }
    } else if (targetKind === 'live') {
      const { error: liveErr } = await admin
        .from('live_exports')
        .upsert({ session_id: targetId, user_id: user!.id, payment_id: cashfreeData.order_id, payment_status: 'unpaid' })
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
 
    return new Response(JSON.stringify({
      paymentSessionId: cashfreeData.payment_session_id,
      cashfreeMode: Deno.env.get('CASHFREE_ENV') === 'production' ? 'production' : 'sandbox',
    }), {
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
