import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const payload = await req.json()
    
    // In a production environment, you MUST verify the 'x-webhook-signature'
    // using your CASHFREE_SECRET_KEY to ensure the webhook is from Cashfree.
    
    if (payload.type === 'PAYMENT_SUCCESS_WEBHOOK' && payload.data?.order?.order_id) {
      const orderId = payload.data.order.order_id
      
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )
      
      // Update the specific project identified by orderId (which we mapped to projectId)
      await supabaseAdmin
        .from('projects')
        .update({ payment_status: 'paid' })
        .eq('id', orderId)
    }

    return new Response('ok', { status: 200 })
  } catch (error) {
    console.error('Webhook Error:', error)
    return new Response('error', { status: 400 })
  }
})
