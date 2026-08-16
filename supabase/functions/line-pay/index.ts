/* eslint-disable */
// deno-lint-ignore-file no-undef
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// LINE Pay API helper
async function linePayRequest(
  channelId: string,
  channelSecret: string,
  path: string,
  method: 'GET' | 'POST',
  body?: unknown,
  env: 'sandbox' | 'production' = 'sandbox',
) {
  const host = env === 'production'
    ? 'https://api-pay.line.me'
    : 'https://sandbox-api-pay.line.me';

  const nonce = crypto.randomUUID();
  const bodyStr = body ? JSON.stringify(body) : '';
  const message = `${channelSecret}${path}${bodyStr}${nonce}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(channelSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  const signature = btoa(String.fromCharCode(...new Uint8Array(sig)));

  const res = await fetch(`${host}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-LINE-ChannelId': channelId,
      'X-LINE-Authorization-Nonce': nonce,
      'X-LINE-Authorization': signature,
    },
    body: body ? bodyStr : undefined,
  });
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const channelId     = Deno.env.get('LINE_PAY_CHANNEL_ID') ?? '';
  const channelSecret = Deno.env.get('LINE_PAY_CHANNEL_SECRET') ?? '';
  const payEnv        = (Deno.env.get('LINE_PAY_ENV') ?? 'sandbox') as 'sandbox' | 'production';

  try {
    const url = new URL(req.url);
    const action = url.pathname.split('/').pop();

    // ── 建立訂單並取得付款 URL ──────────────────────────────────────────────
    if (action === 'create' && req.method === 'POST') {
      const {
        owner_id, customer_name, customer_phone, customer_user_id,
        staff_id, service_template_id, service_name,
        duration_minutes, total_amount,
        appointment_time, notes,
      } = await req.json() as {
        owner_id: string;
        customer_name: string;
        customer_phone: string;
        customer_user_id: string | null;
        staff_id: string | null;
        service_template_id: string | null;
        service_name: string;
        duration_minutes: number;
        total_amount: number;
        appointment_time: string;
        notes: string | null;
      };

      if (!owner_id || !customer_name || !customer_phone || !service_name || !appointment_time) {
        return new Response(JSON.stringify({ error: '缺少必填欄位' }), { status: 400, headers: corsHeaders });
      }

      const deposit_amount = Math.round(total_amount * 0.5);
      // 結束時間 = 開始 + 服務時長 + 30 分鐘休息
      const startMs = new Date(appointment_time).getTime();
      const end_time = new Date(startMs + (duration_minutes + 30) * 60000).toISOString();
      const orderId = `APPT-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

      // 呼叫 LINE Pay Request API
      const baseUrl = Deno.env.get('SUPABASE_URL')!.replace('/rest/v1', '');
      const payBody = {
        amount: deposit_amount,
        currency: 'TWD',
        orderId,
        packages: [{
          id: 'pkg-1',
          amount: deposit_amount,
          products: [{
            name: `${service_name} 訂金（50%）`,
            quantity: 1,
            price: deposit_amount,
          }],
        }],
        redirectUrls: {
          confirmUrl: `${baseUrl}/functions/v1/line-pay/confirm`,
          cancelUrl:  `${baseUrl}/functions/v1/line-pay/cancel`,
        },
      };

      const lineRes = await linePayRequest(channelId, channelSecret, '/v3/payments/request', 'POST', payBody, payEnv);

      if (lineRes.returnCode !== '0000') {
        return new Response(JSON.stringify({ error: lineRes.returnMessage ?? 'LINE Pay 請求失敗' }), { status: 502, headers: corsHeaders });
      }

      const paymentUrl = lineRes.info?.paymentUrl?.web ?? lineRes.info?.paymentUrl?.app;
      const transactionId = String(lineRes.info?.transactionId ?? '');

      // 寫入 online_orders
      const { data: order, error: dbErr } = await supabase
        .from('online_orders')
        .insert({
          owner_id,
          customer_name,
          customer_phone,
          customer_user_id:    customer_user_id ?? null,
          staff_id:            staff_id ?? null,
          service_template_id: service_template_id ?? null,
          service_name,
          duration_minutes,
          total_amount,
          deposit_amount,
          appointment_time,
          end_time,
          notes: notes ?? null,
          status: 'pending_payment',
          line_pay_transaction_id: transactionId,
          line_pay_order_id:       orderId,
          line_pay_payment_url:    paymentUrl,
        })
        .select('id')
        .single();

      if (dbErr) throw dbErr;

      return new Response(
        JSON.stringify({ orderId, paymentUrl, orderDbId: order.id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── LINE Pay Confirm 回調 ──────────────────────────────────────────────
    if (action === 'confirm' && req.method === 'GET') {
      const transactionId = url.searchParams.get('transactionId');
      const orderId       = url.searchParams.get('orderId');

      if (!transactionId || !orderId) {
        return new Response('missing params', { status: 400 });
      }

      // 查訂單
      const { data: order } = await supabase
        .from('online_orders')
        .select('id, deposit_amount, status')
        .eq('line_pay_order_id', orderId)
        .single();

      if (!order) return new Response('order not found', { status: 404 });

      // 已付款不重複處理（樂觀鎖）
      if (order.status !== 'pending_payment') {
        return Response.redirect(`${Deno.env.get('EXPO_PUBLIC_APP_URL') ?? ''}/payment-result?orderId=${orderId}&result=ok`);
      }

      // Confirm API
      const confirmRes = await linePayRequest(
        channelId, channelSecret,
        `/v3/payments/${transactionId}/confirm`,
        'POST',
        { amount: order.deposit_amount, currency: 'TWD' },
        payEnv,
      );

      if (confirmRes.returnCode === '0000') {
        await supabase
          .from('online_orders')
          .update({ status: 'paid', line_pay_paid_at: new Date().toISOString() })
          .eq('id', order.id)
          .eq('status', 'pending_payment'); // 樂觀鎖：只更新一次
      }

      // 重導向 App deep link（Web preview 用）
      const resultParam = confirmRes.returnCode === '0000' ? 'ok' : 'fail';
      const appUrl = Deno.env.get('EXPO_PUBLIC_APP_URL') ?? 'exp://localhost:8081';
      return Response.redirect(`${appUrl}?payResult=${resultParam}&orderId=${orderId}`, 302);
    }

    // ── LINE Pay Cancel 回調 ──────────────────────────────────────────────
    if (action === 'cancel' && req.method === 'GET') {
      const orderId = url.searchParams.get('orderId');
      if (orderId) {
        await supabase
          .from('online_orders')
          .update({ status: 'cancelled' })
          .eq('line_pay_order_id', orderId)
          .eq('status', 'pending_payment');
      }
      const appUrl = Deno.env.get('EXPO_PUBLIC_APP_URL') ?? 'exp://localhost:8081';
      return Response.redirect(`${appUrl}?payResult=cancel&orderId=${orderId}`, 302);
    }

    // ── 查詢訂單狀態（App 輪詢）─────────────────────────────────────────
    if (action === 'status' && req.method === 'GET') {
      const orderId = url.searchParams.get('orderId');
      const { data } = await supabase
        .from('online_orders')
        .select('status, line_pay_paid_at, appointment_time, service_name, staff_id, customer_name, deposit_amount, total_amount')
        .eq('line_pay_order_id', orderId)
        .single();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response('not found', { status: 404, headers: corsHeaders });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders });
  }
});
