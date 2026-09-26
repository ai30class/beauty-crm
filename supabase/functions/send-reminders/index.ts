import { createClient } from 'jsr:@supabase/supabase-js@2';

/* eslint-disable no-undef */
// deno-lint-ignore-file no-undef

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 依 customer_id 找出對應的 LINE userId（顧客要用過「用 LINE 一鍵登入」且同意加好友
// 才會有），找不到就代表沒辦法推播給這位顧客，只能留在 notification_logs 當稽核紀錄。
// 只認「這家店自己的 LINE 登入頻道」拿到的編號（00110）：不同提供者底下同一個人的
// LINE 編號不同，拿別家頻道的編號用這家店的通行證發，LINE 會直接拒絕
async function findLineUserId(supabase: ReturnType<typeof createClient>, customerId: string, loginChannelId: string): Promise<string | null> {
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
    .eq('login_channel_id', loginChannelId)
    .maybeSingle();
  return identity?.line_user_id ?? null;
}

// 依「預約」找出要提醒的 LINE userId（身分確認規劃第一步，2026-09-26）：
// 線上預約是顧客本人用 LINE 登入後送出的，直接用「送出預約的那個帳號」找 LINE，
// 不再繞經顧客檔——這樣電話對到舊顧客檔、店家還沒確認身分（還沒綁定）時，本人照樣收得到提醒；
// 用別人電話預約的，提醒也只會發給預約的人自己，不會發到那支電話原本主人的 LINE。
// 店家後台手動建的預約（沒有 customer_user_id），跟以前一樣透過顧客檔找。
async function findLineUserIdForAppt(
  supabase: ReturnType<typeof createClient>,
  a: { customer_id: string | null; customer_user_id: string | null },
  loginChannelId: string,
): Promise<string | null> {
  if (a.customer_user_id) {
    const { data: identity } = await supabase
      .from('line_identities')
      .select('line_user_id')
      .eq('user_id', a.customer_user_id)
      .eq('login_channel_id', loginChannelId)
      .maybeSingle();
    return identity?.line_user_id ?? null;
  }
  return a.customer_id ? await findLineUserId(supabase, a.customer_id, loginChannelId) : null;
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
): Promise<Array<{ id: string; owner_id: string; customer_id: string | null; customer_user_id: string | null; appointment_time: string; customerName: string }>> {
  const [{ data: appts }, { data: orders }] = await Promise.all([
    supabase
      .from('appointments')
      .select('id, owner_id, customer_id, appointment_time, customers(name)')
      .eq('status', 'pending')
      .gte('appointment_time', from)
      .lte('appointment_time', to),
    supabase
      .from('online_orders')
      .select('id, owner_id, customer_id, customer_user_id, customer_name, appointment_time')
      .in('status', ['paid', 'confirmed'])
      .gte('appointment_time', from)
      .lte('appointment_time', to),
  ]);

  // deno-lint-ignore no-explicit-any
  const fromAppts = (appts ?? []).map((a: any) => ({
    id: a.id as string,
    owner_id: a.owner_id as string,
    customer_id: a.customer_id as string | null,
    customer_user_id: null,
    appointment_time: a.appointment_time as string,
    customerName: (a.customers?.name as string | undefined) ?? '顧客',
  }));
  // deno-lint-ignore no-explicit-any
  const fromOrders = (orders ?? []).map((o: any) => ({
    id: o.id as string,
    owner_id: o.owner_id as string,
    customer_id: o.customer_id as string | null,
    customer_user_id: (o.customer_user_id as string | null) ?? null,
    appointment_time: o.appointment_time as string,
    customerName: (o.customer_name as string | undefined) ?? '顧客',
  }));
  return [...fromAppts, ...fromOrders];
}

async function pushLineMessage(token: string, lineUserId: string, text: string): Promise<boolean> {
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ to: lineUserId, messages: [{ type: 'text', text }] }),
  });
  if (!res.ok) console.error('LINE push 失敗', res.status, await res.text());
  return res.ok;
}

