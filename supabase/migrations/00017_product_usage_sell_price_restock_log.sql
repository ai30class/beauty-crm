-- 1. product_usage 補充銷售金額快照欄位
ALTER TABLE product_usage
  ADD COLUMN IF NOT EXISTS sell_price numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sell_amount numeric(10,2) GENERATED ALWAYS AS (sell_price * quantity) STORED;

-- 2. 補貨記錄表
CREATE TABLE IF NOT EXISTS restock_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id   uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  qty          integer NOT NULL CHECK (qty > 0),
  cost_total   numeric(10,2) NOT NULL DEFAULT 0,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE restock_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_no_access_restock_log" ON restock_log
  FOR ALL TO anon USING (false);

CREATE POLICY "auth_own_restock_log" ON restock_log
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());