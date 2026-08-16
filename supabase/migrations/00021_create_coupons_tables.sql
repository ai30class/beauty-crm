-- 優惠券主表
CREATE TABLE coupons (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL DEFAULT auth.uid(),
  name        text NOT NULL,
  type        text NOT NULL CHECK (type IN ('discount_pct', 'discount_amt', 'free_service')),
  value       numeric NOT NULL DEFAULT 0,   -- 折扣%（0~100）或折抵金額
  min_amount  numeric NOT NULL DEFAULT 0,   -- 最低消費門檻
  quota       integer,                      -- null = 無限量
  issued      integer NOT NULL DEFAULT 0,   -- 已發行數
  valid_days  integer NOT NULL DEFAULT 90,  -- 有效天數（從發行日起算）
  note        text NOT NULL DEFAULT '',
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 顧客持有的優惠券
CREATE TABLE customer_coupons (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid NOT NULL DEFAULT auth.uid(),
  coupon_id    uuid NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  customer_id  uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  customer_name text NOT NULL DEFAULT '',
  customer_phone text NOT NULL DEFAULT '',
  expire_date  date NOT NULL,
  used_at      timestamptz,
  used_amount  numeric,                     -- 實際折抵金額（記錄用）
  is_used      boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner manages coupons"
  ON coupons FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY "owner manages customer_coupons"
  ON customer_coupons FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());