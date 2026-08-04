
-- 用戶角色枚舉
CREATE TYPE public.user_role AS ENUM ('user', 'admin');

-- 用戶資料表
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone text,
  display_name text,
  role public.user_role NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 新用戶自動建立 profile
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, phone, role)
  VALUES (NEW.id, NEW.phone, 'user'::public.user_role);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- 顧客資料表
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL,
  birthday date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 服務記錄表
CREATE TABLE public.service_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  service_name text NOT NULL,
  amount numeric(10,2) NOT NULL CHECK (amount >= 0),
  service_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 預約資料表
CREATE TABLE public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  appointment_time timestamptz NOT NULL,
  reminder_minutes int NOT NULL DEFAULT 30,
  notes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 支出記錄表
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  description text NOT NULL,
  amount numeric(10,2) NOT NULL CHECK (amount >= 0),
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- updated_at 觸發器
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- Helper 函數（避免遞迴）
CREATE OR REPLACE FUNCTION get_user_role(uid uuid)
RETURNS user_role LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM profiles WHERE id = uid;
$$;

-- profiles RLS
CREATE POLICY "用戶查看自己的 profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "用戶更新自己的 profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (role IS NOT DISTINCT FROM get_user_role(auth.uid()));
CREATE POLICY "Admin 全權訪問 profiles" ON public.profiles FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'admin'::user_role);

-- customers RLS
CREATE POLICY "用戶查看自己的顧客" ON public.customers FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "用戶新增顧客" ON public.customers FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "用戶更新自己的顧客" ON public.customers FOR UPDATE TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "用戶刪除自己的顧客" ON public.customers FOR DELETE TO authenticated USING (auth.uid() = owner_id);

-- service_records RLS
CREATE POLICY "用戶查看自己的服務記錄" ON public.service_records FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "用戶新增服務記錄" ON public.service_records FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "用戶更新服務記錄" ON public.service_records FOR UPDATE TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "用戶刪除服務記錄" ON public.service_records FOR DELETE TO authenticated USING (auth.uid() = owner_id);

-- appointments RLS
CREATE POLICY "用戶查看自己的預約" ON public.appointments FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "用戶新增預約" ON public.appointments FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "用戶更新預約" ON public.appointments FOR UPDATE TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "用戶刪除預約" ON public.appointments FOR DELETE TO authenticated USING (auth.uid() = owner_id);

-- expenses RLS
CREATE POLICY "用戶查看自己的支出" ON public.expenses FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "用戶新增支出" ON public.expenses FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "用戶更新支出" ON public.expenses FOR UPDATE TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "用戶刪除支出" ON public.expenses FOR DELETE TO authenticated USING (auth.uid() = owner_id);
