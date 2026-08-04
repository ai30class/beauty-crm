-- 商家基本資訊表
CREATE TABLE IF NOT EXISTS shop_profiles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shop_name    text NOT NULL DEFAULT '',
  phone        text NOT NULL DEFAULT '',
  address      text NOT NULL DEFAULT '',
  description  text NOT NULL DEFAULT '',
  -- business_hours: { mon:{open:bool,start:"09:00",end:"18:00"}, tue:{...}, ... }
  business_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id)
);

-- 自動更新 updated_at
CREATE OR REPLACE FUNCTION update_shop_profiles_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER shop_profiles_updated_at
  BEFORE UPDATE ON shop_profiles
  FOR EACH ROW EXECUTE FUNCTION update_shop_profiles_updated_at();

-- RLS
ALTER TABLE shop_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner can manage own profile"
  ON shop_profiles FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());