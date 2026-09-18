/* eslint-disable */
// deno-lint-ignore-file no-undef
import { createClient } from 'jsr:@supabase/supabase-js@2';

// 商家在「員工管理」頁幫某位員工建立登入帳號：寄一封邀請信，對方自己設密碼
// （密碼不會經過商家或這支 function 手上）。跟 line-login 建立顧客帳號的手法
// 一樣是 Admin API，但這裡用 inviteUserByEmail（真實信箱、對方自己設密碼），
// 不是 createUser（line-login 用合成信箱＋不需要密碼）。
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('not found', { status: 404, headers: corsHeaders });

  try {
    const { email, staff_id, redirect_to } = await req.json() as {
      email?: string; staff_id?: string; redirect_to?: string;
    };
    if (!email || !staff_id) {
      return new Response(JSON.stringify({ error: '缺少 email 或 staff_id' }), { status: 400, headers: corsHeaders });
    }

    // 呼叫端自己的 JWT，確認是已登入的商家，且這個 staff_id 真的是他名下的員工
    // （靠既有的 「staff_owner_all」RLS：查不到就代表不是他的，不用另外手動比對 owner_id）。
    const authHeader = req.headers.get('Authorization') ?? '';
    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user: caller }, error: callerErr } = await callerClient.auth.getUser();
    if (callerErr || !caller) {
      return new Response(JSON.stringify({ error: '未登入' }), { status: 401, headers: corsHeaders });
    }

    const { data: callerProfile } = await callerClient
      .from('profiles')
      .select('account_type')
      .eq('id', caller.id)
      .maybeSingle();
    if (callerProfile?.account_type !== 'merchant') {
      return new Response(JSON.stringify({ error: '只有商家帳號能建立員工登入帳號' }), { status: 403, headers: corsHeaders });
    }

    const { data: staffRow, error: staffErr } = await callerClient
      .from('staff')
      .select('id, name')
      .eq('id', staff_id)
      .maybeSingle();
    if (staffErr || !staffRow) {
      return new Response(JSON.stringify({ error: '找不到這位員工，或不屬於你的店' }), { status: 404, headers: corsHeaders });
    }

    // 這個員工是不是已經有登入帳號了：同一個 staff_id 不該重複建立
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: existing } = await adminClient
      .from('profiles')
      .select('id')
      .eq('staff_id', staff_id)
      .eq('account_type', 'staff')
      .maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ error: `${staffRow.name} 已經有登入帳號了，不能重複建立` }), { status: 409, headers: corsHeaders });
    }

    const { data: invited, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: {
        account_type: 'staff',
        staff_owner_id: caller.id,
        staff_id,
      },
      redirectTo: redirect_to || undefined,
    });
    if (inviteErr || !invited?.user) {
      throw inviteErr ?? new Error('建立員工帳號失敗');
    }

    return new Response(JSON.stringify({ ok: true, user_id: invited.user.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders });
  }
});
