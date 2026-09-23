-- 00097：服務記錄施術前後照片改為進階版功能
--
-- 背景（Emma 9/23 定案）：施術前後照片會佔用 Storage 空間（每張服務記錄最多 2 張），
-- 基礎版不再提供這個功能，只有進階版才能用。跟 line_reminders_enabled（00089）
-- 同一種「每家店一個開關」做法，但這次預設值不同：所有店（含既有的椏椏、卡奇雅、
-- 暢貨）一律先預設關閉，改成由 Emma 手動一家一家打開，不是像 LINE 提醒那樣「既有
-- 的店維持開」——因為這次是要先幫 Emma 把關，不是延續既有行為。
--
-- ⚠️ 順序：先執行這份 migration，程式碼才有欄位可讀；程式碼 push 後，這個欄位關閉的店
--    點「施術前」「施術後」會跳出「進階版功能」提示，不會真的開啟相機／相簿。
--
-- 之後要替某家店打開（或關閉）這個功能，在 SQL Editor 執行（用店名比對，不用記 UUID）：
--   update public.shop_profiles set service_photos_enabled = true  where shop_name = '椏椏眉睫藝術';
--   update public.shop_profiles set service_photos_enabled = false where shop_name = '椏椏眉睫藝術';
--
-- 已知限制（跟「刪除密碼」「LINE 提醒開關」同等級，是商務開關、不是資安防線）：
-- 店家對自己那一列有更新權限，技術上能用開發者工具自己改成 true；資料庫層級的
-- INSERT／UPDATE 沒有另外擋，只有前端在點按鈕的當下檢查。等真的需要更硬的防線
-- （例如付費店家變多、有人真的繞過）再補資料庫層級的擋法。

ALTER TABLE public.shop_profiles
  ADD COLUMN IF NOT EXISTS service_photos_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.shop_profiles.service_photos_enabled IS
  '是否允許這家店在服務記錄使用施術前後照片。進階版功能，由平台管理者手動逐店開啟；所有店（含既有店家）預設關閉。';
