-- 商家/顧客帳號沒有角色區分：兩者共用同一張 auth.users，純粹靠「從哪個
-- 網址登入」決定畫面，導致任何登入過的帳號（不管是商家還是顧客）直接
-- 打開商家後台網址都能進去（雖然 RLS 讓顧客帳號在裡面只會看到空資料，
-- 不是外洩，但商家自己測顧客流程時，帳號會被誤記成自己是顧客）。
-- 加一個 account_type 欄位，signUp 時依走的流程正確標記，之後在
-- (app) layout 那層擋掉 account_type = 'customer' 的帳號。
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'merchant'
  CHECK (account_type IN ('merchant', 'customer'));

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, phone, role, account_type)
  VALUES (
    NEW.id,
    NEW.phone,
    'user'::public.user_role,
    COALESCE(NEW.raw_user_meta_data->>'account_type', 'merchant')
  );
  RETURN NEW;
END;
$$;

-- 回填這次測試期間已經建立、實際上是顧客用途的帳號
-- （曾建立過線上訂單、但從未擁有過任何商家資料的帳號）
UPDATE public.profiles
SET account_type = 'customer'
WHERE id IN (SELECT DISTINCT customer_user_id FROM public.online_orders WHERE customer_user_id IS NOT NULL)
  AND id NOT IN (SELECT owner_id FROM public.shop_profiles)
  AND id NOT IN (SELECT owner_id FROM public.staff);
