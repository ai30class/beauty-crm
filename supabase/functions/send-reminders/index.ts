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

// 統一撈「預約時間落在指定區間內、真的算數的預約」——同時涵蓋商家後台手動建的
// appointments，跟顧客線上預約（含 LINE 登入）建的 online_orders（只算 paid／
// confirmed，還在等訂金確認的 pending_transfer_confirm 不提醒）。這兩張表原本
// 是分開查的，提醒功能一直漏掉 online_orders，等於線上預約的顧客完全收不到
// 前一天／快到了的提醒，2026-09-08 補上。
async function fetchDueAppointments(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  from: string,
  to: string,
): Promise<Array<{ id: string; owner_id: string; customer_id: string | null; appointment_time: string; customerName: string }>> {
  const [{ data: appts }, { data: orders }] = await Promise.all([
    supabase
      .from('appointments')
      .select('id, owner_id, customer_id, appointment_time, customers(name)')
      .eq('status', 'pending')
      .gte('appointment_time', from)
      .lte('appointment_time', to),
    supabase
      .from('online_orders')
      .select('id, owner_id, customer_id, customer_name, appointment_time')
      .in('status', ['paid', 'confirmed'])
      .gte('appointment_time', from)
      .lte('appointment_time', to),
  ]);

  // deno-lint-ignore no-explicit-any
  const fromAppts = (appts ?? []).map((a: any) => ({
    id: a.id as string,
    owner_id: a.owner_id as string,
    customer_id: a.customer_id as string | null,
    appointment_time: a.appointment_time as string,
    customerName: (a.customers?.name as string | undefined) ?? '顧客',
  }));
  // deno-lint-ignore no-explicit-any
  const fromOrders = (orders ?? []).map((o: any) => ({
    id: o.id as string,
    owner_id: o.owner_id as string,
    customer_id: o.customer_id as string | null,
    appointment_time: o.appointment_time as string,
    customerName: (o.customer_name as string | undefined) ?? '顧客',
  }));
  return [...fromAppts, ...fromOrders];
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
    const { type } = await req.json() as { type: 'birthday' | 'appointment' | 'appointment_day_before' | 'expire_pending_deposit' };
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

      const due = await fetchDueAppointments(supabase, from, to);

      for (const a of due) {
        const today = now.toISOString().slice(0, 10);
        const { data: existing } = await supabase
          .from('notification_logs')
          .select('id')
          .eq('ref_id', a.id)
          .eq('type', 'appointment')
          .eq('sent_date', today)
          .maybeSingle();
        if (existing) continue;

        const apptTime = new Date(a.appointment_time);
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
        console.log(`🔔 預約提醒 → ${a.customerName}，${a.appointment_time}　${sent ? '已用 LINE 發送' : '僅記錄（無 LINE 身份）'}`);
      }
    } else if (type === 'appointment_day_before') {
      // 查詢明天（台灣時區的日曆日）的預約，每天固定時間跑一次、提前一天提醒
      const TZ_OFFSET_MS = 8 * 60 * 60 * 1000; // 台灣是 UTC+8，沒有日光節約
      const nowTaipei = new Date(Date.now() + TZ_OFFSET_MS);
      const tomorrowTaipei = new Date(nowTaipei);
      tomorrowTaipei.setUTCDate(tomorrowTaipei.getUTCDate() + 1);
      const tomorrowDateStr = tomorrowTaipei.toISOString().slice(0, 10);
      const todayDateStr = nowTaipei.toISOString().slice(0, 10);

      const dayStart = new Date(`${tomorrowDateStr}T00:00:00+08:00`).toISOString();
      const dayEnd = new Date(`${tomorrowDateStr}T23:59:59.999+08:00`).toISOString();

      const due = await fetchDueAppointments(supabase, dayStart, dayEnd);

      for (const a of due) {
        // 防重推送：用「今天」當 sent_date，同一筆預約這個提醒類型一天只發一次
        const { data: existing } = await supabase
          .from('notification_logs')
          .select('id')
          .eq('ref_id', a.id)
          .eq('type', 'appointment_day_before')
          .eq('sent_date', todayDateStr)
          .maybeSingle();
        if (existing) continue;

        const apptTime = new Date(a.appointment_time);
        const dateStr = apptTime.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', month: 'long', day: 'numeric' });
        const timeStr = apptTime.toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false });

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
            `📅 提醒您，明天 ${dateStr} ${timeStr} 在${shop?.shop_name ?? '我們店裡'}有一個預約，記得準時來喔 🌸`,
          );
        }

        await supabase.from('notification_logs').insert({
          owner_id: a.owner_id,
          ref_id: a.id,
          type: 'appointment_day_before',
          sent_date: todayDateStr,
        });
        console.log(`📅 前一天預約提醒 → ${a.customerName}，${a.appointment_time}　${sent ? '已用 LINE 發送' : '僅記錄（無 LINE 身份）'}`);
      }
    } else if (type === 'expire_pending_deposit') {
      // 匯款訂金流程：待確認匯款超過期限、店家一直沒標記已收訂金的訂單，
      // 自動取消、釋出時段，避免顧客佔著時段卻遲遲沒下文
      const nowIso = new Date().toISOString();
      const { data: expired } = await supabase
        .from('online_orders')
        .select('id, owner_id, customer_name, appointment_time')
        .eq('status', 'pending_transfer_confirm')
        .lt('deposit_confirm_deadline', nowIso);

      for (const o of expired ?? []) {
        await supabase
          .from('online_orders')
          .update({ status: 'cancelled' })
          .eq('id', o.id)
          .eq('status', 'pending_transfer_confirm'); // 樂觀鎖：避免跟店家剛好同時標記已收訂金互相打架
        console.log(`⏳ 待確認匯款逾期自動取消 → ${o.customer_name}，${o.appointment_time}`);
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
