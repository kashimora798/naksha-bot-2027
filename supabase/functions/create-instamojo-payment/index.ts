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

    const API_KEY = Deno.env.get('INSTAMOJO_API_KEY')
    const AUTH_TOKEN = Deno.env.get('INSTAMOJO_AUTH_TOKEN')
    
    // For test mode
    const INSTAMOJO_URL = 'https://test.instamojo.com/api/1.1/payment-requests/'

    const payload = new URLSearchParams()
    payload.append('purpose', `Export Map: ${projectId}`)
    payload.append('amount', '20')
    payload.append('buyer_name', user.user_metadata?.full_name || user.email || '')
    payload.append('email', user.email || '')
    payload.append('redirect_url', `${req.headers.get('origin')}/?payment=success&project_id=${projectId}`)
    payload.append('webhook', `${Deno.env.get('SUPABASE_URL')}/functions/v1/instamojo-webhook`)
    payload.append('allow_repeated_payments', 'false')
    payload.append('send_email', 'true')

    const res = await fetch(INSTAMOJO_URL, {
      method: 'POST',
      headers: {
        'X-Api-Key': API_KEY!,
        'X-Auth-Token': AUTH_TOKEN!,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: payload.toString()
    })

    const instamojoData = await res.json()

    if (!instamojoData.success) {
      console.error('Instamojo error:', instamojoData)
      throw new Error('Failed to create payment request: ' + JSON.stringify(instamojoData.message))
    }

    await supabaseClient
      .from('projects')
      .update({ payment_id: instamojoData.payment_request.id })
      .eq('id', projectId)

    return new Response(JSON.stringify({ url: instamojoData.payment_request.longurl }), {
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
