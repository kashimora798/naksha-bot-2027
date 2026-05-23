import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const text = await req.text()
    const params = new URLSearchParams(text)
    
    const paymentRequestId = params.get('payment_request_id')
    const status = params.get('status')
    
    if (status === 'Credit' && paymentRequestId) {
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )
      
      await supabaseAdmin
        .from('projects')
        .update({ payment_status: 'paid' })
        .eq('payment_id', paymentRequestId)
    }

    return new Response('ok', { status: 200 })
  } catch (error) {
    return new Response('error', { status: 400 })
  }
})
