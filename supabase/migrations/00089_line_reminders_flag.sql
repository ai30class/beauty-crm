-- 00089：每家店一個「LINE 自動提醒」開關
--
-- 背景（Emma 9/21 深夜定案）：基礎版是「自助開通、不含 LINE 自動推播」，前一天提醒與生日祝福
-- 只有進階版才有。但 LINE 提醒是所有店家共用同一個官方小帳號的訊息額度（輕用量每月 200 則），
-- 而程式原本對所有店全開——試用店家的顧客只要用 LINE 登入並加好友，就會吃掉共用額度。
--
-- 做法：
--   ① shop_profiles 新增 line_reminders_enabled。
--   ② 「現在已經存在的店」全部維持 true（椏椏、卡奇雅、暢貨等，行為完全不變）；
--      「之後新增的店」預設 false，等升級進階版、由 Emma 手動打開。
--   ③ send-reminders Edge Function 只對 line_reminders_enabled = true 的店發前一天提醒、
--      快到了提醒與生日祝福（匯款逾期自動取消與 LINE 無關，不受影響）。
--
-- ⚠️ 順序：先執行這份 migration，再到 Supabase Dashboard 重新部署 send-reminders。
--    反過來的話，新版函式讀不到這個欄位，會當成「全部沒開」而停發椏椏的提醒。
--
-- 之後要替某家店打開（或關閉）LINE 提醒，在 SQL Editor 執行：
--   update public.shop_profiles set line_reminders_enabled = true  where owner_id = '<店家 ID>';
--   update public.shop_profiles set line_reminders_enabled = false where owner_id = '<店家 ID>';
--
-- 已知限制（跟「刪除密碼」同等級，是商務開關、不是資安防線）：店家對自己那一列有更新權限，
-- 技術上能用開發者工具自己改成 true。目前只有一家店在用，等付費店家變多再用觸發器鎖住。

-- 第一次執行：既有的列會拿到預設值 true（現有的店維持開）
ALTER TABLE public.shop_profiles
  ADD COLUMN IF NOT EXISTS line_reminders_enabled boolean NOT NULL DEFAULT true;

-- 之後新增的店一律預設關閉（重複執行這份檔案不會把已經打開的店關掉）
ALTER TABLE public.shop_profiles
  ALTER COLUMN line_reminders_enabled SET DEFAULT false;

COMMENT ON COLUMN public.shop_profiles.line_reminders_enabled IS
  '是否對這家店的顧客發送 LINE 自動提醒（前一天提醒、快到了提醒、生日祝福）。進階版才開，由平台管理者手動設定；新增的店預設 false。';
