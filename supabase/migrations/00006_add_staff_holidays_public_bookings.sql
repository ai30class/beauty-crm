
-- ─── 服務人員 ───────────────────────────────────────────────────────────────
CREATE TABLE staff (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL DEFAULT auth.uid(),
  name        text NOT NULL,
  role        text NOT NULL DEFAULT 'therapist',
  color       text NOT NULL DEFAULT '#e8789a',
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_owner_all"   ON staff FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "staff_customer_select" ON staff FOR SELECT TO anon USING (is_active = true);

-- ─── 公休 / 特殊關閉日 ──────────────────────────────────────────────────────
CREATE TABLE holidays (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL DEFAULT auth.uid(),
  holiday_date date NOT NULL,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, holiday_date)
);
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "holidays_owner_all"     ON holidays FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "holidays_anon_select"   ON holidays FOR SELECT TO anon USING (true);

-- ─── 線上訂單（顧客自助預約 + LINE Pay 訂金）─────────────────────────────
CREATE TABLE online_orders (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id            uuid NOT NULL,
  customer_name       text NOT NULL,
  customer_phone      text NOT NULL,
  customer_user_id    uuid,
  staff_id            uuid REFERENCES staff(id) ON DELETE SET NULL,
  service_template_id uuid REFERENCES service_templates(id) ON DELETE SET NULL,
  service_name        text NOT NULL,
  duration_minutes    int  NOT NULL DEFAULT 60,
  total_amount        numeric(10,2) NOT NULL,
  deposit_amount      numeric(10,2) NOT NULL,
  appointment_time    timestamptz NOT NULL,
  end_time            timestamptz NOT NULL,
  notes               text,
  status              text NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment','paid','confirmed','completed','cancelled','refunded')),
  line_pay_transaction_id text,
  line_pay_order_id       text UNIQUE,
  line_pay_payment_url    text,
  line_pay_paid_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE online_orders ENABLE ROW LEVEL SECURITY;
-- 老闆可讀寫全部
CREATE POLICY "online_orders_owner_all" ON online_orders FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
-- 顧客可建立（anon 也可，owner_id 由 Edge Function 填入）
CREATE POLICY "online_orders_anon_insert" ON online_orders FOR INSERT TO anon WITH CHECK (true);
-- 顧客憑 line_pay_order_id 查自己的訂單
CREATE POLICY "online_orders_anon_select" ON online_orders FOR SELECT TO anon
  USING (true);

-- ─── 老闆資訊（對外開放讓顧客查詢可預約服務）────────────────────────────
-- 用 staff 表的 owner_id 即可對應。service_templates 已有 owner_id。
-- 新增「公開設定」欄位：允許線上預約、每次休息時間
ALTER TABLE service_templates
  ADD COLUMN IF NOT EXISTS allow_online_booking boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS break_after_minutes  int     NOT NULL DEFAULT 30;
