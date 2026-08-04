
-- 允許匿名顧客讀取開放線上預約的服務項目
CREATE POLICY "anon can read online booking services"
  ON service_templates
  FOR SELECT
  TO anon
  USING (allow_online_booking = true);

-- 允許匿名顧客讀取在職員工（用於選人員步驟）
CREATE POLICY "anon can read active staff"
  ON staff
  FOR SELECT
  TO anon
  USING (is_active = true);

-- 允許匿名顧客讀取公休日（用於日期選擇）
CREATE POLICY "anon can read holidays"
  ON holidays
  FOR SELECT
  TO anon
  USING (true);
