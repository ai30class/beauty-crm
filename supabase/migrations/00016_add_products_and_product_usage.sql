
-- ── products 保養品表 ────────────────────────────────────────────────
CREATE TABLE products (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid NOT NULL DEFAULT auth.uid(),
  name          text NOT NULL,
  spec          text NOT NULL DEFAULT '',
  cost_price    numeric NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  sell_price    numeric NOT NULL DEFAULT 0 CHECK (sell_price >= 0),
  stock         integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  safety_stock  integer NOT NULL DEFAULT 0 CHECK (safety_stock >= 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, name)
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- authenticated：僅能存取自己的品項
CREATE POLICY "products_owner_all" ON products
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- anon：完全無權限（不建立任何政策）

-- ── product_usage 服務使用明細表 ─────────────────────────────────────
CREATE TABLE product_usage (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id          uuid NOT NULL DEFAULT auth.uid(),
  service_record_id uuid NOT NULL REFERENCES service_records(id) ON DELETE CASCADE,
  product_id        uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity          integer NOT NULL CHECK (quantity > 0),
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE product_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_usage_owner_all" ON product_usage
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- ── 原子扣庫存 RPC ────────────────────────────────────────────────────
-- 回傳實際扣減量（可能 < qty，若庫存不足則扣到 0）
CREATE OR REPLACE FUNCTION deduct_product_stock(p_id uuid, qty integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_stock integer;
  actual_deduct integer;
BEGIN
  SELECT stock INTO current_stock FROM products WHERE id = p_id FOR UPDATE;
  actual_deduct := LEAST(qty, current_stock);
  UPDATE products SET stock = stock - actual_deduct WHERE id = p_id;
  RETURN actual_deduct;
END;
$$;

-- ── 補貨 RPC ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION restock_product(p_id uuid, qty integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE products SET stock = stock + qty WHERE id = p_id AND owner_id = auth.uid();
END;
$$;
