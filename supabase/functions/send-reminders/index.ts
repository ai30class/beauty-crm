import { createClient } from 'jsr:@supabase/supabase-js@2';

/* eslint-disable no-undef */
// deno-lint-ignore-file no-undef

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

        await supabase.from('notification_logs').insert({
          owner_id: c.owner_id,
          ref_id: c.id,
          type: 'birthday',
          sent_date: tomorrow.toISOString().slice(0, 10),
        });
        console.log(`🎂 生日提醒已記錄 → ${c.name}（${c.birthday}）`);
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

        await supabase.from('notification_logs').insert({
          owner_id: a.owner_id,
          ref_id: a.id,
          type: 'appointment',
          sent_date: today,
        });
        const customerName = (a as any).customers?.name ?? '顧客';
        console.log(`🔔 預約提醒已記錄 → ${customerName}，${a.appointment_time}`);
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
