-- 允許匿名訪客依 owner_id 讀取商家公開資訊（線上預約頁使用）
CREATE POLICY "public read shop profile by owner"
  ON shop_profiles FOR SELECT
  TO anon
  USING (true);