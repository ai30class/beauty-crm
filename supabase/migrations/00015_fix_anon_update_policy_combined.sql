
-- 移除衝突的兩條政策，改為一條統一的寬鬆政策
-- RLS PERMISSIVE 是 OR，兩條共存時 WITH CHECK 取聯集（任一通過即可），不會衝突
-- 但為避免邏輯混亂，改為一條：anon 可以修改任何 confirmed/pending 狀態的訂單
-- 應用層（前端）負責控制只允許改哪些欄位
DROP POLICY IF EXISTS "anon can update online order details" ON online_orders;
DROP POLICY IF EXISTS "anon can cancel online order" ON online_orders;

-- 統一政策：anon 可更新「進行中」的訂單（confirmed / pending）
-- 允許修改為：status = 'cancelled' 或保持原狀態（修改時間/備註時 status 不變）
CREATE POLICY "anon can update active online order"
  ON online_orders
  FOR UPDATE
  TO anon
  USING (status IN ('confirmed', 'pending'))
  WITH CHECK (status IN ('confirmed', 'pending', 'cancelled'));
