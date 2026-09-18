-- 員工登入帳號：新增第三種 account_type='staff'，可登入但權限受限（跟商家帳號不一樣）。
-- 一個 staff 登入帳號對應 profiles 一列，記錄「屬於哪家店（staff_owner_id）」「對應 staff 表哪一筆（staff_id）」。
--
-- 權限分三層：
--   1) 基本層（不可關）：全店排班/預約/預留時間可看可改；建立新顧客／用電話查既有顧客（查不到瀏覽全部）；
--      建立/修改自己的服務記錄；唯讀自己的業績/抽成階梯/獎金/月薪快照；唯讀店家資訊/公休日/服務項目/
--      全店封鎖時段（排班會用到，但不能改）；同店其他員工的姓名/顏色/在職狀態（排班表要顯示，走專門
--      函式只回傳這幾欄，不開放 staff 表原始列——那一列還有 commission_rate/base_salary 等同事不該
--      互相看到的欄位）。
--   2) 開關層（預設關閉，商家在員工管理頁自行開）：can_manage_customers（顧客管理頁完整瀏覽/編輯，
--      但刪除永遠不開放）、can_manage_pricing（服務項目與定價的新增/編輯/刪除）、
--      can_manage_shop_settings（營業時間/公休日/全店封鎖時段的新增/編輯/刪除）。
--   3) 永遠鎖住（沒有開關）：財務報表（支出、月營收/支出總表）、其他員工的業績/抽成/底薪/月薪、
--      員工管理本身（新增/刪除員工、設定權限開關）、商家帳號審核/SaaS 條款等平台層級項目、顧客刪除。
--
-- 順手補一個既有安全缺口（見下方「1b」）：profiles.account_type 原本沒被「用戶更新自己的
-- profile」policy 保護，任何登入帳號理論上能自己改自己的 account_type；這次新增的
-- staff_owner_id/staff_id 如果也不保護，等於任何人能自己給自己開別人家店的員工權限。
-- 這次一併鎖住。

-- ── 1) profiles：account_type 加入 'staff'，新增歸屬欄位 ──────────────────────
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_account_type_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_account_type_check CHECK (account_type IN ('merchant','customer','staff'));
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS staff_owner_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS staff_id uuid REFERENCES public.staff(id) ON DELETE CASCADE;

-- handle_new_user 觸發器：staff 帳號由 Edge Function 用 Admin API 建立時，
-- 會在 user_metadata 帶 account_type='staff'、staff_owner_id、staff_id，這裡一併寫入 profiles。
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, phone, role, account_type, staff_owner_id, staff_id)
  VALUES (
    NEW.id,
    NEW.phone,
    'user'::public.user_role,
    COALESCE(NEW.raw_user_meta_data->>'account_type', 'merchant'),
    NULLIF(NEW.raw_user_meta_data->>'staff_owner_id', '')::uuid,
    NULLIF(NEW.raw_user_meta_data->>'staff_id', '')::uuid
  );
  RETURN NEW;
END;
$$;

-- ── 1b) 安全修補：鎖住 profiles 的 account_type／staff_owner_id／staff_id，不讓用戶自己改 ──
-- 原本「用戶更新自己的 profile」policy 的 WITH CHECK 只保護 role 欄位不能自己改，
-- 完全沒保護 account_type（這是既有缺口，這次一併補）——這次新增的 staff_owner_id／
-- staff_id 如果也不保護，任何登入帳號都能自己把 profile 改成
-- account_type='staff' + staff_owner_id=<任一店家 owner_id>，等於自己給自己開一把
-- 別人家的員工權限，完全繞過商家邀請機制。用跟 role 保護一樣的手法（比對 SELECT 出來的
-- 舊值，SECURITY DEFINER 函式避免遞迴），一起鎖住這三欄，只有 handle_new_user 觸發器
-- （建帳號當下）或後續專門的 Edge Function／RPC 才能寫入。
CREATE OR REPLACE FUNCTION public.get_user_account_type(uid uuid) RETURNS text
  LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT account_type FROM public.profiles WHERE id = uid;
$$;

CREATE OR REPLACE FUNCTION public.get_user_staff_owner_id(uid uuid) RETURNS uuid
  LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT staff_owner_id FROM public.profiles WHERE id = uid;
$$;

CREATE OR REPLACE FUNCTION public.get_user_staff_id(uid uuid) RETURNS uuid
  LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT staff_id FROM public.profiles WHERE id = uid;
$$;

