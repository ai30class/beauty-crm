-- Emma 確認顧客權限要拆成兩層，不是「瀏覽+編輯」綁在一起：
--   一般員工（不開任何開關）：只能新建顧客、用電話查既有顧客（baseline，migration 00068 已有）
--   店長（開 can_view_customers）：可以瀏覽完整顧客名單（含電話）
--   編輯既有顧客資料：不管一般員工還是店長，一律不開放，只有商家能改
-- 原本 can_manage_customers 這個開關是「瀏覽+編輯」合一，不符合這個要求，拆掉重做。

-- 1) 新欄位，把舊欄位的值搬過去（語意上比較接近「瀏覽」，保留 Emma 已經測試設定的狀態）
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS can_view_customers boolean NOT NULL DEFAULT false;

UPDATE public.staff SET can_view_customers = can_manage_customers;

-- 2) 拿掉舊的 policy／函式／欄位（順序：policy → 函式 → 欄位，不然會因為依賴關係擋掉）
DROP POLICY IF EXISTS "staff_manage_customers_select" ON public.customers;
DROP POLICY IF EXISTS "staff_manage_customers_update" ON public.customers;
DROP FUNCTION IF EXISTS public.staff_can_manage_customers();
ALTER TABLE public.staff DROP COLUMN IF EXISTS can_manage_customers;

-- 3) 新函式／policy：只有 SELECT，沒有 UPDATE——編輯顧客資料完全不開放給員工角色，
--    不管開不開「瀏覽」這個開關都一樣，只有商家（owner_all policy）能改。
CREATE OR REPLACE FUNCTION public.staff_can_view_customers() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(s.can_view_customers, false)
  FROM public.profiles p JOIN public.staff s ON s.id = p.staff_id
  WHERE p.id = auth.uid() AND p.account_type = 'staff'
$$;

CREATE POLICY "staff_view_customers_select" ON public.customers FOR SELECT TO authenticated
  USING (owner_id = public.staff_shop_owner_id() AND public.staff_can_view_customers());
