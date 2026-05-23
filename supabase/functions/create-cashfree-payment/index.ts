import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user } } = await supabaseClient.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { projectId } = await req.json()
    if (!projectId) throw new Error('Missing projectId')

    const { data: project } = await supabaseClient
      .from('projects')
      .select('id, payment_status')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .single()

    if (!project) throw new Error('Project not found or unauthorized')
    if (project.payment_status === 'paid') {
      return new Response(JSON.stringify({ error: 'Already paid' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const APP_ID = Deno.env.get('CASHFREE_APP_ID')
    const SECRET_KEY = Deno.env.get('CASHFREE_SECRET_KEY')
    
    // For test mode
    const CASHFREE_URL = 'https://sandbox.cashfree.com/pg/orders'

    const orderPayload = {
      order_amount: 20.00,
      order_currency: "INR",
      order_id: projectId, // UUID is valid (max 45 chars, allows hyphen)
      customer_details: {
        customer_id: user.id.replace(/-/g, ''), // customer_id max length 50, alphanumeric
        customer_email: user.email || "test@example.com",
        customer_phone: "9999999999", // Dummy phone, since it requires exact 10 digits
        customer_name: user.user_metadata?.full_name || user.email || "Surveyor"
      },
      order_meta: {
        return_url: `${req.headers.get('origin')}/?payment=success&project_id=${projectId}`
      }
    };

    const res = await fetch(CASHFREE_URL, {
      method: 'POST',
      headers: {
        'x-client-id': APP_ID!,
        'x-client-secret': SECRET_KEY!,
        'x-api-version': '2025-01-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(orderPayload)
    })

    const cashfreeData = await res.json()

    if (!res.ok) {
      console.error('Cashfree error:', cashfreeData)
      throw new Error('Failed to create Cashfree order: ' + JSON.stringify(cashfreeData))
    }

    await supabaseClient
      .from('projects')
      .update({ payment_id: cashfreeData.order_id })
      .eq('id', projectId)

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
