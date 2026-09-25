/* eslint-disable */
// deno-lint-ignore-file no-undef
// 收瀏覽器的 CSP 違規報告（2026-09-25 第三輪安全檢測 P2：CSP 先用 Report-Only 觀察）。
//
// 網站（vercel.json）送出 Content-Security-Policy-Report-Only，瀏覽器發現「不在允許清單上」的
// 資源時照樣放行，但會把報告 POST 到這裡；這支只把重點欄位寫進 Logs（Supabase → Edge Functions →
// csp-report → Logs），不讀、不寫任何資料庫資料。
//
// ⚠️ 瀏覽器送報告不帶登入資訊，所以這支在 Supabase 的設定要關掉「Enforce JWT verification」。
//    任何人都能打這個網址，最多只能灌 Logs；已限制單次大小，並且只記錄路徑、不記錄網址參數（避免把 ?ownerId 之類寫進紀錄）。

const MAX_BODY = 16 * 1024;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// 只留「來源＋路徑」，去掉查詢參數與 # 後面
function stripUrl(u: unknown): string {
  if (typeof u !== 'string' || !u) return '';
  if (!/^https?:/i.test(u)) return u.slice(0, 60); // inline、eval、data 等關鍵字直接留
  try {
    const x = new URL(u);
    return `${x.origin}${x.pathname}`.slice(0, 200);
  } catch {
    return u.slice(0, 60);
  }
}

// deno-lint-ignore no-explicit-any
function summarize(r: any) {
  return {
    page: stripUrl(r['document-uri'] ?? r.documentURL),
    directive: String(r['effective-directive'] ?? r.effectiveDirective ?? r['violated-directive'] ?? '').slice(0, 60),
    blocked: stripUrl(r['blocked-uri'] ?? r.blockedURL),
    source: stripUrl(r['source-file'] ?? r.sourceFile),
    line: r['line-number'] ?? r.lineNumber ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('not found', { status: 404, headers: corsHeaders });

  try {
    const text = await req.text();
    if (text.length > MAX_BODY) return new Response(null, { status: 413, headers: corsHeaders });
    const body = JSON.parse(text);
    // 舊格式（report-uri）：{ "csp-report": {...} }；新格式（Reporting API）：[{ type, body: {...} }, ...]
    const reports = Array.isArray(body)
      ? body.filter((x) => x?.type === 'csp-violation').map((x) => x.body)
      : [body?.['csp-report'] ?? body];
    for (const r of reports.slice(0, 20)) {
      if (r && typeof r === 'object') console.log(`CSP 違規 ${JSON.stringify(summarize(r))}`);
    }
  } catch {
    // 格式不對就忽略，不回錯誤細節
  }
  return new Response(null, { status: 204, headers: corsHeaders });
});
