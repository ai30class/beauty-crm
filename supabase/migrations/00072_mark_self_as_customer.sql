-- migration 00068 把 profiles.account_type 鎖成「用戶自己不能改」（防止有人自己把帳號改成
-- 員工去偷別家店的權限），但 Google／Facebook 顧客註冊流程（google-callback／facebook-callback）
-- 原本就是「註冊完再用一行 UPDATE 把預設的 merchant 改成 customer」，這行從此被擋、而且程式沒檢查
-- 結果，等於 9/17 之後用 Google／Facebook 註冊的新顧客帳號會一直停在 merchant，
-- 顧客端的服務項目 RLS 只放行 account_type='customer'，於是看到「目前無開放線上預約的服務」。
-- （LINE 註冊不受影響：line-login Edge Function 建帳號當下就在 metadata 帶 customer。）
--
-- 修法：新增一個專用函式，只允許「把自己從 merchant 改成 customer」，而且只限於
-- 還沒有任何店家資料（shop_profiles／staff）的帳號，不能用來動別人、也不能把真正的商家改成顧客。
CREATE OR REPLACE FUNCTION public.mark_self_as_customer() RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.profiles
  SET account_type = 'customer'
  WHERE id = auth.uid()
    AND account_type = 'merchant'
    AND NOT EXISTS (SELECT 1 FROM public.shop_profiles s WHERE s.owner_id = auth.uid())
    AND NOT EXISTS (SELECT 1 FROM public.staff st WHERE st.owner_id = auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.mark_self_as_customer() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_self_as_customer() TO authenticated;