DROP POLICY IF EXISTS "用戶更新自己的 profile" ON public.profiles;
CREATE POLICY "用戶更新自己的 profile" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    role IS NOT DISTINCT FROM get_user_role(auth.uid())
    AND account_type IS NOT DISTINCT FROM get_user_account_type(auth.uid())
    AND staff_owner_id IS NOT DISTINCT FROM get_user_staff_owner_id(auth.uid())
    AND staff_id IS NOT DISTINCT FROM get_user_staff_id(auth.uid())
  );

-- ── 2) staff：權限開關欄位，預設全部關閉 ──────────────────────────────────────
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS can_manage_customers     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_pricing       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_shop_settings boolean NOT NULL DEFAULT false;

-- ── 3) Helper 函式（SECURITY DEFINER，集中判斷邏輯，RLS policy 都呼叫這幾個，不各自重複寫）──
CREATE OR REPLACE FUNCTION public.staff_shop_owner_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT staff_owner_id FROM public.profiles
  WHERE id = auth.uid() AND account_type = 'staff'
$$;

CREATE OR REPLACE FUNCTION public.staff_own_staff_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT staff_id FROM public.profiles
  WHERE id = auth.uid() AND account_type = 'staff'
$$;

CREATE OR REPLACE FUNCTION public.staff_can_manage_customers() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(s.can_manage_customers, false)
  FROM public.profiles p JOIN public.staff s ON s.id = p.staff_id
  WHERE p.id = auth.uid() AND p.account_type = 'staff'
$$;

CREATE OR REPLACE FUNCTION public.staff_can_manage_pricing() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(s.can_manage_pricing, false)
  FROM public.profiles p JOIN public.staff s ON s.id = p.staff_id
  WHERE p.id = auth.uid() AND p.account_type = 'staff'
$$;

CREATE OR REPLACE FUNCTION public.staff_can_manage_shop_settings() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(s.can_manage_shop_settings, false)
  FROM public.profiles p JOIN public.staff s ON s.id = p.staff_id
  WHERE p.id = auth.uid() AND p.account_type = 'staff'
$$;

-- 顧客電話/LINE 這種「同一列裡有些欄位能看、有些不能看」，RLS 只能整列擋，沒辦法只擋欄位，
-- 所以「查有沒有這個顧客」用專門函式只回傳 id/name，不是開放整張表的 SELECT。
-- COALESCE(staff_shop_owner_id(), auth.uid())：商家自己呼叫也能用同一個函式（此時走 auth.uid() 分支）。
CREATE OR REPLACE FUNCTION public.search_customer_by_phone(p_phone text) RETURNS TABLE(id uuid, name text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.name FROM public.customers c
  WHERE c.phone = p_phone
    AND c.owner_id = COALESCE(public.staff_shop_owner_id(), auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.get_customer_name(p_customer_id uuid) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.name FROM public.customers c
  WHERE c.id = p_customer_id
    AND c.owner_id = COALESCE(public.staff_shop_owner_id(), auth.uid())
$$;

-- 同店員工名單也是同一個問題：staff 表本身有 commission_rate/base_salary/can_manage_*
-- 這些不該讓同事互相看到的欄位，不能直接開 SELECT policy（會整列一起開放）。
-- 排班表需要顯示「這個顏色/這個名字是誰」，所以另外開一個只回傳安全欄位的函式。
CREATE OR REPLACE FUNCTION public.get_shop_staff_roster() RETURNS TABLE(id uuid, name text, color text, is_active boolean)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.name, s.color, s.is_active FROM public.staff s
  WHERE s.owner_id = COALESCE(public.staff_shop_owner_id(), auth.uid())
$$;

-- ── 4) RLS：基本層（不可關）──────────────────────────────────────────────────

-- 排班/預約：全店可看可改
CREATE POLICY "staff_appointments_all" ON public.appointments FOR ALL TO authenticated
  USING (owner_id = public.staff_shop_owner_id())
  WITH CHECK (owner_id = public.staff_shop_owner_id());

-- 預留時間：全店可看可改
CREATE POLICY "staff_reserved_slots_all" ON public.staff_reserved_slots FOR ALL TO authenticated
  USING (owner_id = public.staff_shop_owner_id())
  WITH CHECK (owner_id = public.staff_shop_owner_id());

-- 公休日：唯讀
CREATE POLICY "staff_view_holidays" ON public.holidays FOR SELECT TO authenticated
  USING (owner_id = public.staff_shop_owner_id());

-- 服務項目：唯讀（排預約要知道服務名稱/時長）
CREATE POLICY "staff_view_service_templates" ON public.service_templates FOR SELECT TO authenticated
  USING (owner_id = public.staff_shop_owner_id());

-- 店家資訊：唯讀
CREATE POLICY "staff_view_shop_profiles" ON public.shop_profiles FOR SELECT TO authenticated
  USING (owner_id = public.staff_shop_owner_id());

-- 全店封鎖時段：唯讀（排班要知道哪些時段不能約）
CREATE POLICY "staff_view_shop_blocked_slots" ON public.shop_blocked_slots FOR SELECT TO authenticated
  USING (owner_id = public.staff_shop_owner_id());

-- 顧客：只能新增（現場建新顧客掛預約），不能瀏覽既有顧客列表／看電話
CREATE POLICY "staff_insert_customers" ON public.customers FOR INSERT TO authenticated
  WITH CHECK (owner_id = public.staff_shop_owner_id());

-- 服務記錄：只能建立/修改自己（staff_id = 自己）的紀錄，不能動別人的
CREATE POLICY "staff_manage_own_service_records" ON public.service_records FOR ALL TO authenticated
  USING (owner_id = public.staff_shop_owner_id() AND staff_id = public.staff_own_staff_id())
  WITH CHECK (owner_id = public.staff_shop_owner_id() AND staff_id = public.staff_own_staff_id());

-- 自己的業績相關數字：唯讀，且只能看自己那筆
CREATE POLICY "staff_view_own_commission_tiers" ON public.staff_commission_tiers FOR SELECT TO authenticated
  USING (staff_id = public.staff_own_staff_id());

CREATE POLICY "staff_view_own_bonuses" ON public.staff_bonuses FOR SELECT TO authenticated
  USING (staff_id = public.staff_own_staff_id());

CREATE POLICY "staff_view_own_payroll_records" ON public.payroll_records FOR SELECT TO authenticated
  USING (staff_id = public.staff_own_staff_id());

-- ── 5) RLS：開關層（預設關閉，看 staff.can_manage_* 欄位）─────────────────────

