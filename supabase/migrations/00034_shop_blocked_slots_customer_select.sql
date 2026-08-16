-- 同一輪 RLS 排查漏掉的一張表：shop_blocked_slots（全店封閉時段，例如午休）
-- 只有 authenticated 店家本人的管理規則，沒有給顧客的 SELECT 規則。
-- getAvailableSlots() 顧客登入後查詢這張表會被 RLS 擋下、靜默回傳空陣列，
-- 導致店家設定的封閉時段（午休等）對線上預約完全不生效，顧客能訂進休息時段。
-- 比照 holidays/staff/service_templates 的做法補上顧客可讀規則，
-- 時段起訖時間本身不是敏感資料，開放讀取沒有外洩疑慮。
CREATE POLICY "shop_blocked_slots_customer_select" ON "public"."shop_blocked_slots"
  FOR SELECT TO "authenticated"
  USING (true);
