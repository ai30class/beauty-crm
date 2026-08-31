import { createClient } from 'jsr:@supabase/supabase-js@2';

/* eslint-disable no-undef */
// deno-lint-ignore-file no-undef

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 依 customer_id 找出對應的 LINE userId（顧客要用過「用 LINE 一鍵登入」且同意加好友
// 才會有），找不到就代表沒辦法推播給這位顧客，只能留在 notification_logs 當稽核紀錄
async function findLineUserId(supabase: ReturnType<typeof createClient>, customerId: string): Promise<string | null> {
  const { data: cust } = await supabase
    .from('customers')
    .select('customer_user_id')
    .eq('id', customerId)
    .maybeSingle();
  if (!cust?.customer_user_id) return null;

  const { data: identity } = await supabase
    .from('line_identities')
    .select('line_user_id')
    .eq('user_id', cust.customer_user_id)
    .maybeSingle();
  return identity?.line_user_id ?? null;
}

async function pushLineMessage(lineUserId: string, text: string): Promise<boolean> {
  const token = Deno.env.get('LINE_MESSAGING_CHANNEL_ACCESS_TOKEN');
  if (!token) return false;
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ to: lineUserId, messages: [{ type: 'text', text }] }),
  });
  if (!res.ok) console.error('LINE push 失敗', res.status, await res.text());
  return res.ok;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { type } = await req.json() as { type: 'birthday' | 'appointment' };
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    if (type === 'birthday') {
      // 查詢明日壽星（月/日吻合即觸發）
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
      const dd = String(tomorrow.getDate()).padStart(2, '0');

      const { data: customers } = await supabase
        .from('customers')
        .select('id, owner_id, name, birthday')
        .not('birthday', 'is', null);

      const dueTomorrow = (customers ?? []).filter((c: any) => {
        if (!c.birthday) return false;
        const [, bm, bd] = c.birthday.split('-');
        return bm === mm && bd === dd;
      });

      for (const c of dueTomorrow) {
        // 防重推送
        const { data: existing } = await supabase
          .from('notification_logs')
          .select('id')
          .eq('ref_id', c.id)
          .eq('type', 'birthday')
          .eq('sent_date', tomorrow.toISOString().slice(0, 10))
          .maybeSingle();
        if (existing) continue;

        const { data: shop } = await supabase
          .from('shop_profiles')
          .select('shop_name')
          .eq('owner_id', c.owner_id)
          .maybeSingle();

        const lineUserId = await findLineUserId(supabase, c.id);
        let sent = false;
        if (lineUserId) {
          sent = await pushLineMessage(
            lineUserId,
            `🎂 ${c.name} 你好，${shop?.shop_name ?? '我們'}祝你生日快樂！期待你再度光臨 🌸`,
          );
        }

        await supabase.from('notification_logs').insert({
          owner_id: c.owner_id,
          ref_id: c.id,
          type: 'birthday',
          sent_date: tomorrow.toISOString().slice(0, 10),
        });
        console.log(`🎂 生日提醒 → ${c.name}（${c.birthday}）${sent ? '已用 LINE 發送' : '僅記錄（無 LINE 身份）'}`);
      }
    } else if (type === 'appointment') {
      // 查詢 15–75 分鐘後的預約
      const now = new Date();
      const from = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
      const to   = new Date(now.getTime() + 75 * 60 * 1000).toISOString();

      const { data: appts } = await supabase
        .from('appointments')
        .select('id, owner_id, customer_id, appointment_time, customers(name)')
        .eq('status', 'pending')
        .gte('appointment_time', from)
        .lte('appointment_time', to);

      for (const a of appts ?? []) {
        const today = now.toISOString().slice(0, 10);
        const { data: existing } = await supabase
          .from('notification_logs')
          .select('id')
          .eq('ref_id', a.id)
          .eq('type', 'appointment')
          .eq('sent_date', today)
          .maybeSingle();
        if (existing) continue;

        const customerName = (a as any).customers?.name ?? '顧客';
        const apptTime = new Date(a.appointment_time as unknown as string);
        const timeStr = apptTime.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false });

        const { data: shop } = await supabase
          .from('shop_profiles')
          .select('shop_name')
          .eq('owner_id', a.owner_id)
          .maybeSingle();

        const lineUserId = a.customer_id ? await findLineUserId(supabase, a.customer_id) : null;
        let sent = false;
        if (lineUserId) {
          sent = await pushLineMessage(
            lineUserId,
            `⏰ 提醒您，${timeStr} 在${shop?.shop_name ?? '我們店裡'}有一個預約，別忘記囉 🌸`,
          );
        }

        await supabase.from('notification_logs').insert({
          owner_id: a.owner_id,
          ref_id: a.id,
          type: 'appointment',
          sent_date: today,
        });
        console.log(`🔔 預約提醒 → ${customerName}，${a.appointment_time}　${sent ? '已用 LINE 發送' : '僅記錄（無 LINE 身份）'}`);
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