// 哪些店可以發 LINE 提醒：有開「LINE 自動提醒」（shop_profiles.line_reminders_enabled，migration 00089，
// 只有平台管理者用 SQL 打開），而且已經設定好自己的 LINE 官方帳號（shop_line_channels＋Vault，00110）。
// 2026-09-24 起強制規定：沒有自己 LINE 帳號的店一律不發，不再用環境變數裡那組共用的帳號——
// 不然 A 店的提醒會從別家的官方帳號發出去、吃別人的訊息額度。
// 查詢失敗一律當作「不能發」——寧可這次漏發，也不要發錯帳號；原因會留在日誌
type ShopLine = { token: string; loginChannelId: string };
// deno-lint-ignore no-explicit-any
async function getLineReadyShops(supabase: any): Promise<Map<string, ShopLine>> {
  const shops = new Map<string, ShopLine>();
  const { data, error } = await supabase
    .from('shop_profiles')
    .select('owner_id')
    .eq('line_reminders_enabled', true);
  if (error) {
    console.error('讀取 LINE 提醒開關失敗，這次一律不發送', error);
    return shops;
  }
  for (const r of (data ?? []) as Array<{ owner_id: string }>) {
    const { data: rows, error: secErr } = await supabase.rpc('get_shop_line_secrets', { p_owner_id: r.owner_id });
    const s = Array.isArray(rows) ? rows[0] : null;
    const token: string = s?.messaging_access_token ?? '';
    // 通行證只會是英數加 + / =；有空白或中文代表填錯（例如貼成說明文字），不能拿去發
    if (secErr || !s?.login_channel_id || !/^[A-Za-z0-9+/=]{20,}$/.test(token)) {
      console.error(`⚠️ 店家 ${r.owner_id} 有開 LINE 提醒，但還沒設定好自己的 LINE 官方帳號，這次不發送`, secErr ?? '');
      continue;
    }
    shops.set(r.owner_id, { token, loginChannelId: s.login_channel_id });
  }
  return shops;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // 只接受排程（pg_cron）呼叫：要帶 x-cron-secret，且跟 Vault 裡的 CRON_SECRET 一致（00104）。
  // anon key 是公開的，光有它不算數；沒帶暗號或暗號不對一律 401，不做任何事。
  {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    // 暗號檢查偶爾會因為資料庫一時出錯而失敗（9/24、9/26 整點兩個排程同時跑時各發生一次，
    // 舊寫法沒看 error，出錯就被當成「暗號不對」回 401，排程那次就白跑了）。
    // 改成：出錯先記錄、等 1.5 秒再試一次；確定查到「暗號不對」才回 401，
    // 連續兩次都出錯則回 500，在 Invocations 會顯示成紅色，跟真的被擋（401）分得開。
    let ok: unknown = null;
    let checkFailed = true;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const { data, error } = await admin.rpc('check_cron_secret', {
        p_secret: req.headers.get('x-cron-secret') ?? '',
      });
      // 正常一定回 true 或 false；有錯誤、或回了其他東西（例如 null），都當成「這次沒查成功」
      if (!error && typeof data === 'boolean') { ok = data; checkFailed = false; break; }
      console.error(`⚠️ 暗號檢查第 ${attempt} 次沒查成功`, error?.message ?? error ?? `回傳值：${JSON.stringify(data)}`);
      if (attempt < 2) await new Promise((r) => setTimeout(r, 1500));
    }
    if (checkFailed) {
      return new Response(JSON.stringify({ error: 'secret check failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (ok !== true) {
      // 留個線索方便追查（只記有沒有帶、長度多少，不記暗號本身）
      const len = (req.headers.get('x-cron-secret') ?? '').length;
      console.warn(`🚫 暗號不對，拒絕執行（有帶暗號：${len > 0}，長度 ${len}）`);
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

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

      const lineShops = await getLineReadyShops(supabase);
      let skipped = 0;
      for (const c of dueTomorrow) {
        // 沒開 LINE 提醒、或還沒設定自己 LINE 帳號的店：不推播，也不寫紀錄
        const shopLine = lineShops.get(c.owner_id);
        if (!shopLine) { skipped++; continue; }
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

        const lineUserId = await findLineUserId(supabase, c.id, shopLine.loginChannelId);
        let sent = false;
        if (lineUserId) {
          sent = await pushLineMessage(
            shopLine.token,
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
      if (skipped > 0) console.log(`ℹ️ 生日提醒：略過 ${skipped} 位（店家未開 LINE 提醒或未設定自己的 LINE 帳號）`);
    } else if (type === 'appointment') {
      // 查詢 15–75 分鐘後的預約
      const now = new Date();
      const from = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
      const to   = new Date(now.getTime() + 75 * 60 * 1000).toISOString();

      const due = await fetchDueAppointments(supabase, from, to);
      const lineShops = await getLineReadyShops(supabase);
      let skipped = 0;

      for (const a of due) {
        // 沒開 LINE 提醒、或還沒設定自己 LINE 帳號的店：不推播，也不寫紀錄
        const shopLine = lineShops.get(a.owner_id);
        if (!shopLine) { skipped++; continue; }
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

        const lineUserId = await findLineUserIdForAppt(supabase, a, shopLine.loginChannelId);
        let sent = false;
        if (lineUserId) {
          sent = await pushLineMessage(
            shopLine.token,
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
      if (skipped > 0) console.log(`ℹ️ 預約提醒：略過 ${skipped} 筆（店家未開 LINE 提醒或未設定自己的 LINE 帳號）`);
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
      const lineShops = await getLineReadyShops(supabase);
      let skipped = 0;

      for (const a of due) {
        // 沒開 LINE 提醒、或還沒設定自己 LINE 帳號的店：不推播，也不寫紀錄
        const shopLine = lineShops.get(a.owner_id);
        if (!shopLine) { skipped++; continue; }
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

        const lineUserId = await findLineUserIdForAppt(supabase, a, shopLine.loginChannelId);
        let sent = false;
        if (lineUserId) {
          sent = await pushLineMessage(
            shopLine.token,
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
      if (skipped > 0) console.log(`ℹ️ 前一天預約提醒：略過 ${skipped} 筆（店家未開 LINE 提醒或未設定自己的 LINE 帳號）`);
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
