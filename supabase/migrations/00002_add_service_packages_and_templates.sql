
-- ─── service_templates：服務項目預設 ─────────────────────────────────────────
CREATE TABLE public.service_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  name        text NOT NULL,
  duration_minutes int NOT NULL DEFAULT 60,
  default_amount   numeric(10,2) NOT NULL DEFAULT 0,
  color       text NOT NULL DEFAULT '#e8789a',
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.service_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner full access service_templates" ON public.service_templates
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- ─── service_packages：套票/儲值卡 ───────────────────────────────────────────
CREATE TYPE public.package_type AS ENUM ('session', 'stored_value');

CREATE TABLE public.service_packages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  customer_id     uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  package_type    public.package_type NOT NULL DEFAULT 'session',
  name            text NOT NULL,
  -- session 套票
  total_sessions  int,
  used_sessions   int NOT NULL DEFAULT 0,
  -- 儲值卡
  initial_amount  numeric(10,2),
  remaining_amount numeric(10,2),
  -- 共用
  purchase_date   date NOT NULL DEFAULT CURRENT_DATE,
  expire_date     date,
  notes           text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.service_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner full access service_packages" ON public.service_packages
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- ─── package_transactions：套票使用記錄 ─────────────────────────────────────
CREATE TABLE public.package_transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  package_id      uuid NOT NULL REFERENCES public.service_packages(id) ON DELETE CASCADE,
  service_record_id uuid REFERENCES public.service_records(id) ON DELETE SET NULL,
  sessions_used   int NOT NULL DEFAULT 0,
  amount_deducted numeric(10,2) NOT NULL DEFAULT 0,
  note            text,
  used_at         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.package_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner full access package_transactions" ON public.package_transactions
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- ─── RPC：原子扣次/扣款 ──────────────────────────────────────────────────────
-- 扣套票次數
CREATE OR REPLACE FUNCTION public.use_package_session(
  p_package_id uuid,
  p_sessions   int DEFAULT 1,
  p_note       text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  pkg service_packages%ROWTYPE;
BEGIN
  SELECT * INTO pkg FROM service_packages WHERE id = p_package_id AND owner_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '套票不存在'; END IF;
  IF pkg.package_type != 'session' THEN RAISE EXCEPTION '此套票非次數型'; END IF;
  IF (pkg.used_sessions + p_sessions) > pkg.total_sessions THEN RAISE EXCEPTION '剩餘次數不足'; END IF;
  UPDATE service_packages SET used_sessions = used_sessions + p_sessions WHERE id = p_package_id;
  INSERT INTO package_transactions(package_id, sessions_used, amount_deducted, note)
    VALUES (p_package_id, p_sessions, 0, p_note);
  -- 若用完則自動標記非啟用
  UPDATE service_packages SET is_active = false
    WHERE id = p_package_id AND used_sessions >= total_sessions;
END;
$$;

-- 扣儲值金額
CREATE OR REPLACE FUNCTION public.use_package_amount(
  p_package_id uuid,
  p_amount     numeric,
  p_note       text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  pkg service_packages%ROWTYPE;
BEGIN
  SELECT * INTO pkg FROM service_packages WHERE id = p_package_id AND owner_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '儲值卡不存在'; END IF;
  IF pkg.package_type != 'stored_value' THEN RAISE EXCEPTION '此套票非儲值型'; END IF;
  IF pkg.remaining_amount < p_amount THEN RAISE EXCEPTION '儲值餘額不足'; END IF;
  UPDATE service_packages SET remaining_amount = remaining_amount - p_amount WHERE id = p_package_id;
  INSERT INTO package_transactions(package_id, sessions_used, amount_deducted, note)
    VALUES (p_package_id, 0, p_amount, p_note);
  UPDATE service_packages SET is_active = false
    WHERE id = p_package_id AND remaining_amount <= 0;
END;
$$;
