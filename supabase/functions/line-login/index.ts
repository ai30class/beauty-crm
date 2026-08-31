/* eslint-disable */
// deno-lint-ignore-file no-undef
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { jwtVerify, createRemoteJWKSet } from 'npm:jose@5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// LINE 的 OIDC 金鑰集合，用來驗證 id_token 簽章（避免直接信任未驗證過的 JWT）
const LINE_JWKS = createRemoteJWKSet(new URL('https://api.line.me/oauth2/v2.1/certs'));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const channelId = Deno.env.get('LINE_LOGIN_CHANNEL_ID') ?? '';
  const channelSecret = Deno.env.get('LINE_LOGIN_CHANNEL_SECRET') ?? '';

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const url = new URL(req.url);
    const action = url.pathname.split('/').pop();

    if (action === 'callback' && req.method === 'POST') {
      const { code, redirect_uri } = await req.json() as { code: string; redirect_uri: string };
      if (!code || !redirect_uri) {
        return new Response(JSON.stringify({ error: '缺少必填欄位' }), { status: 400, headers: corsHeaders });
      }
      if (!channelId || !channelSecret) {
        return new Response(JSON.stringify({ error: 'LINE Login 尚未設定金鑰' }), { status: 500, headers: corsHeaders });
      }

      // ── 用 code 換 token ──────────────────────────────────────────────
      const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri,
          client_id: channelId,
          client_secret: channelSecret,
        }),
      });
      const tokenJson = await tokenRes.json();
      if (!tokenRes.ok || !tokenJson.id_token) {
        return new Response(JSON.stringify({ error: tokenJson.error_description ?? 'LINE 登入交換失敗' }), { status: 502, headers: corsHeaders });
      }

      // ── 驗證 id_token 簽章 + 內容 ──────────────────────────────────────
      const { payload } = await jwtVerify(tokenJson.id_token, LINE_JWKS, {
        issuer: 'https://access.line.me',
        audience: channelId,
      });
      const lineUserId = payload.sub as string;
      const displayName = (payload.name as string | undefined) ?? '';
      const pictureUrl = (payload.picture as string | undefined) ?? null;
      if (!lineUserId) {
        return new Response(JSON.stringify({ error: 'LINE 回傳資料不完整' }), { status: 502, headers: corsHeaders });
      }

      // ── 找出（或建立）對應的 Supabase 帳號 ──────────────────────────────
      const { data: existing } = await supabase
        .from('line_identities')
        .select('user_id')
        .eq('line_user_id', lineUserId)
        .maybeSingle();

      const syntheticEmail = `line-${lineUserId}@line.internal`;
      let userId: string;

      if (existing) {
        userId = existing.user_id;
      } else {
        const { data: created, error: createErr } = await supabase.auth.admin.createUser({
          email: syntheticEmail,
          email_confirm: true,
          user_metadata: { account_type: 'customer', line_user_id: lineUserId, name: displayName },
        });
        if (createErr || !created?.user) throw createErr ?? new Error('建立帳號失敗');
        userId = created.user.id;

        const { error: linkErr } = await supabase.from('line_identities').insert({
          line_user_id: lineUserId,
          user_id: userId,
          display_name: displayName,
          picture_url: pictureUrl,
        });
        if (linkErr) throw linkErr;
      }

      // ── 產生一次性登入連結（顧客端用 verifyOtp 換成真正的 session）────────
      const { data: link, error: linkGenErr } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: syntheticEmail,
      });
      if (linkGenErr || !link) throw linkGenErr ?? new Error('產生登入連結失敗');

      return new Response(
        JSON.stringify({
          email: syntheticEmail,
          token_hash: link.properties.hashed_token,
          name: displayName,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response('not found', { status: 404, headers: corsHeaders });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders });
  }
});
