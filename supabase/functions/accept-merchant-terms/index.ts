/* eslint-disable */
// deno-lint-ignore-file no-undef
import { createClient } from 'jsr:@supabase/supabase-js@2';

// 記錄商家同意 SaaS 服務條款時的 IP／裝置資訊，當作簽署證據——client-side JS
// 沒辦法拿到自己的公網 IP，一定要在伺服器端讀 request header 才行，所以這步
// 不能像其他 profiles 欄位一樣直接讓前端呼叫 supabase-js 寫入。
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('not found', { status: 404, headers: corsHeaders });

  try {
    const { version } = await req.json() as { version?: string };
    if (!version) {
      return new Response(JSON.stringify({ error: '缺少 version' }), { status: 400, headers: corsHeaders });
    }

    // 帶著呼叫端自己的 JWT 建 client，只能更新到自己的 profiles 那一列
    // （沿用既有「用戶更新自己的 profile」RLS policy，不需要 service role key）
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: '未登入' }), { status: 401, headers: corsHeaders });
    }

    // x-forwarded-for 可能是「原始來源, 代理1, 代理2」的清單，第一個才是真正發起
    // 請求的來源；抓不到就退回 x-real-ip。這是一般水準的稽核記錄，不是無法偽造
    // 的鑑識證據（VPN／代理仍可能影響真實性），但足以當作一般 SaaS 條款簽署佐證。
    const forwardedFor = req.headers.get('x-forwarded-for') ?? '';
    const ip = forwardedFor.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null;
    const userAgent = req.headers.get('user-agent') ?? null;

    const { error } = await supabase
      .from('profiles')
      .update({
        merchant_terms_accepted_version: version,
        merchant_terms_accepted_at: new Date().toISOString(),
        merchant_terms_accepted_ip: ip,
        merchant_terms_accepted_user_agent: userAgent,
      })
      .eq('id', user.id);
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders });
  }
});
