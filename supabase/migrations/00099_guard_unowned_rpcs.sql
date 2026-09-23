-- 00099：兩支「特權函式」補上身分檢查（2026-09-23 安全審查，報告之外多查到的）
--
-- 這兩支函式都是 SECURITY DEFINER（用資料庫最高權限跑），但函式裡完全沒檢查「是誰在呼叫」，
-- 而且 Postgres 預設把執行權給 PUBLIC，所以連未登入的人只要知道 ID 就能：
--   - deduct_product_stock：把任何店家任何一項保養品的庫存扣到 0
--   - increment_coupon_issued：把任何店家任何一張優惠券的「已發行數」灌爆，讓券看起來發完了
-- 不會外洩個資，但是資料完整性的洞。修法：加上「只能動自己店的」＋收回未登入者的執行權。
--
-- 呼叫端：deduct_product_stock 只在老闆／員工記帳（新增服務記錄）時呼叫，用 COALESCE(員工所屬店, 自己)
--   同時涵蓋老闆與員工；increment_coupon_issued 只在老闆發券時呼叫（員工永遠不能碰優惠券），只認老闆。
--
-- 驗證：
--   select proname, has_function_privilege('anon', oid, 'EXECUTE') as anon,
--          has_function_privilege('authenticated', oid, 'EXECUTE') as logged_in
--   from pg_proc where proname in ('deduct_product_stock','increment_coupon_issued');
--   預期：兩支都 anon=false、logged_in=true。

CREATE OR REPLACE FUNCTION public.deduct_product_stock(p_id uuid, qty integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_stock integer;
  actual_deduct integer;
BEGIN
  SELECT stock INTO current_stock
  FROM public.products
  WHERE id = p_id
    AND owner_id = COALESCE(public.staff_shop_owner_id(), auth.uid())
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '找不到這項保養品，或沒有權限' USING ERRCODE = '42501';
  END IF;
  actual_deduct := LEAST(qty, current_stock);
  UPDATE public.products SET stock = stock - actual_deduct WHERE id = p_id;
  RETURN actual_deduct;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.deduct_product_stock(uuid, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.deduct_product_stock(uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.increment_coupon_issued(coupon_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.coupons
  SET issued = issued + 1
  WHERE id = coupon_id AND owner_id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.increment_coupon_issued(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.increment_coupon_issued(uuid) TO authenticated;
