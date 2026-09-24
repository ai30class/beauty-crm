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

// deno-lint-ignore no-explicit-any
async function issueSessionForLineUser(
  supabase: any,
  lineUserId: string,
  displayName: string,
  pictureUrl: string | null,
  loginChannelId: string,
  headers: Record<string, string>,
): Promise<Response> {
  // ── 找出（或建立）對應的 Supabase 帳號 ──────────────────────────────
  const { data: existing } = await supabase
    .from('line_identities')
    .select('user_id, login_channel_id')
    .eq('line_user_id', lineUserId)
    .maybeSingle();

  const syntheticEmail = `line-${lineUserId}@line.internal`;
  let userId: string;

  if (existing) {
    userId = existing.user_id;
    // 00110 之前建立、還沒記錄來源頻道的，補記（推播時要用同一個頻道的編號才送得到）
    if (!existing.login_channel_id) {
      await supabase.from('line_identities').update({ login_channel_id: loginChannelId }).eq('line_user_id', lineUserId);
    }
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
      login_channel_id: loginChannelId,
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
    { headers: { ...headers, 'Content-Type': 'application/json' } },
  );
}

// 依預約頁所屬的店家挑 LINE 登入頻道（00110）：
//   有自己 LINE 官方帳號的店（進階版）→ 用那家店自己的頻道（shop_line_channels＋Vault），
//     顧客的 LINE 編號跟店家發訊息的帳號同一個提供者，提醒才送得到；
//   沒有的店（基礎版、試用店，或網址沒帶店家）→ 用平台自己的「美業管家」登入頻道
//     （PLATFORM_LINE_LOGIN_CHANNEL_ID／SECRET，2026-09-24 Emma 建立；只登入、不發提醒）。
// 2026-09-24 起不再用環境變數 LINE_LOGIN_CHANNEL_ID／SECRET 那組（其實是椏椏的頻道）
// deno-lint-ignore no-explicit-any
async function getLoginChannel(supabase: any, ownerId: unknown): Promise<{ channelId: string; channelSecret: string } | null> {
  if (typeof ownerId === 'string' && /^[0-9a-f-]{36}$/i.test(ownerId)) {
    const { data, error } = await supabase.rpc('get_shop_line_secrets', { p_owner_id: ownerId });
    const row = Array.isArray(data) ? data[0] : null;
    if (!error && row?.login_channel_id && row?.login_channel_secret) {
      return { channelId: row.login_channel_id, channelSecret: row.login_channel_secret };
    }
  }
  const channelId = Deno.env.get('PLATFORM_LINE_LOGIN_CHANNEL_ID') ?? '';
  const channelSecret = Deno.env.get('PLATFORM_LINE_LOGIN_CHANNEL_SECRET') ?? '';
  if (!channelId || !channelSecret) return null;
  return { channelId, channelSecret };
}

const NOT_CONFIGURED = 'LINE 登入暫時無法使用，請改用其他方式登入';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const url = new URL(req.url);
    const action = url.pathname.split('/').pop();

    // LIFF 版登入：前端用 liff.getIDToken() 直接拿已經簽好的 id_token，不用再走
    // code 換 token 那一步（LIFF SDK 自己在 LINE App／內建瀏覽器裡處理過登入了）
    if (action === 'verify' && req.method === 'POST') {
      const { idToken, ownerId } = await req.json() as { idToken: string; ownerId?: string };
      if (!idToken) {
        return new Response(JSON.stringify({ error: '缺少 idToken' }), { status: 400, headers: corsHeaders });
      }
      const channel = await getLoginChannel(supabase, ownerId);
      if (!channel) {
        return new Response(JSON.stringify({ error: NOT_CONFIGURED }), { status: 500, headers: corsHeaders });
      }
      const { channelId } = channel;

      const { payload } = await jwtVerify(idToken, LINE_JWKS, {
        issuer: 'https://access.line.me',
        audience: channelId,
      });
      const lineUserId = payload.sub as string;
      const displayName = (payload.name as string | undefined) ?? '';
      const pictureUrl = (payload.picture as string | undefined) ?? null;
      if (!lineUserId) {
        return new Response(JSON.stringify({ error: 'LINE 回傳資料不完整' }), { status: 502, headers: corsHeaders });
      }

      return await issueSessionForLineUser(supabase, lineUserId, displayName, pictureUrl, channelId, corsHeaders);
    }

    if (action === 'callback' && req.method === 'POST') {
      const { code, redirect_uri, ownerId } = await req.json() as { code: string; redirect_uri: string; ownerId?: string };
      if (!code || !redirect_uri) {
        return new Response(JSON.stringify({ error: '缺少必填欄位' }), { status: 400, headers: corsHeaders });
      }
      const channel = await getLoginChannel(supabase, ownerId);
      if (!channel) {
        return new Response(JSON.stringify({ error: NOT_CONFIGURED }), { status: 500, headers: corsHeaders });
      }
      const { channelId, channelSecret } = channel;

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

      return await issueSessionForLineUser(supabase, lineUserId, displayName, pictureUrl, channelId, corsHeaders);
    }

    return new Response('not found', { status: 404, headers: corsHeaders });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders });
  }
});