-- 顧客管理：瀏覽全部＋編輯既有資料（刻意沒有 DELETE policy，刪除永遠只有商家能做）
CREATE POLICY "staff_manage_customers_select" ON public.customers FOR SELECT TO authenticated
  USING (owner_id = public.staff_shop_owner_id() AND public.staff_can_manage_customers());

CREATE POLICY "staff_manage_customers_update" ON public.customers FOR UPDATE TO authenticated
  USING (owner_id = public.staff_shop_owner_id() AND public.staff_can_manage_customers())
  WITH CHECK (owner_id = public.staff_shop_owner_id() AND public.staff_can_manage_customers());

-- 服務項目與定價：新增/編輯/刪除
CREATE POLICY "staff_manage_service_templates" ON public.service_templates FOR ALL TO authenticated
  USING (owner_id = public.staff_shop_owner_id() AND public.staff_can_manage_pricing())
  WITH CHECK (owner_id = public.staff_shop_owner_id() AND public.staff_can_manage_pricing());

-- 店家設定：營業時間等（shop_profiles 只有 UPDATE，沒有 INSERT/DELETE 需求，一店一列）
CREATE POLICY "staff_manage_shop_profiles" ON public.shop_profiles FOR UPDATE TO authenticated
  USING (owner_id = public.staff_shop_owner_id() AND public.staff_can_manage_shop_settings())
  WITH CHECK (owner_id = public.staff_shop_owner_id() AND public.staff_can_manage_shop_settings());

-- 公休日：新增/刪除
CREATE POLICY "staff_manage_holidays" ON public.holidays FOR ALL TO authenticated
  USING (owner_id = public.staff_shop_owner_id() AND public.staff_can_manage_shop_settings())
  WITH CHECK (owner_id = public.staff_shop_owner_id() AND public.staff_can_manage_shop_settings());

-- 全店封鎖時段：新增/編輯/刪除
CREATE POLICY "staff_manage_shop_blocked_slots" ON public.shop_blocked_slots FOR ALL TO authenticated
  USING (owner_id = public.staff_shop_owner_id() AND public.staff_can_manage_shop_settings())
  WITH CHECK (owner_id = public.staff_shop_owner_id() AND public.staff_can_manage_shop_settings());

-- ── 刻意不動的表（維持只有商家能存取，沒有幫 staff 加任何 policy）──────────────
-- expenses（支出）、staff 表本身完全沒有 staff 角色可用的 policy（連 SELECT 都沒有，
-- 同店員工名單改走 get_shop_staff_roster() 這個安全函式，見上方）、staff 的
-- INSERT/UPDATE/DELETE（新增/刪除員工、改權限開關本身，只有商家能做）、
-- staff_commission_tiers/staff_bonuses/payroll_records 的寫入與「非自己」的讀取、
-- monthly_income_summary/monthly_expense_summary 報表 view、signup_requests、
-- merchant_terms 相關欄位、customers 的 DELETE。
